// The morning briefing email. Plain tables and inline styles so it renders
// the same in Gmail, Apple Mail and Outlook; no web fonts, no CSS classes.
// Content is the creator's own workspace (services/briefing.service.ts);
// the same HTML is the Settings preview and the email that's sent.

export type BriefingSection = "todo" | "inbox" | "ideas" | "deals";

export interface BriefingContent {
  label: string;
  summary: string;
  messagesSorted: number;
  counts: { collab: number; fan: number; spam: number };
  todos: { title: string; detail: string; when: string }[];
  inbox: { id: string; from: string; subject: string }[];
  ideas: { title: string; why: string; platforms: string[] }[];
  deals: { slug: string; brand: string; campaign: string; value: string; detail: string; health: number; overdue?: { amount: string; days: number } }[];
}

export interface BriefingOptions {
  origin: string;
  content: BriefingContent;
  name?: string;
  time?: string;
  sections?: BriefingSection[];
}

const INK = "#181818";
const MUTED = "#686868";
const FAINT = "#8b8b8b";
const LINE = "#ededed";
const FONT = "Helvetica, Arial, sans-serif";
const MONO = "Menlo, Consolas, monospace";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function button(href: string, label: string, dark = true) {
  const bg = dark ? INK : "#ffffff";
  const fg = dark ? "#ffffff" : INK;
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${INK};border-radius:4px;padding:10px 18px;font:500 14px ${FONT};text-decoration:none">${esc(label)}</a>`;
}

function section(title: string, color: string, body: string) {
  return `
<tr><td style="padding:24px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px">
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${LINE};font:500 15px ${FONT};color:${INK}">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:8px;vertical-align:0"></span>${esc(title)}
    </td></tr>
    ${body}
  </table>
</td></tr>`;
}

function row(main: string, sub: string, right = "") {
  return `<tr><td style="padding:12px 18px;border-bottom:1px solid #f4f4f4">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:14px ${FONT};color:${INK}">${main}<div style="font:12.5px ${FONT};color:${FAINT};margin-top:3px">${sub}</div></td>
      ${right ? `<td align="right" style="padding-left:12px;white-space:nowrap;vertical-align:middle">${right}</td>` : ""}
    </tr></table>
  </td></tr>`;
}

export function briefingEmail({ origin, content, name = "there", time = "8:00", sections = ["todo", "inbox", "ideas", "deals"] }: BriefingOptions) {
  const { label, summary, messagesSorted, counts, inbox, ideas, deals } = content;
  const today = { label, summary };
  const url = (path: string) => `${origin}${path}`;
  const overdue = deals.find((d) => d.overdue);
  const open = content.todos;
  const drafted = inbox.length + (overdue ? 1 : 0);
  const preheader = summary;
  const link = (href: string, label: string) => `<a href="${href}" style="font:500 12.5px ${FONT};color:${INK}">${esc(label)} →</a>`;

  const parts: Record<BriefingSection, string> = {
    todo: section(
      "Today's to-do",
      "#2a6df4",
      open.map((t) => row(esc(t.title), esc(t.detail), `<span style="font:12px ${MONO};color:${MUTED}">${esc(t.when)}</span>`)).join(""),
    ),
    inbox: section(
      `Inbox: ${messagesSorted} sorted, ${inbox.length} replies drafted`,
      "#56c25a",
      inbox.map((m) => row(`<strong style="font-weight:600">${esc(m.from)}</strong>`, esc(m.subject), link(url(`/dashboard/inbox?m=${m.id}`), "Review"))).join("") +
        row(`<span style="color:${MUTED}">Also sorted</span>`, `${counts.collab} collabs · ${counts.fan} fan questions · ${counts.spam} spam filtered out`),
    ),
    ideas: section(
      `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} for today`,
      "#f4c430",
      ideas.map((i) => row(esc(i.title), `${esc(i.why)} · ${i.platforms.join(", ")}`)).join(""),
    ),
    deals: section(
      "Deals and payments",
      "#7b77e8",
      deals
        .map((d) =>
          d.overdue
            ? row(
                `${esc(d.brand)} · ${esc(d.campaign)}`,
                `<span style="color:#d64535">${esc(d.overdue.amount)} · ${d.overdue.days} days overdue</span> · reminder drafted`,
                button(url(`/dashboard/deals?deal=${d.slug}`), "Send reminder"),
              )
            : row(`${esc(d.brand)} · ${esc(d.campaign)}`, `${esc(d.value)} · ${esc(d.detail)} · Deal Health ${d.health}`, link(url(`/dashboard/deals?deal=${d.slug}`), "Open")),
        )
        .join(""),
    ),
  };

  const statCell = (value: string | number, label: string) =>
    `<td width="33%" style="padding:14px 16px;border-right:1px solid ${LINE}"><div style="font:500 26px ${FONT};color:${INK}">${value}</div><div style="font:12px ${FONT};color:${MUTED};margin-top:2px">${esc(label)}</div></td>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Your briefing · ${esc(today.label)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px">
  <tr><td style="padding:22px 32px;border-bottom:1px solid ${LINE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:700 15px ${FONT};letter-spacing:-0.5px;color:${INK}">CREVO</td>
      <td align="right" style="font:12px ${MONO};color:${MUTED}">[ ${esc(today.label)} · ${esc(time)} am ]</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 32px 0;background:#eef3f9">
    <div style="font:600 28px ${FONT};letter-spacing:-0.8px;color:${INK}">Good morning, ${esc(name)}</div>
    <div style="font:15px/1.5 ${FONT};color:#2b2b2b;margin-top:8px;padding-bottom:22px">${esc(today.summary)}</div>
  </td></tr>
  <tr><td style="padding:0 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-top:0;border-radius:0 0 10px 10px"><tr>
      ${statCell(messagesSorted, "messages sorted")}
      ${statCell(drafted, "replies drafted")}
      ${statCell(deals.length, "deals need you").replace(`border-right:1px solid ${LINE}`, "")}
    </tr></table>
  </td></tr>
  ${sections.map((s) => parts[s]).join("")}
  <tr><td align="center" style="padding:28px 32px">
    ${button(url("/dashboard"), "Open your briefing")}
    <div style="font:12.5px ${FONT};color:${MUTED};margin-top:12px">Nothing is sent, posted or booked until you approve it.</div>
  </td></tr>
  <tr><td style="padding:18px 32px;border-top:1px solid ${LINE};font:12px/1.5 ${FONT};color:${FAINT}">
    You get this every day at ${esc(time)} am.
    <a href="${url("/dashboard/settings?tab=briefing")}" style="color:${MUTED}">Change the time or sections</a> ·
    <a href="${url("/dashboard/settings?tab=briefing")}" style="color:${MUTED}">Turn off the email</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Good morning, ${name} — ${today.label}`,
    today.summary,
    "",
    ...(sections.includes("todo") ? ["TODAY'S TO-DO", ...open.map((t) => `- ${t.title} (${t.when})`), ""] : []),
    ...(sections.includes("inbox") ? ["INBOX", ...inbox.map((m) => `- ${m.from}: ${m.subject}`), ""] : []),
    ...(sections.includes("ideas") ? ["IDEAS", ...ideas.map((i) => `- ${i.title}`), ""] : []),
    ...(sections.includes("deals") ? ["DEALS", ...deals.map((d) => `- ${d.brand}: ${d.overdue ? `${d.overdue.amount} overdue` : d.value}`), ""] : []),
    `Open your briefing: ${url("/dashboard")}`,
    `Change or turn off this email: ${url("/dashboard/settings?tab=briefing")}`,
  ].join("\n");

  return { subject: `Your briefing: ${drafted} ${drafted === 1 ? "reply" : "replies"} drafted${overdue ? `, ${overdue.overdue!.amount} overdue` : ""}`, preheader, html, text };
}
