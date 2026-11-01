// Shared by the server page (to read ?tab=) and the client screen.
export const SETTINGS_TABS = [
  { id: "profile", label: "Profile", hint: "Name, niche and goals" },
  { id: "accounts", label: "Connected accounts", hint: "Gmail, Calendar, YouTube…" },
  { id: "briefing", label: "Daily briefing", hint: "When and what it includes" },
  { id: "replies", label: "Replies", hint: "Tone, sign-off, auto-drafts" },
  { id: "notifications", label: "Notifications", hint: "What to alert you about" },
  { id: "account", label: "Plan and account", hint: "Plan, sign out, reset" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];
