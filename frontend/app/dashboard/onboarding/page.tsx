import type { Metadata } from "next";
import { requireSession } from "../_shell/session";
import Onboarding from "./Onboarding";

export const metadata: Metadata = { title: "Get started" };

// First-run setup, shown after the first sign-in. It sits outside the
// (workspace) group, so it has no sidebar.
// ?name= comes from sign-up or Google sign-in.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ name?: string | string[] }> }) {
  await requireSession();
  const { name } = await searchParams;
  return <Onboarding name={typeof name === "string" ? name.trim().slice(0, 40) || undefined : undefined} />;
}
