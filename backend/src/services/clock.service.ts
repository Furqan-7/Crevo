import { prisma } from "db";
import { minutesNowIn, todayIn } from "../utils/dates";

// "Today" for a creator: the date and time in their own time zone.
export interface Clock {
  tz: string;
  today: string;
  nowMinutes: number;
}

export async function clockFor(userId: string): Promise<Clock> {
  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = profile?.timezone ?? "UTC";
  return { tz, today: todayIn(tz), nowMinutes: minutesNowIn(tz) };
}
