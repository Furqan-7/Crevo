// The workspace's view types, display constants and date helpers. The data
// itself comes from the Crevo API (see _shell/api.ts and _shell/model.ts);
// the sample workspace new accounts start with lives in the backend.

export type Category = "Brand deal" | "Collab" | "Fan question" | "Spam";
export type Platform = "Instagram" | "YouTube" | "TikTok" | "Shorts" | "Reels";
export type Tone = "Friendly" | "Professional" | "Shorter";

export interface Todo {
  id: string;
  title: string;
  detail: string;
  when: string;
  done: boolean;
  ideaId: string | null;
}

export interface Idea {
  id: string;
  title: string;
  why: string;
  platforms: Platform[];
  todoId: string | null;
}

// The suggested Copilot questions; the API answers from the workspace's data.
export const copilotQuestions = ["Who still owes me money?", "What's due this week?", "Which deal is riskiest?", "What should I post next?"];

// ── Inbox ───────────────────────────────────────────────────────────────────
// Drafts mark key points with ==double equals==; the reading pane highlights
// them.

export interface InboxThread {
  id: string;
  from: string;
  email: string;
  initial: string;
  color: string;
  category: Category;
  source: "Gmail" | "YouTube" | "Instagram";
  time: string;
  receivedAt: string;
  unread: boolean;
  subject: string;
  preview: string;
  body: string[];
  signOff: string;
  summary?: string;
  dealSlug?: string;
  drafts?: Record<Tone, string>;
  draftReady: boolean;
  draftRequested: boolean;
  minutesSaved: number;
  // The tone the creator picked here, and their own edit of the draft.
  tone: Tone | null;
  editedReply: string | null;
  approved: boolean;
  // Where an approved reply goes, and whether it got there.
  delivery: "gmail_draft" | "youtube_reply" | "none";
  delivered: boolean;
  externalUrl: string | null;
}

// ── Publish ─────────────────────────────────────────────────────────────────

export type PublishPlatform = "reel" | "short" | "tiktok";

export const publishPlatforms: { id: PublishPlatform; label: string; swatch: string; limit: number }[] = [
  { id: "reel", label: "Instagram Reel", swatch: "linear-gradient(90deg,#f9a825,#e91e63,#7b1fa2)", limit: 2200 },
  { id: "short", label: "YouTube Short", swatch: "#ff0033", limit: 5000 },
  { id: "tiktok", label: "TikTok", swatch: "#181818", limit: 2200 },
];

export interface Clip {
  id: string;
  short: string;
  title: string;
  quote: string;
  startSec: number;
  endSec: number;
  suggestedStartSec: number;
  suggestedEndSec: number;
  why: string;
  hook: number;
  color: string;
  skipped: boolean;
  captions: Record<PublishPlatform, { options: string[]; variant: number; text: string | null }>;
  hashtags: string[];
  // Scheduled posts, one per platform, and how each went.
  posts: { id: string; platform: PublishPlatform; scheduledAt: string; status: "scheduled" | "publishing" | "published" | "needs_manual" | "failed"; externalUrl: string | null; error: string | null; hasClipFile: boolean }[];
  // The vertical 9:16 short made from this clip (none for the sample video).
  render: { status: "none" | "rendering" | "ready" | "failed"; progress: number; error: string | null; stale: boolean };
}

export interface Video {
  id: string;
  file: string;
  length: string;
  lengthSec: number;
  quality: string;
  transcript: { sec: number; text: string }[];
  clips: Clip[];
}

export const MINUTES_SAVED_PER_CLIP = 25;

export const bestTimes: { platform: PublishPlatform; label: string; day: number; minutes: number; why: string }[] = [
  { platform: "reel", label: "Reel", day: 0, minutes: 18 * 60 + 30, why: "Your followers peak 6–8 pm" },
  { platform: "short", label: "Short", day: 1, minutes: 12 * 60, why: "Lunch views are 1.8x" },
  { platform: "tiktok", label: "TikTok", day: 2, minutes: 19 * 60, why: "Weekend reach starts Friday" },
];

export interface PostSlot {
  platform: PublishPlatform;
  label: string;
  date: string;
  minutes: number;
  when: string;
  why: string;
}

// Clip 1 goes out this week (Wed, Thu, Fri); each later clip a week after.
export function postSlots(clipIndex: number): PostSlot[] {
  return bestTimes.map((t) => {
    const date = addDays(TODAY_ISO, t.day + clipIndex * 7);
    return { platform: t.platform, label: t.label, date, minutes: t.minutes, why: t.why, when: `${dayLabel(date)} ${clock(t.minutes)}` };
  });
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Dates are ISO strings handled in UTC so every helper agrees. "Today" is
// the creator's local date in their time zone: AppShell sets it from the
// profile (setWorkspaceClock) before any screen renders.

function zoneDate(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export let TIME_ZONE = "UTC";
export let TODAY_ISO = zoneDate("UTC").iso;

export function setWorkspaceClock(tz: string) {
  try {
    TODAY_ISO = zoneDate(tz).iso;
    TIME_ZONE = tz;
  } catch {
    // An unknown zone keeps UTC.
  }
}

// Minutes since local midnight, for the calendar's "now" line.
export function nowMinutes() {
  return zoneDate(TIME_ZONE).minutes;
}

// The browser's own zone, offered at onboarding and in Settings.
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// "2026-10-28T09:02:00Z" → its local date and minutes in the creator's zone.
export function localParts(iso: string) {
  return zoneDate(TIME_ZONE, new Date(iso));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

// Monday of the week that contains `iso`.
export function weekStart(iso: string) {
  const day = parseIso(iso).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

// "Thu 29 Oct"; "Today" for the demo's today.
export function dayLabel(iso: string, relative = true) {
  if (relative && iso === TODAY_ISO) return "Today";
  const d = parseIso(iso);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

export function monthLabel(iso: string) {
  const d = parseIso(iso);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// 1110 → "6:30 pm"
export function clock(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ── Calendar ────────────────────────────────────────────────────────────────
// Deal deadlines and scheduled posts come from Deals and Publish; the rest
// are calendar events.

export type EventType = "deadline" | "post" | "film" | "call";

export interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;
  // Minutes from midnight. Without them the event is all-day.
  start?: number;
  end?: number;
  detail?: string;
  link?: { href: string; label: string };
  tentative?: boolean;
  done?: boolean;
  // Stored in the calendar (so it can be confirmed or removed), rather than
  // shown from a deal or a scheduled post.
  stored?: boolean;
}

export const eventTypes: { type: EventType; label: string; color: string; bg: string; ink: string }[] = [
  { type: "deadline", label: "Deadlines", color: "#7b77e8", bg: "#ece9ff", ink: "#3f389f" },
  { type: "post", label: "Posts", color: "#f4c430", bg: "#fff3cf", ink: "#6e5500" },
  { type: "film", label: "Filming", color: "#2a6df4", bg: "#e5eefe", ink: "#1d4aa8" },
  { type: "call", label: "Calls", color: "#56c25a", bg: "#e3f4df", ink: "#2f6528" },
];

// A gap Crevo suggests for filming (tomorrow morning), shown beside the
// week it falls in.
export const suggestedSlot = () => ({
  date: addDays(TODAY_ISO, 1),
  start: 9 * 60,
  end: 11 * 60,
  title: "Film: “What camera do you use?” Short",
  why: "Free before your Short goes out at 12:00 pm, and 12 people asked for it.",
});

// ── Deals ───────────────────────────────────────────────────────────────────

export type DealStage = "New offer" | "Negotiating" | "In production" | "Invoiced" | "Paid";

// The board's columns; paid deals only show in Analytics.
export const dealStages: { stage: Exclude<DealStage, "Paid">; color: string }[] = [
  { stage: "New offer", color: "#aeabff" },
  { stage: "Negotiating", color: "#f4c430" },
  { stage: "In production", color: "#56c25a" },
  { stage: "Invoiced", color: "#7b77e8" },
];

export interface BoardDeal {
  id: string;
  slug: string;
  brand: string;
  initial: string;
  color: string;
  campaign: string;
  stage: DealStage;
  note: string;
  alert?: { text: string; tone: "warn" | "bad" };
  value: string;
  amount: number;
  dueDate: string;
  due: string;
  summary: string;
  source: string;
  health: { financial: number; deadline: number; contract: number; scope: number };
  terms: { label: string; value: string; clause?: string; missing?: boolean }[];
  risks: { title: string; fix: string }[];
  deliverables: { id: string; title: string; date: string; dueDate: string; done: boolean }[];
  // The inbox message the main action drafts a reply for.
  replyId?: string;
  inCalendar: boolean;
  // Set while an invoice is unpaid past its due date.
  overdue?: { amount: string; days: number; reminder: string; invoice: string; dueDate: string };
}

export const HEALTH_MAX = { financial: 25, deadline: 25, contract: 30, scope: 20 } as const;

export function dealScore(d: BoardDeal) {
  return d.health.financial + d.health.deadline + d.health.contract + d.health.scope;
}

// ── Onboarding ──────────────────────────────────────────────────────────────

export const onboardingAccounts: {
  id: string;
  name: string;
  detail: string;
  mark: string;
  color: string;
  action: "connected" | "connect" | "csv" | "soon";
}[] = [
  { id: "gmail", name: "Gmail", detail: "Sort brand emails and draft replies", mark: "M", color: "#ea4335", action: "connect" },
  { id: "calendar", name: "Google Calendar", detail: "Add deadlines and posting times", mark: "31", color: "#4285f4", action: "connect" },
  { id: "youtube", name: "YouTube", detail: "Comments, views and your best formats", mark: "▶", color: "#ff0033", action: "connect" },
  { id: "instagram", name: "Instagram", detail: "Import your metrics as a CSV for now", mark: "IG", color: "linear-gradient(45deg,#f9a825,#e91e63,#7b1fa2)", action: "csv" },
  { id: "tiktok", name: "TikTok", detail: "Coming soon", mark: "♪", color: "#181818", action: "soon" },
];

export const niches = ["Tech & gear", "Lifestyle", "Beauty", "Fitness", "Education"];
export const goals = ["Land more brand deals", "Post more often", "Save time"];

// ── Notifications ───────────────────────────────────────────────────────────
// `kind` matches the switches in Settings › Notifications; an alert whose
// switch is off is not shown.

export type AlertKind = "overdue" | "newDeal" | "deadline" | "weekly";

export interface Alert {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  when: string;
  today: boolean;
  href: string;
  read: boolean;
  dealSlug?: string;
}
