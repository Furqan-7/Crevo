import type { AccountStatus, Provider } from "@api-types";
import type { Category, Tone } from "../data";

// The creator's preferences as the screens use them. They're saved to the
// API (see AppShell's updateSettings and model.ts for the conversion).

export type AccountId = Provider;
export type AccountState = AccountStatus;
export type BriefingSection = "todo" | "inbox" | "ideas" | "deals";
export type NotificationId = "overdue" | "newDeal" | "deadline" | "weekly";

export interface Settings {
  // The Supabase account's email (read-only here).
  email: string;
  timezone: string;
  name: string;
  channel: string;
  niche: string;
  goals: string[];
  accounts: Record<AccountId, AccountState>;
  briefingTime: string;
  briefingEmail: boolean;
  briefingSections: Record<BriefingSection, boolean>;
  tone: Tone;
  signOff: string;
  autoDraft: Record<Exclude<Category, "Spam">, boolean>;
  notifications: Record<NotificationId, boolean>;
}

// Shown only until the profile has loaded.
export const DEFAULT_SETTINGS: Settings = {
  email: "",
  timezone: "UTC",
  name: "",
  channel: "",
  niche: "",
  goals: [],
  accounts: { gmail: "disconnected", calendar: "disconnected", youtube: "disconnected", instagram: "disconnected", tiktok: "soon" },
  briefingTime: "8:00",
  briefingEmail: true,
  briefingSections: { todo: true, inbox: true, ideas: true, deals: true },
  tone: "Friendly",
  signOff: "",
  autoDraft: { "Brand deal": true, Collab: true, "Fan question": true },
  notifications: { overdue: true, newDeal: true, deadline: true, weekly: false },
};

export const ACCOUNT_META: Record<AccountId, { name: string; mark: string; color: string; detail: string }> = {
  gmail: { name: "Gmail", mark: "M", color: "#ea4335", detail: "Sorts brand emails and drafts replies" },
  calendar: { name: "Google Calendar", mark: "31", color: "#4285f4", detail: "Deadlines, posting times and filming blocks" },
  youtube: { name: "YouTube", mark: "▶", color: "#ff0033", detail: "Comments, views and your best formats" },
  instagram: { name: "Instagram", mark: "IG", color: "linear-gradient(45deg,#f9a825,#e91e63,#7b1fa2)", detail: "Metrics from a CSV import" },
  tiktok: { name: "TikTok", mark: "♪", color: "#181818", detail: "Coming soon" },
};

// Swap a drafted email's closing paragraph for the creator's sign-off.
// Short replies (comments, DMs) have no sign-off and are left alone.
export function withSignOff(draft: string, signOff: string) {
  const parts = draft.split("\n\n");
  if (parts.length < 3 || !signOff.trim()) return draft;
  return [...parts.slice(0, -1), signOff.trim()].join("\n\n");
}
