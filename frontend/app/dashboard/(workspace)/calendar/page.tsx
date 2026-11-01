import type { Metadata } from "next";
import Calendar from "./Calendar";

export const metadata: Metadata = { title: "Calendar" };

// /dashboard/calendar?date=2026-10-29&view=month opens the week (or month)
// containing that date.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; view?: string | string[] }>;
}) {
  const { date, view } = await searchParams;
  const iso = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : undefined;
  return <Calendar initialDate={iso} initialView={view === "month" ? "month" : "week"} />;
}
