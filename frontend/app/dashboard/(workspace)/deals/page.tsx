import type { Metadata } from "next";
import Deals from "./Deals";

export const metadata: Metadata = { title: "Deals" };

// /dashboard/deals?deal=<slug> opens that deal in the detail panel.
export default async function DealsPage({ searchParams }: { searchParams: Promise<{ deal?: string | string[] }> }) {
  const { deal } = await searchParams;
  return <Deals initialSlug={typeof deal === "string" ? deal : undefined} />;
}
