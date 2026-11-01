import { prisma } from "db";
import { features } from "../config/env";
import { AiUnavailableError, runWithTools, type ChatTurn, type Tool } from "../lib/ai";
import type { CopilotAnswerDto } from "../types/api";
import { addDays, daysBetween, fromIsoDate, toIsoDate } from "../utils/dates";
import { clockFor } from "./clock.service";
import { describeHits, searchWorkspace } from "./rag.service";

// Copilot. With an AI key it is a model with tools: each tool is a query
// over the creator's own data (and search_workspace runs RAG over their
// messages, replies, contracts and transcripts), so answers come from the
// workspace rather than the model's memory. Without a key it still answers
// the four suggested questions straight from the data.

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayName = (d: Date) => DAY.format(d).replace(",", "");
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const score = (d: { healthFinancial: number; healthDeadline: number; healthContract: number; healthScope: number }) =>
  d.healthFinancial + d.healthDeadline + d.healthContract + d.healthScope;

// ── Data the tools (and the fallback answers) use ───────────────────────────

async function unpaidInvoices(userId: string, today: string) {
  const deals = await prisma.deal.findMany({ where: { profileId: userId, stage: "invoiced", paidAt: null }, orderBy: { invoiceDueDate: "asc" } });
  return deals.map((d) => ({
    brand: d.brand,
    campaign: d.campaign,
    amount: d.amount,
    invoiceNumber: d.invoiceNumber,
    dueDate: d.invoiceDueDate ? toIsoDate(d.invoiceDueDate) : null,
    daysLate: d.invoiceDueDate ? Math.max(0, daysBetween(toIsoDate(d.invoiceDueDate), today)) : 0,
    reminderDrafted: Boolean(d.reminderDraft),
  }));
}

async function dueItems(userId: string, today: string, days: number) {
  const from = fromIsoDate(today);
  const to = fromIsoDate(addDays(today, days - 1));
  const [deliverables, events, posts] = await Promise.all([
    prisma.deliverable.findMany({
      where: { done: false, dueDate: { gte: from, lte: to }, deal: { profileId: userId, stage: { not: "paid" } } },
      include: { deal: { select: { brand: true, campaign: true, slug: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.calendarEvent.findMany({ where: { profileId: userId, done: false, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    prisma.scheduledPost.findMany({
      where: { clip: { video: { profileId: userId } }, scheduledAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) } },
      include: { clip: { select: { short: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);
  return {
    deliverables: deliverables.map((d) => ({ brand: d.deal.brand, campaign: d.deal.campaign, title: d.title, dueDate: toIsoDate(d.dueDate) })),
    events: events.map((e) => ({ title: e.title, date: toIsoDate(e.date), type: e.type, tentative: e.tentative })),
    posts: posts.map((p) => ({ clip: p.clip.short, platform: p.platform, at: p.scheduledAt.toISOString(), status: p.status })),
  };
}

async function openDeals(userId: string) {
  const deals = await prisma.deal.findMany({
    where: { profileId: userId, stage: { in: ["new_offer", "negotiating", "in_production", "invoiced"] } },
    include: { risks: { orderBy: { position: "asc" } } },
  });
  return deals
    .map((d) => ({ slug: d.slug, brand: d.brand, campaign: d.campaign, stage: d.stage, fee: d.amount, dueDate: toIsoDate(d.dueDate), dealHealth: score(d), risks: d.risks.map((r) => ({ risk: r.title, fix: r.fix })) }))
    .sort((a, b) => a.dealHealth - b.dealHealth);
}

async function dealDetail(userId: string, slug: string) {
  const d = await prisma.deal.findUnique({
    where: { profileId_slug: { profileId: userId, slug } },
    include: { terms: { orderBy: { position: "asc" } }, risks: { orderBy: { position: "asc" } }, deliverables: { orderBy: { position: "asc" } } },
  });
  if (!d) return { error: "no deal with that slug" };
  return {
    brand: d.brand,
    campaign: d.campaign,
    stage: d.stage,
    fee: d.amount,
    dealHealth: { total: score(d), financial: d.healthFinancial, deadline: d.healthDeadline, contract: d.healthContract, scope: d.healthScope },
    terms: d.terms.map((t) => ({ term: t.label, value: t.value, clause: t.clause, missing: t.missing })),
    risks: d.risks.map((r) => ({ risk: r.title, fix: r.fix })),
    deliverables: d.deliverables.map((x) => ({ title: x.title, dueDate: toIsoDate(x.dueDate), done: x.done })),
  };
}

async function openIdeas(userId: string) {
  const ideas = await prisma.idea.findMany({ where: { profileId: userId }, include: { todo: { select: { id: true } } }, orderBy: { createdAt: "asc" } });
  return ideas.map((i) => ({ title: i.title, why: i.why, platforms: i.platforms, onTodayList: Boolean(i.todo) }));
}

async function inboxOverview(userId: string) {
  const messages = await prisma.message.findMany({
    where: { profileId: userId, archivedAt: null },
    select: { fromName: true, subject: true, category: true, approvedAt: true, draftReady: true, readAt: true, summary: true },
    orderBy: { receivedAt: "desc" },
    take: 30,
  });
  return messages.map((m) => ({ from: m.fromName, subject: m.subject, category: m.category, unread: !m.readAt, replyApproved: Boolean(m.approvedAt), draftReady: m.draftReady, summary: m.summary }));
}

function tools(userId: string, today: string): Tool[] {
  return [
    { name: "get_unpaid_invoices", description: "Invoices sent and not yet paid, with how many days late each is.", parameters: { type: "object", properties: {} }, run: () => unpaidInvoices(userId, today) },
    {
      name: "get_due_items",
      description: "Deal deliverables, calendar events and scheduled posts due from today over the next N days.",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How many days ahead, 1 to 60. Default 7." } } },
      run: (args) => dueItems(userId, today, Math.min(60, Math.max(1, Number(args.days) || 7))),
    },
    { name: "get_open_deals", description: "Open brand deals, lowest Deal Health first, with their risks.", parameters: { type: "object", properties: {} }, run: () => openDeals(userId) },
    {
      name: "get_deal",
      description: "One deal's terms, Deal Health breakdown, risks and deliverables. Use the slug from get_open_deals.",
      parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
      run: (args) => dealDetail(userId, String(args.slug ?? "")),
    },
    { name: "get_ideas", description: "Content ideas from the creator's audience, and whether each is on today's list.", parameters: { type: "object", properties: {} }, run: () => openIdeas(userId) },
    { name: "get_inbox", description: "The latest 30 inbox messages with category, read and reply status.", parameters: { type: "object", properties: {} }, run: () => inboxOverview(userId) },
    {
      name: "search_workspace",
      description: "Search the creator's messages, their own past replies, contracts and video transcripts. Use for what someone said, contract wording, or what was said in a video.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look for, in plain words." } }, required: ["query"] },
      run: async (args) => describeHits(userId, await searchWorkspace(userId, String(args.query ?? ""), { limit: 6 })),
    },
  ];
}

// ── Answers without a model ─────────────────────────────────────────────────

const INTENTS: { intent: "money" | "due" | "risk" | "next"; keywords: string[] }[] = [
  { intent: "money", keywords: ["owe", "money", "paid", "invoice", "payment"] },
  { intent: "due", keywords: ["due", "week", "deadline", "deliver"] },
  { intent: "risk", keywords: ["risk", "contract", "health"] },
  { intent: "next", keywords: ["post", "idea", "make", "film", "content"] },
];

async function ruleAnswer(userId: string, today: string, question: string): Promise<string> {
  const q = question.toLowerCase();
  const intent = INTENTS.find((i) => i.keywords.some((k) => q.includes(k)))?.intent;
  if (intent === "money") {
    const unpaid = await unpaidInvoices(userId, today);
    if (unpaid.length === 0) return "Nobody owes you money right now. Every invoiced deal is paid.";
    return unpaid
      .map((d) => {
        const when = !d.dueDate ? "" : d.daysLate > 0 ? ` It was due on ${dayName(fromIsoDate(d.dueDate))}, so it's ${d.daysLate} ${d.daysLate === 1 ? "day" : "days"} late.` : ` It's due on ${dayName(fromIsoDate(d.dueDate))}.`;
        return `${d.brand} owes you ${money(d.amount)} for the ${d.campaign}${d.invoiceNumber ? ` (invoice ${d.invoiceNumber})` : ""}.${when}${d.reminderDrafted ? " A polite reminder is drafted; open Brand deals to send it." : ""}`;
      })
      .join(" ");
  }
  if (intent === "due") {
    const { deliverables, events } = await dueItems(userId, today, 7);
    if (deliverables.length === 0 && events.length === 0) return "Nothing is due in the next seven days.";
    const parts: string[] = [];
    if (deliverables.length) parts.push(`Deliverables: ${list(deliverables.map((d) => `${d.brand} ${d.title} (${dayName(fromIsoDate(d.dueDate))})`))}.`);
    if (events.length) parts.push(`On your calendar: ${list(events.map((e) => `${e.title} (${dayName(fromIsoDate(e.date))})`))}.`);
    return parts.join(" ");
  }
  if (intent === "risk") {
    const deals = (await openDeals(userId)).filter((d) => d.stage !== "invoiced");
    if (deals.length === 0) return "You have no open deals to check.";
    const worst = deals[0]!;
    if (worst.risks.length === 0) return `Your open deals all look healthy. The lowest is ${worst.brand} at Deal Health ${worst.dealHealth}, with no risks flagged.`;
    return `The ${worst.brand} ${worst.campaign} deal (Deal Health ${worst.dealHealth}). ${worst.risks.length === 1 ? "Its risk" : "Its risks"}: ${list(worst.risks.map((r) => r.risk.toLowerCase()))}. To fix: ${worst.risks.map((r) => r.fix).join(" ")}`;
  }
  if (intent === "next") {
    const idea = (await openIdeas(userId)).find((i) => !i.onTodayList);
    if (!idea) return "Every idea is already on your to-do list. New ones arrive as your audience asks for them.";
    return `Next up: ${idea.title}. ${idea.why}, so it's the strongest idea on your list. Add it to today from the Ideas card.`;
  }
  return "I can answer questions about money you're owed, what's due this week, your riskiest deal and what to post next. Try one of the suggestions below.";
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function askCopilot(userId: string, question: string, history: ChatTurn[] = []): Promise<CopilotAnswerDto> {
  const { today, tz } = await clockFor(userId);
  if (!features.ai) return { question, answer: await ruleAnswer(userId, today, question) };

  const system = [
    "You are Copilot inside Crevo, an assistant for a content creator's business: brand deals, invoices, deadlines, inbox, posts and ideas.",
    `Today is ${dayName(fromIsoDate(today))} ${today.slice(0, 4)} (${today}) in the creator's time zone, ${tz}.`,
    "Answer only from what the tools return. Call the tools you need before answering; if they don't have it, say you couldn't find it in the workspace.",
    "Be brief and specific: name brands, amounts, dates and what to do next. Two to four sentences unless asked for more. Plain text, no markdown headings.",
    "You can't send, post or book anything. Point to the screen where the creator can do it (Inbox, Brand deals, Publish, Calendar).",
  ].join("\n");
  try {
    const answer = await runWithTools({ system, turns: [...history.slice(-8), { role: "user", text: question }], tools: tools(userId, today) });
    return { question, answer };
  } catch (err) {
    // The model is down: the data-backed answers still work.
    if (err instanceof AiUnavailableError) return { question, answer: await ruleAnswer(userId, today, question) };
    throw err;
  }
}
