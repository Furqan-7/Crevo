import { prisma } from "db";
import { googleFetch } from "../../lib/google";
import { ingestMessage } from "../inbox.ingest";

// Gmail: pulls new inbox mail into Crevo, and saves approved replies as
// Gmail drafts in the right thread. Crevo never sends mail itself.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const FIRST_SYNC_DAYS = 7;
const MAX_PER_SYNC = 40;

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
}

const header = (m: GmailMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

export function parseAddress(value: string): { name: string; address: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1]!.trim() || match[2]!.trim(), address: match[2]!.trim() };
  return { name: value.trim(), address: value.trim() };
}

export function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The plain-text body (or the HTML one, stripped), without quoted history.
export function bodyText(part: GmailPart | undefined): string {
  const find = (p: GmailPart | undefined, type: string): string | null => {
    if (!p) return null;
    if (p.mimeType === type && p.body?.data && !p.filename) return decode(p.body.data);
    for (const child of p.parts ?? []) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  const text = plain ?? (find(part, "text/html") ? htmlToText(find(part, "text/html")!) : "");
  // Cut the quoted reply chain ("On Mon, … wrote:") and anything after.
  const cut = text.search(/\n(On .{5,120}wrote:|-{2,} ?Original Message ?-{2,}|From: .+\nSent: )/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

export async function syncGmail(userId: string): Promise<number> {
  const account = await prisma.connectedAccount.findUnique({ where: { profileId_provider: { profileId: userId, provider: "gmail" } } });
  const profile = await googleFetch<{ emailAddress: string }>(userId, `${API}/profile`);
  const since = account?.syncCursor ? Number(account.syncCursor) : Date.now() - FIRST_SYNC_DAYS * 86_400_000;
  const q = `in:inbox -from:me after:${Math.floor(since / 1000) - 60}`;

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await googleFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      userId,
      `${API}/messages?${new URLSearchParams({ q, maxResults: "20", ...(pageToken ? { pageToken } : {}) })}`,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX_PER_SYNC);

  let newest = since;
  let added = 0;
  for (const id of ids.slice(0, MAX_PER_SYNC)) {
    const m = await googleFetch<GmailMessage>(userId, `${API}/messages/${id}?format=full`);
    newest = Math.max(newest, Number(m.internalDate));
    const from = parseAddress(header(m, "From"));
    if (from.address.toLowerCase() === profile.emailAddress.toLowerCase()) continue;
    const created = await ingestMessage(userId, {
      source: "gmail",
      externalId: m.id,
      threadId: m.threadId,
      fromName: from.name,
      fromAddress: from.address,
      subject: header(m, "Subject"),
      body: bodyText(m.payload) || m.snippet || "",
      receivedAt: new Date(Number(m.internalDate)),
    });
    if (created) added++;
  }

  await prisma.connectedAccount.update({
    where: { profileId_provider: { profileId: userId, provider: "gmail" } },
    data: { syncCursor: String(newest), syncedAt: new Date(), lastError: null, externalId: profile.emailAddress },
  });
  return added;
}

// An RFC 2822 reply, base64url-encoded, as the Gmail API wants it.
export function replyMime(opts: { to: string; subject: string; inReplyTo: string; text: string }) {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const encodedSubject = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.text.replace(/\n/g, "\r\n")).toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function saveGmailDraft(userId: string, messageId: string) {
  const message = await prisma.message.findFirst({ where: { id: messageId, profileId: userId } });
  if (!message || message.source !== "gmail" || !message.externalId || !message.approvedReply || message.replyExternalId) return;
  const original = await googleFetch<GmailMessage>(userId, `${API}/messages/${message.externalId}?format=metadata&metadataHeaders=Message-ID`);
  const draft = await googleFetch<{ id: string }>(userId, `${API}/drafts`, {
    method: "POST",
    body: { message: { threadId: message.threadId ?? original.threadId, raw: replyMime({ to: message.fromAddress, subject: message.subject, inReplyTo: header(original, "Message-ID"), text: message.approvedReply }) } },
  });
  await prisma.message.update({ where: { id: message.id }, data: { replyExternalId: draft.id } });
}
