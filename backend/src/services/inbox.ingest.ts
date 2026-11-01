import { prisma, type MessageSource } from "db";
import { features } from "../config/env";
import { enqueue } from "../jobs/queue";
import { triage } from "./drafts.service";
import { indexSource, messageText } from "./rag.service";

// Adds a message from Gmail or YouTube to the inbox: sorts it, links it to
// a deal with the same brand, indexes it for search, raises a new-offer
// alert, and queues a reply draft when Settings › Replies allow it for the
// category. Already-seen messages (same provider id) are skipped.

export interface IncomingMessage {
  source: MessageSource;
  externalId: string;
  threadId: string | null;
  fromName: string;
  fromAddress: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

const COLORS = ["#181818", "#3d7a35", "#7b77e8", "#c99a00", "#d64535", "#2a6df4", "#1baf7a", "#eb6834"];
const colorFor = (s: string) => COLORS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]!;

// Up to 12 paragraphs; the key facts the model picked are wrapped in **bold**.
function paragraphs(body: string, keyFacts: string[]) {
  const paras = body
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((p) => p.slice(0, 1500));
  return paras.map((p) => keyFacts.reduce((acc, fact) => (fact && acc.includes(fact) && !acc.includes(`**${fact}**`) ? acc.replace(fact, `**${fact}**`) : acc), p));
}

export async function ingestMessage(userId: string, m: IncomingMessage): Promise<string | null> {
  const exists = await prisma.message.findUnique({ where: { profileId_source_externalId: { profileId: userId, source: m.source, externalId: m.externalId } }, select: { id: true } });
  if (exists) return null;

  const t = await triage({ fromName: m.fromName, fromAddress: m.fromAddress, subject: m.subject, body: m.body, source: m.source });
  const deal = t.brand
    ? await prisma.deal.findFirst({ where: { profileId: userId, brand: { equals: t.brand, mode: "insensitive" }, stage: { not: "paid" } }, select: { id: true } })
    : null;
  const body = paragraphs(m.body, t.keyFacts);
  const preview = m.body.replace(/\s+/g, " ").trim().slice(0, 160);
  const firstName = m.fromName.split(/[\s·@]+/).filter(Boolean)[0] ?? m.fromName;

  const message = await prisma.message.create({
    data: {
      profileId: userId,
      dealId: deal?.id,
      source: m.source,
      category: t.category,
      fromName: m.fromName.slice(0, 120),
      fromAddress: m.fromAddress.slice(0, 200),
      avatarInitial: (m.fromName.replace(/^@/, "").trim()[0] ?? "?").toUpperCase(),
      avatarColor: t.category === "spam" ? "#9a9a9a" : colorFor(m.fromAddress),
      subject: m.subject.slice(0, 300) || "(no subject)",
      preview,
      body: body.length ? body : [preview],
      senderSignOff: firstName,
      summary: t.summary || null,
      receivedAt: m.receivedAt,
      externalId: m.externalId,
      threadId: m.threadId,
    },
  });

  await indexSource(userId, "message", message.id, messageText(message));
  if (t.category === "brand_deal") {
    await prisma.alert.upsert({
      where: { profileId_dedupeKey: { profileId: userId, dedupeKey: `new_deal:${message.id}` } },
      create: { profileId: userId, dealId: deal?.id, kind: "new_deal", title: `New brand message from ${m.fromName}`, detail: t.summary || m.subject, href: `/dashboard/inbox?m=${message.id}`, createdAt: new Date(), dedupeKey: `new_deal:${message.id}` },
      update: {},
    });
  }
  if (features.ai && t.category !== "spam" && !t.needsDecision) {
    const { autoDraft } = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { autoDraft: true } });
    if (autoDraft.includes(t.category)) await enqueue("drafts.write", { messageId: message.id }, { profileId: userId, key: `drafts.write:${message.id}` });
  }
  return message.id;
}
