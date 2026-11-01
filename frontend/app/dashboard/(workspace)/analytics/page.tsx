import type { Metadata } from "next";
import Analytics from "./Analytics";
import { RANGES, type Range } from "./data";

export const metadata: Metadata = { title: "Analytics" };

// /dashboard/analytics?range=7|30|90
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const { range } = await searchParams;
  const initial = RANGES.find((r) => String(r) === range) ?? (30 as Range);
  return <Analytics initialRange={initial} />;
}
