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

const hhmm = (m: number | null) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

// The to-do list: open items (any date) and what was done recently.
async function todoList(userId: string, today: string) {
  const todos = await prisma.todo.findMany({
    where: { profileId: userId, OR: [{ done: false }, { dueDate: { gte: fromIsoDate(addDays(today, -7)) } }] },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { dueMinutes: "asc" }],
    take: 100,
  });
  return todos.map((t) => ({ title: t.title, detail: t.detail || null, dueDate: toIsoDate(t.dueDate), time: hhmm(t.dueMinutes), done: t.done, dueToday: toIsoDate(t.dueDate) === today, overdue: !t.done && toIsoDate(t.dueDate) < today }));
}

// Everything on the calendar between two dates (past or future): events
// (including ones synced from Google Calendar), deal deliverables and posts.
async function calendarRange(userId: string, from: string, to: string) {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  const [events, deliverables, posts] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { profileId: userId, date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { startMinutes: "asc" }], take: 200 }),
    prisma.deliverable.findMany({
      where: { dueDate: { gte: start, lte: end }, deal: { profileId: userId } },
      include: { deal: { select: { brand: true, campaign: true } } },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
    prisma.scheduledPost.findMany({
      where: { clip: { video: { profileId: userId } }, scheduledAt: { gte: start, lt: new Date(end.getTime() + 86_400_000) } },
      include: { clip: { select: { short: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),
  ]);
  return {
    from,
    to,
    events: events.map((e) => ({ title: e.title, date: toIsoDate(e.date), start: hhmm(e.startMinutes), end: hhmm(e.endMinutes), type: e.type, detail: e.detail, tentative: e.tentative, done: e.done, fromGoogleCalendar: e.source !== "crevo" })),
    deliverables: deliverables.map((d) => ({ brand: d.deal.brand, campaign: d.deal.campaign, title: d.title, dueDate: toIsoDate(d.dueDate), done: d.done })),
    posts: posts.map((p) => ({ clip: p.clip.short, platform: p.platform, at: p.scheduledAt.toISOString(), status: p.status })),
  };
}

// Every deal, finished and paid ones included, optionally for one brand.
async function allDeals(userId: string, brand?: string) {
  const deals = await prisma.deal.findMany({
    where: { profileId: userId, ...(brand ? { brand: { contains: brand, mode: "insensitive" } } : {}) },
    include: { deliverables: { orderBy: { position: "asc" } } },
    orderBy: { dueDate: "desc" },
    take: 100,
  });
  return deals.map((d) => ({
    slug: d.slug,
    brand: d.brand,
    campaign: d.campaign,
    stage: d.stage,
    fee: d.amount,
    dueDate: toIsoDate(d.dueDate),
    dealHealth: score(d),
    invoiceNumber: d.invoiceNumber,
    invoiceDueDate: d.invoiceDueDate ? toIsoDate(d.invoiceDueDate) : null,
    paidOn: d.paidAt ? toIsoDate(d.paidAt) : null,
    deliverables: d.deliverables.map((x) => ({ title: x.title, dueDate: toIsoDate(x.dueDate), done: x.done })),
  }));
}

// Deals, to-dos and calendar events whose names match the query's words.
// They aren't text documents, so they're matched by name next to the RAG
// search over messages, replies, contracts and transcripts.
async function matchRecords(userId: string, query: string) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}#$.]{3,}/gu) ?? [])].filter((w) => !STOP.has(w)).slice(0, 6);
  if (words.length === 0) return [];
  const any = (fields: string[]) => words.flatMap((w) => fields.map((f) => ({ [f]: { contains: w, mode: "insensitive" as const } })));
  const [deals, todos, events] = await Promise.all([
    prisma.deal.findMany({ where: { profileId: userId, OR: any(["brand", "campaign", "invoiceNumber"]) }, take: 5 }),
    prisma.todo.findMany({ where: { profileId: userId, OR: any(["title", "detail"]) }, orderBy: { dueDate: "desc" }, take: 5 }),
    prisma.calendarEvent.findMany({ where: { profileId: userId, OR: any(["title", "detail"]) }, orderBy: { date: "desc" }, take: 5 }),
  ]);
  return [
    ...deals.map((d) => `Brand deal: ${d.brand} · ${d.campaign}, $${d.amount}, stage ${d.stage}, due ${toIsoDate(d.dueDate)}${d.invoiceNumber ? `, invoice ${d.invoiceNumber}` : ""}${d.paidAt ? `, paid ${toIsoDate(d.paidAt)}` : ""} (slug ${d.slug})`),
    ...todos.map((t) => `To-do: ${t.title}${t.detail ? ` (${t.detail})` : ""}, due ${toIsoDate(t.dueDate)}${t.done ? ", done" : ""}`),
    ...events.map((e) => `Calendar: ${e.title} on ${toIsoDate(e.date)}${e.startMinutes != null ? ` at ${hhmm(e.startMinutes)}` : ""}${e.detail ? ` (${e.detail})` : ""}`),
  ];
}
const STOP = new Set(["the", "and", "for", "with", "what", "when", "where", "who", "how", "about", "from", "that", "this", "have", "has", "did", "does", "any", "all", "are", "was", "were", "you", "your", "my", "me", "deal", "deals", "brand", "todo", "todos", "calendar", "event", "events"]);

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
    { name: "get_inbox", description: "The latest 30 inbox messages with sender, subject, category, summary, read and reply status.", parameters: { type: "object", properties: {} }, run: () => inboxOverview(userId) },
    { name: "get_todos", description: "The creator's to-do list: every open item (with due date, time and whether it's overdue) and items done in the last week.", parameters: { type: "object", properties: {} }, run: () => todoList(userId, today) },
    {
      name: "get_calendar",
      description: "Everything on the calendar between two dates, past or future: events (including Google Calendar ones), deal deliverables and scheduled posts. Dates are YYYY-MM-DD.",
      parameters: { type: "object", properties: { from: { type: "string", description: "First day, YYYY-MM-DD. Default today." }, to: { type: "string", description: "Last day, YYYY-MM-DD. Default 7 days after from." } } },
      run: (args) => {
        const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
        const from = iso(args.from) ?? today;
        let to = iso(args.to) ?? addDays(from, 6);
        if (to < from) to = from;
        if (daysBetween(from, to) > 92) to = addDays(from, 92);
        return calendarRange(userId, from, to);
      },
    },
    {
      name: "get_all_deals",
      description: "Every brand deal including finished and paid ones, with fee, stage, invoice, paid date and deliverables. Optionally only one brand.",
      parameters: { type: "object", properties: { brand: { type: "string", description: "Brand name to filter by (optional)." } } },
      run: (args) => allDeals(userId, typeof args.brand === "string" && args.brand.trim() ? args.brand.trim() : undefined),
    },
    {
      name: "search_workspace",
      description: "Search the whole workspace by meaning and by name: messages, the creator's past replies, contracts, video transcripts, plus brand deals, to-dos and calendar events. Use for what someone said, contract wording, what was said in a video, or to find a deal, task or event by name.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look for, in plain words." } }, required: ["query"] },
      run: async (args) => {
        const query = String(args.query ?? "");
        const [hits, records] = await Promise.all([searchWorkspace(userId, query, { limit: 6 }).then((h) => describeHits(userId, h)), matchRecords(userId, query)]);
        return { records, text: hits };
      },
    },
  ];
}

// ── Answers without a model ─────────────────────────────────────────────────

type Intent = "money" | "todo" | "calendar" | "due" | "risk" | "deals" | "inbox" | "next";
const INTENTS: { intent: Intent; keywords: string[] }[] = [
  { intent: "money", keywords: ["owe", "money", "paid", "invoice", "payment"] },
  { intent: "todo", keywords: ["to-do", "todo", "to do", "task", "checklist"] },
  { intent: "calendar", keywords: ["calendar", "schedule", "event", "meeting", "agenda"] },
  { intent: "due", keywords: ["due", "week", "deadline", "deliver"] },
  { intent: "risk", keywords: ["risk", "contract", "health"] },
  { intent: "deals", keywords: ["deal", "brand", "sponsor", "campaign"] },
  { intent: "inbox", keywords: ["inbox", "email", "mail", "message", "unread", "reply", "dm"] },
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
  if (intent === "todo") {
    const onlyToday = /\btoday\b/.test(q);
    const open = (await todoList(userId, today)).filter((t) => !t.done && (!onlyToday || t.dueDate <= today));
    if (open.length === 0) return onlyToday ? "Nothing on your to-do list for today." : "Your to-do list is clear.";
    const late = open.filter((t) => t.overdue).length;
    return `You have ${open.length} open ${open.length === 1 ? "to-do" : "to-dos"}${late ? `, ${late} overdue` : ""}: ${list(open.slice(0, 6).map((t) => `${t.title} (${dayName(fromIsoDate(t.dueDate))}${t.time ? ` ${t.time}` : ""})`))}${open.length > 6 ? ", and more on the Today screen" : ""}.`;
  }
  if (intent === "calendar") {
    const { events, deliverables, posts } = await calendarRange(userId, today, addDays(today, 6));
    const items = [
      ...events.filter((e) => !e.done).map((e) => ({ date: e.date, text: `${e.title}${e.start ? ` at ${e.start}` : ""}` })),
      ...deliverables.filter((d) => !d.done).map((d) => ({ date: d.dueDate, text: `${d.brand} ${d.title} due` })),
      ...posts.map((p) => ({ date: p.at.slice(0, 10), text: `${p.clip} on ${p.platform}` })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    if (items.length === 0) return "Your calendar is clear for the next seven days.";
    return `Next seven days: ${list(items.slice(0, 8).map((i) => `${i.text} (${dayName(fromIsoDate(i.date))})`))}${items.length > 8 ? ", and more on the Calendar screen" : ""}.`;
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
  if (intent === "deals") {
    const deals = await openDeals(userId);
    if (deals.length === 0) return "You have no open brand deals right now.";
    return `You have ${deals.length} open ${deals.length === 1 ? "deal" : "deals"}: ${list(deals.map((d) => `${d.brand} ${d.campaign} (${money(d.fee)}, ${d.stage.replace(/_/g, " ")})`))}.`;
  }
  if (intent === "inbox") {
    const messages = await inboxOverview(userId);
    const unread = messages.filter((m) => m.unread);
    const waiting = messages.filter((m) => m.draftReady && !m.replyApproved && m.category !== "spam");
    if (messages.length === 0) return "Your inbox is empty.";
    return `${unread.length} unread ${unread.length === 1 ? "message" : "messages"}${unread.length ? ` (${list(unread.slice(0, 4).map((m) => `${m.from}: ${m.subject}`))})` : ""}, and ${waiting.length} ${waiting.length === 1 ? "reply" : "replies"} drafted and waiting for your approval in Inbox.`;
  }
  if (intent === "next") {
    const idea = (await openIdeas(userId)).find((i) => !i.onTodayList);
    if (!idea) return "Every idea is already on your to-do list. New ones arrive as your audience asks for them.";
    return `Next up: ${idea.title}. ${idea.why}, so it's the strongest idea on your list. Add it to today from the Ideas card.`;
  }
  return "I can answer questions about money you're owed, your to-do list, your calendar, what's due this week, your brand deals, your inbox and what to post next. Try one of the suggestions below.";
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function askCopilot(userId: string, question: string, history: ChatTurn[] = []): Promise<CopilotAnswerDto> {
  const { today, tz } = await clockFor(userId);
  if (!features.ai) return { question, answer: await ruleAnswer(userId, today, question) };

  const system = [
    "You are Copilot inside Crevo, an assistant for a content creator's business: brand deals, invoices, deadlines, inbox, to-do list, calendar, posts and ideas.",
    `Today is ${dayName(fromIsoDate(today))} ${today.slice(0, 4)} (${today}) in the creator's time zone, ${tz}.`,
    "Answer only from what the tools return. Call the tools you need before answering; if they don't have it, say you couldn't find it in the workspace.",
    "To-dos: get_todos. Calendar for any dates, past or future: get_calendar. Deals including finished or paid ones: get_all_deals. Open deals and risks: get_open_deals. Messages: get_inbox, and search_workspace for what was said.",
    `"Today" means items dated ${today}; also mention overdue items (dated before today and not done). Don't call later-dated items today's, and don't say items are done unless the tool says done: true.`,
    "Be brief and specific: name brands, amounts, dates and what to do next. Start with the answer itself, in one or two short sentences.",
    "Format: plain sentences. For three or more items, use a short list, one item per line starting with \"- \". You may bold a key name or amount with **double asterisks**, at most a few per answer. No headings, tables, code or other markdown.",
    "Write dates like \"Tue 3 Nov\" and times like \"5:00 pm\". Never show slugs, ids or field names.",
    "You can't send, post or book anything. Point to the screen where the creator can do it. The screens are exactly: Today (the daily briefing and to-do list), Inbox, Publish, Brand deals, Calendar, Analytics and Settings.",
  ].join("\n");
  try {
    const answer = await runWithTools({ system, turns: [...history.slice(-8), { role: "user", text: question }], tools: tools(userId, today), timeoutMs: 30_000 });
    return { question, answer };
  } catch (err) {
    // The model is down: the data-backed answers still work.
    if (err instanceof AiUnavailableError) return { question, answer: await ruleAnswer(userId, today, question) };
    throw err;
  }
}
