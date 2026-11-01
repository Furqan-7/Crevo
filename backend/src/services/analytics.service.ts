import { prisma } from "db";
import type { AnalyticsDayDto, AnalyticsDto, Channel } from "../types/api";
import { addDays, fromIsoDate, toIsoDate } from "../utils/dates";
import { clockFor } from "./clock.service";

const MONTHS_SHOWN = 6;
const zero = (): Record<Channel, number> => ({ youtube: 0, instagram: 0, tiktok: 0 });

export async function getAnalytics(userId: string, range: number): Promise<AnalyticsDto> {
  const { today } = await clockFor(userId);
  const from = addDays(today, -(range * 2 - 1));
  const firstMonth = fromIsoDate(`${today.slice(0, 7)}-01`);
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - (MONTHS_SHOWN - 1));

  const [rows, posts, paid, owed] = await Promise.all([
    prisma.channelDay.findMany({
      where: { profileId: userId, date: { gte: fromIsoDate(from), lte: fromIsoDate(today) } },
      orderBy: { date: "asc" },
    }),
    prisma.contentPost.findMany({ where: { profileId: userId }, orderBy: { views: "desc" }, take: 20 }),
    prisma.deal.findMany({ where: { profileId: userId, paidAt: { gte: firstMonth } }, select: { amount: true, paidAt: true } }),
    prisma.deal.findMany({
      where: { profileId: userId, stage: "invoiced", paidAt: null, invoiceDueDate: { gte: firstMonth } },
      select: { amount: true, invoiceDueDate: true },
    }),
  ]);

  const byDate = new Map<string, AnalyticsDayDto>();
  for (const row of rows) {
    const date = toIsoDate(row.date);
    const day = byDate.get(date) ?? { date, views: zero(), followers: zero(), watchMinutes: 0 };
    day.views[row.channel] = row.views;
    day.followers[row.channel] = row.followers;
    day.watchMinutes += row.watchMinutes ?? 0;
    byDate.set(date, day);
  }

  const revenue = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const d = new Date(firstMonth);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { month: toIsoDate(d).slice(0, 7), paid: 0, owed: 0 };
  });
  const bucket = (date: Date | null) => revenue.find((r) => date && toIsoDate(date).startsWith(r.month));
  for (const d of paid) {
    const r = bucket(d.paidAt);
    if (r) r.paid += d.amount;
  }
  for (const d of owed) {
    const r = bucket(d.invoiceDueDate);
    if (r) r.owed += d.amount;
  }

  return {
    days: [...byDate.values()],
    topContent: posts.map((p) => ({ id: p.id, title: p.title, channel: p.channel, format: p.format, views: p.views, engagement: p.engagement, postedAt: toIsoDate(p.postedAt) })),
    revenue,
  };
}
