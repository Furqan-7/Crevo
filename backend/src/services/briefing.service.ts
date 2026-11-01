import { prisma } from "db";
import { env, features } from "../config/env";
import { briefingEmail, type BriefingContent, type BriefingSection } from "../email/briefing";
import { sendEmail } from "../lib/email";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, minutesNowIn, todayIn, toIsoDate } from "../utils/dates";
import { logger } from "../utils/logger";

// The morning briefing: built from the creator's workspace, previewed in
// Settings, and emailed once a day at their briefing time (the worker's
// scheduler checks every few minutes).

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace(",", "");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export async function buildContent(userId: string): Promise<{ content: BriefingContent; name: string; time: string; sections: BriefingSection[]; email: string }> {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });
  const today = todayIn(profile.timezone);
  const [messages, deals, todos, ideas] = await Promise.all([
    prisma.message.findMany({ where: { profileId: userId, archivedAt: null }, include: { drafts: { select: { id: true } } }, orderBy: { receivedAt: "desc" }, take: 200 }),
    prisma.deal.findMany({ where: { profileId: userId, stage: { not: "paid" } }, include: { messages: { select: { id: true }, take: 1 } } }),
    prisma.todo.findMany({ where: { profileId: userId, done: false, dueDate: { lte: new Date(`${addDays(today, 6)}T00:00:00Z`) } }, orderBy: [{ dueDate: "asc" }, { dueMinutes: "asc" }] }),
    prisma.idea.findMany({ where: { profileId: userId, todo: null }, orderBy: { createdAt: "asc" }, take: 3 }),
  ]);

  const overdue = deals.filter((d) => d.stage === "invoiced" && d.invoiceDueDate && toIsoDate(d.invoiceDueDate) < today);
  const reminderIds = new Set(overdue.flatMap((d) => d.messages.map((m) => m.id)));
  const needYou = deals.filter((d) => d.alertText || overdue.includes(d));
  const drafted = messages.filter((m) => m.drafts.length && m.draftReady && !m.approvedAt && m.category !== "spam" && !reminderIds.has(m.id));
  const count = (c: string) => messages.filter((m) => m.category === c).length;
  const health = (d: (typeof deals)[number]) => d.healthFinancial + d.healthDeadline + d.healthContract + d.healthScope;

  const content: BriefingContent = {
    label: dayLabel(today),
    summary: `${needYou.length} brand ${needYou.length === 1 ? "deal needs" : "deals need"} you and ${drafted.length + overdue.length} ${drafted.length + overdue.length === 1 ? "reply is" : "replies are"} drafted.`,
    messagesSorted: messages.length,
    counts: { collab: count("collab"), fan: count("fan_question"), spam: count("spam") },
    todos: todos.map((t) => ({
      title: t.title,
      detail: t.detail,
      when: toIsoDate(t.dueDate) === today ? (t.dueMinutes !== null ? `${Math.floor(t.dueMinutes / 60)}:${String(t.dueMinutes % 60).padStart(2, "0")}` : "Today") : dayLabel(toIsoDate(t.dueDate)).slice(0, 3),
    })),
    inbox: drafted.slice(0, 3).map((m) => ({ id: m.id, from: m.fromName, subject: m.subject })),
    ideas: ideas.map((i) => ({ title: i.title, why: i.why, platforms: i.platforms.map((p) => p[0]!.toUpperCase() + p.slice(1)) })),
    deals: needYou.map((d) => {
      const late = overdue.includes(d) ? daysBetween(toIsoDate(d.invoiceDueDate!), today) : 0;
      return {
        slug: d.slug,
        brand: d.brand,
        campaign: d.campaign,
        value: money(d.amount),
        detail: d.invoiceNumber ? `invoice ${d.invoiceNumber}` : `due ${dayLabel(toIsoDate(d.dueDate))}`,
        health: health(d),
        overdue: late > 0 ? { amount: money(d.amount), days: late } : undefined,
      };
    }),
  };
  return { content, name: profile.name.split(" ")[0] || "there", time: profile.briefingTime, sections: profile.briefingSections, email: profile.email };
}

export async function previewBriefing(userId: string, opts: { time?: string; name?: string; sections?: BriefingSection[] }) {
  const built = await buildContent(userId);
  return briefingEmail({ origin: env.appUrl, content: built.content, name: opts.name || built.name, time: opts.time ?? built.time, sections: opts.sections?.length ? opts.sections : built.sections });
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// Who is due a briefing now: switched on, past their local briefing time,
// and not yet sent today.
export async function dueBriefings(): Promise<string[]> {
  if (!features.email) return [];
  const profiles = await prisma.profile.findMany({ where: { briefingEmail: true, onboardedAt: { not: null } }, select: { id: true, timezone: true, briefingTime: true, briefingSentOn: true } });
  return profiles
    .filter((p) => {
      const today = todayIn(p.timezone);
      return minutesNowIn(p.timezone) >= minutesOf(p.briefingTime) && (!p.briefingSentOn || toIsoDate(p.briefingSentOn) < today);
    })
    .map((p) => p.id);
}

export async function sendBriefing(userId: string) {
  if (!features.email) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email isn't set up on this server yet.");
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, briefingSentOn: true, email: true, briefingEmail: true } });
  const today = todayIn(profile.timezone);
  if (!profile.briefingEmail || (profile.briefingSentOn && toIsoDate(profile.briefingSentOn) >= today) || !profile.email) return;
  const built = await buildContent(userId);
  const mail = briefingEmail({ origin: env.appUrl, content: built.content, name: built.name, time: built.time, sections: built.sections });
  await sendEmail({ to: profile.email, subject: mail.subject, html: mail.html, text: mail.text });
  await prisma.profile.update({ where: { id: userId }, data: { briefingSentOn: new Date(`${today}T00:00:00Z`) } });
  logger.info("briefing sent", { userId });
}
