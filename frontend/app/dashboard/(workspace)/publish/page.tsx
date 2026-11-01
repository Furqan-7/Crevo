import type { Metadata } from "next";
import Publish from "./Publish";

export const metadata: Metadata = { title: "Publish" };

// /dashboard/publish?clip=<clip id> opens that clip's captions.
export default async function PublishPage({ searchParams }: { searchParams: Promise<{ clip?: string | string[] }> }) {
  const { clip } = await searchParams;
  return <Publish initialClip={typeof clip === "string" ? clip : undefined} />;
}
