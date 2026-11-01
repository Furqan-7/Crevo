import type { Metadata } from "next";
import Inbox from "./Inbox";

export const metadata: Metadata = { title: "Inbox" };

// /dashboard/inbox?m=<thread id> opens that thread in the reading pane.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const { m } = await searchParams;
  return <Inbox initialId={typeof m === "string" ? m : undefined} />;
}
