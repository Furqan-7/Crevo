import type { ReactNode } from "react";
import AppShell from "../_shell/AppShell";
import { requireSession } from "../_shell/session";

// Every workspace screen (Today, Inbox, Publish, Deals) shares the sidebar,
// top bar, Copilot and toast. Onboarding sits outside this group.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
