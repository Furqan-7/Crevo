import type { Metadata } from "next";
import Settings from "./Settings";
import { SETTINGS_TABS, type SettingsTab } from "./tabs";

export const metadata: Metadata = { title: "Settings" };

// /dashboard/settings?tab=accounts opens that section.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const initial: SettingsTab = SETTINGS_TABS.find((t) => t.id === tab)?.id ?? "profile";
  return <Settings initialTab={initial} />;
}
