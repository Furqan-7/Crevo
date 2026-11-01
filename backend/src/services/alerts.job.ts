import { prisma } from "db";
import { addDays, daysBetween, fromIsoDate, todayIn, toIsoDate, weekStartIso } from "../utils/dates";

// Raises the alerts the bell shows, from the workspace's own data. Each
// has a dedupe key, so running this every hour never doubles one up.

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export async function generateAlerts(userId: string) {
  const { timezone } = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = todayIn(timezone);
  const tomorrow = addDays(today, 1);
  const raise = (dedupeKey: string, data: { kind: "overdue" | "deadline" | "weekly"; title: string; detail: string; href: string; dealId?: string }) =>
    prisma.alert.upsert({ where: { profileId_dedupeKey: { profileId: userId, dedupeKey } }, create: { profileId: userId, dedupeKey, createdAt: new Date(), ...data }, update: {} });

  // Invoices past their due date.
  const overdue = await prisma.deal.findMany({ where: { profileId: userId, stage: "invoiced", paidAt: null, invoiceDueDate: { lt: fromIsoDate(today) } } });
  for (const d of overdue) {
    const days = daysBetween(toIsoDate(d.invoiceDueDate!), today);
    await raise(`overdue:${d.id}`, {
      kind: "overdue",
      dealId: d.id,
      title: `${d.brand}'s payment is ${days} ${days === 1 ? "day" : "days"} overdue`,
      detail: `${money(d.amount)}${d.invoiceNumber ? ` · invoice ${d.invoiceNumber}` : ""}.${d.reminderDraft ? " A polite reminder is drafted." : ""}`,
      href: `/dashboard/deals?deal=${d.slug}`,
    });
  }

  // Deliverables due tomorrow.
  const due = await prisma.deliverable.findMany({
    where: { done: false, dueDate: fromIsoDate(tomorrow), deal: { profileId: userId, stage: { not: "paid" } } },
    include: { deal: { select: { id: true, brand: true, campaign: true, inCalendar: true } } },
  });
  for (const item of due) {
    await raise(`deadline:${item.id}`, {
      kind: "deadline",
      dealId: item.deal.id,
      title: `${item.deal.brand} ${item.title.split(":")[0]} is due tomorrow`,
      detail: `${DAY.format(fromIsoDate(tomorrow)).replace(",", "")} · ${item.deal.campaign}${item.deal.inCalendar ? "" : " · not in your calendar yet"}`,
      href: `/dashboard/calendar?date=${tomorrow}`,
    });
  }

  // The weekly summary, on Sundays, for the week just ending.
  if (fromIsoDate(today).getUTCDay() === 0) {
    const monday = weekStartIso(today);
    const from = fromIsoDate(monday);
    const [paid, posts, approved] = await Promise.all([
      prisma.deal.aggregate({ where: { profileId: userId, paidAt: { gte: from } }, _sum: { amount: true } }),
      prisma.scheduledPost.count({ where: { clip: { video: { profileId: userId } }, status: "published", publishedAt: { gte: from } } }),
      prisma.message.aggregate({ where: { profileId: userId, approvedAt: { gte: from } }, _sum: { minutesSaved: true } }),
    ]);
    const hours = Math.round(((approved._sum.minutesSaved ?? 0) / 60) * 10) / 10;
    await raise(`weekly:${monday}`, {
      kind: "weekly",
      title: `Your week: ${money(paid._sum.amount ?? 0)} in, ${posts} ${posts === 1 ? "post" : "posts"} out`,
      detail: `${hours}h saved on replies`,
      href: "/dashboard/analytics?range=7",
    });
  }
}
