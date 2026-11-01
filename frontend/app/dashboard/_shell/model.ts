import type {
  AlertDto,
  AlertKind as ApiAlertKind,
  Category as ApiCategory,
  DealDto,
  DealStage as ApiDealStage,
  EventDto,
  IdeaDto,
  IdeaPlatform,
  MessageDto,
  MessageSource,
  ProfileDto,
  TodoDto,
  Tone as ApiTone,
  VideoDto,
} from "@api-types";
import { TODAY_ISO, addDays, dayLabel, localParts, type Alert, type AlertKind, type BoardDeal, type CalEvent, type Category, type DealStage, type Idea, type InboxThread, type Platform, type Todo, type Tone, type Video } from "../data";
import type { api } from "./api";
import type { Settings } from "./settings";

// API objects (enum codes, ISO dates) → the view types the screens render
// (labels, "Today", "$4,000"), and the reverse for what screens send back.

const invert = <K extends string, V extends string>(map: Record<K, V>) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;

export const CATEGORY: Record<ApiCategory, Category> = { brand_deal: "Brand deal", collab: "Collab", fan_question: "Fan question", spam: "Spam" };
export const CATEGORY_CODE = invert(CATEGORY);
export const TONE: Record<ApiTone, Tone> = { friendly: "Friendly", professional: "Professional", shorter: "Shorter" };
export const TONE_CODE = invert(TONE);
export const STAGE: Record<ApiDealStage, DealStage> = { new_offer: "New offer", negotiating: "Negotiating", in_production: "In production", invoiced: "Invoiced", paid: "Paid" };
export const STAGE_CODE = invert(STAGE);
const SOURCE: Record<MessageSource, InboxThread["source"]> = { gmail: "Gmail", youtube: "YouTube", instagram: "Instagram" };
const PLATFORM: Record<IdeaPlatform, Platform> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", shorts: "Shorts", reels: "Reels" };
export const ALERT_KIND: Record<ApiAlertKind, AlertKind> = { overdue: "overdue", new_deal: "newDeal", deadline: "deadline", weekly: "weekly" };
export const ALERT_KIND_CODE = invert(ALERT_KIND);

export const money = (n: number) => `$${n.toLocaleString("en-US")}`;
// "9:02" today, "Yesterday", otherwise "Mon 26 Oct" (in the creator's zone).
function relativeTime(iso: string, short = false) {
  const { iso: date, minutes } = localParts(iso);
  if (date === TODAY_ISO) return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  if (date === addDays(TODAY_ISO, -1)) return "Yesterday";
  const label = dayLabel(date, false);
  return short ? label.slice(0, 3) : label;
}

export function toThread(m: MessageDto): InboxThread {
  const drafts = m.drafts.friendly && m.drafts.professional && m.drafts.shorter ? { Friendly: m.drafts.friendly, Professional: m.drafts.professional, Shorter: m.drafts.shorter } : undefined;
  return {
    id: m.id,
    from: m.fromName,
    email: m.fromAddress,
    initial: m.avatarInitial,
    color: m.avatarColor,
    category: CATEGORY[m.category],
    source: SOURCE[m.source],
    time: relativeTime(m.receivedAt),
    receivedAt: m.receivedAt,
    unread: !m.read,
    subject: m.subject,
    preview: m.preview,
    body: m.body,
    signOff: m.senderSignOff,
    summary: m.summary ?? undefined,
    dealSlug: m.dealSlug ?? undefined,
    drafts,
    draftReady: m.draftReady,
    draftRequested: m.draftRequested,
    minutesSaved: m.minutesSaved,
    tone: m.tone ? TONE[m.tone] : null,
    editedReply: m.editedReply,
    approved: m.approvedAt !== null,
    delivery: m.delivery,
    delivered: m.delivered,
    externalUrl: m.externalUrl,
  };
}

export function toDeal(d: DealDto): BoardDeal {
  const value = money(d.amount);
  const due = dayLabel(d.dueDate, false);
  const deliverables = d.terms.find((t) => t.label === "Deliverables")?.value;
  const invoiceLate = d.stage === "invoiced" && !d.paidAt && d.invoiceDueDate && d.invoiceDueDate < TODAY_ISO;
  const lateDays = invoiceLate ? Math.round((Date.parse(TODAY_ISO) - Date.parse(d.invoiceDueDate!)) / 86_400_000) : 0;
  return {
    id: d.id,
    slug: d.slug,
    brand: d.brand,
    initial: (d.brand.trim()[0] ?? "?").toUpperCase(),
    color: d.color,
    campaign: d.campaign,
    stage: STAGE[d.stage],
    note: d.invoiceNumber ? `${d.campaign} · invoice ${d.invoiceNumber}` : `${d.campaign} · due ${due.slice(4)}`,
    alert: d.alert ?? undefined,
    value,
    amount: d.amount,
    dueDate: d.dueDate,
    due: d.invoiceDueDate ? `paid by ${dayLabel(d.invoiceDueDate, false).slice(4)}` : `due ${due}`,
    summary: d.invoiceNumber
      ? `${value} · invoice ${d.invoiceNumber} · due ${dayLabel(d.invoiceDueDate ?? d.dueDate, false).slice(4)}`
      : `${value}${deliverables ? ` · ${deliverables}` : ""} · due ${due}`,
    source: d.source,
    health: d.health,
    terms: d.terms.map((t) => ({ label: t.label, value: t.value, clause: t.clause ?? undefined, missing: t.missing })),
    risks: d.risks,
    deliverables: d.deliverables.map((item) => ({ id: item.id, title: item.title, date: dayLabel(item.dueDate, false), dueDate: item.dueDate, done: item.done })),
    replyId: d.replyMessageId ?? undefined,
    inCalendar: d.inCalendar,
    overdue:
      invoiceLate && d.reminderDraft
        ? { amount: value, days: lateDays, reminder: d.reminderDraft, invoice: d.invoiceNumber ?? "", dueDate: d.invoiceDueDate! }
        : undefined,
  };
}

// "9:10" for a timed to-do today, "Today", or the weekday.
export function toTodo(t: TodoDto): Todo {
  const when =
    t.dueDate === TODAY_ISO
      ? t.dueMinutes !== null ? `${Math.floor(t.dueMinutes / 60)}:${String(t.dueMinutes % 60).padStart(2, "0")}` : "Today"
      : dayLabel(t.dueDate, false).slice(0, 3);
  return { id: t.id, title: t.title, detail: t.detail, when, done: t.done, ideaId: t.ideaId };
}

export function toIdea(i: IdeaDto): Idea {
  return { id: i.id, title: i.title, why: i.why, platforms: i.platforms.map((p) => PLATFORM[p]), todoId: i.todoId };
}

export function toEvent(e: EventDto): CalEvent {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    date: e.date,
    start: e.startMinutes ?? undefined,
    end: e.endMinutes ?? undefined,
    detail: e.detail ?? undefined,
    link: e.link ?? undefined,
    tentative: e.tentative,
    done: e.done,
    stored: true,
  };
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function toVideo(v: VideoDto): Video {
  return {
    id: v.id,
    file: v.fileName,
    length: mmss(v.lengthSec),
    lengthSec: v.lengthSec,
    quality: v.quality,
    transcript: v.transcript,
    clips: v.clips.map((c) => ({
      id: c.id,
      short: c.short,
      title: c.title,
      quote: c.quote,
      startSec: c.startSec,
      endSec: c.endSec,
      suggestedStartSec: c.suggestedStartSec,
      suggestedEndSec: c.suggestedEndSec,
      why: c.why,
      hook: c.hook,
      color: c.color,
      skipped: c.skipped,
      captions: c.captions,
      hashtags: c.hashtags,
      posts: c.posts.map((p) => ({ id: p.id, platform: p.platform, scheduledAt: p.scheduledAt, status: p.status, externalUrl: p.externalUrl, error: p.error, hasClipFile: p.hasClipFile })),
    })),
  };
}

export function toAlert(a: AlertDto): Alert {
  return {
    id: a.id,
    kind: ALERT_KIND[a.kind],
    title: a.title,
    detail: a.detail,
    when: relativeTime(a.createdAt, true),
    today: localParts(a.createdAt).iso === TODAY_ISO,
    href: a.href,
    read: a.read,
    dealSlug: a.dealSlug ?? undefined,
  };
}

// ── Settings ⇄ profile ──────────────────────────────────────────────────────

const AUTO_DRAFT: Exclude<Category, "Spam">[] = ["Brand deal", "Collab", "Fan question"];
const NOTIFICATIONS: AlertKind[] = ["overdue", "newDeal", "deadline", "weekly"];

export function toSettings(p: ProfileDto): Settings {
  return {
    email: p.email,
    timezone: p.timezone,
    name: p.name,
    channel: p.channel,
    niche: p.niche,
    goals: p.goals,
    accounts: p.accounts,
    briefingTime: p.briefingTime,
    briefingEmail: p.briefingEmail,
    briefingSections: { todo: p.briefingSections.includes("todo"), inbox: p.briefingSections.includes("inbox"), ideas: p.briefingSections.includes("ideas"), deals: p.briefingSections.includes("deals") },
    tone: TONE[p.tone],
    signOff: p.signOff,
    autoDraft: Object.fromEntries(AUTO_DRAFT.map((c) => [c, p.autoDraft.includes(CATEGORY_CODE[c])])) as Settings["autoDraft"],
    notifications: Object.fromEntries(NOTIFICATIONS.map((k) => [k, p.notifications.includes(ALERT_KIND_CODE[k])])) as Settings["notifications"],
  };
}

// Only the fields in `patch` are sent. Accounts have their own endpoint.
export function toProfilePatch(patch: Partial<Settings>) {
  const out: Parameters<typeof api.updateProfile>[0] = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.timezone !== undefined) out.timezone = patch.timezone;
  if (patch.channel !== undefined) out.channel = patch.channel;
  if (patch.niche !== undefined) out.niche = patch.niche;
  if (patch.goals !== undefined) out.goals = patch.goals;
  if (patch.briefingTime !== undefined) out.briefingTime = patch.briefingTime;
  if (patch.briefingEmail !== undefined) out.briefingEmail = patch.briefingEmail;
  if (patch.briefingSections) out.briefingSections = (Object.keys(patch.briefingSections) as (keyof Settings["briefingSections"])[]).filter((k) => patch.briefingSections![k]);
  if (patch.tone) out.tone = TONE_CODE[patch.tone];
  if (patch.signOff !== undefined) out.signOff = patch.signOff;
  if (patch.autoDraft) out.autoDraft = AUTO_DRAFT.filter((c) => patch.autoDraft![c]).map((c) => CATEGORY_CODE[c] as Exclude<ApiCategory, "spam">);
  if (patch.notifications) out.notifications = NOTIFICATIONS.filter((k) => patch.notifications![k]).map((k) => ALERT_KIND_CODE[k]);
  return out;
}
