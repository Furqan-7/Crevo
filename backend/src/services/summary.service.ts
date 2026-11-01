import { prisma } from "db";
import type { SummaryDto } from "../types/api";
import { weekStartIso, zonedToUtc } from "../utils/dates";
import { clockFor } from "./clock.service";

// Each clip cut, captioned and scheduled for the creator.
const MINUTES_PER_SCHEDULED_CLIP = 25;

// Time saved since Monday 00:00 in the creator's own time zone.
export async function getSummary(userId: string): Promise<SummaryDto> {
  const { today, tz } = await clockFor(userId);
  const since = zonedToUtc(weekStartIso(today), 0, tz);
  const [replies, clips] = await Promise.all([
    prisma.message.aggregate({ where: { profileId: userId, approvedAt: { gte: since } }, _sum: { minutesSaved: true } }),
    prisma.clip.count({ where: { video: { profileId: userId }, posts: { some: { createdAt: { gte: since } } } } }),
  ]);
  return { minutesSavedThisWeek: (replies._sum.minutesSaved ?? 0) + clips * MINUTES_PER_SCHEDULED_CLIP };
}
