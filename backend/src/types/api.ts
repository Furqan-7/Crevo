// The API's JSON contract, shared with the frontend (it imports these as
// types only, so this file must stay free of runtime imports). Enum values
// are the database's enum values; the services return objects of exactly
// these shapes, so a schema change that breaks the contract fails to compile.

export type Provider = "gmail" | "calendar" | "youtube" | "instagram" | "tiktok";
export type AccountStatus = "connected" | "disconnected" | "imported" | "soon";
export type BriefingSection = "todo" | "inbox" | "ideas" | "deals";
export type Tone = "friendly" | "professional" | "shorter";
export type Category = "brand_deal" | "collab" | "fan_question" | "spam";
export type MessageSource = "gmail" | "youtube" | "instagram";
export type DealStage = "new_offer" | "negotiating" | "in_production" | "invoiced" | "paid";
export type AlertTone = "warn" | "bad";
export type IdeaPlatform = "instagram" | "youtube" | "tiktok" | "shorts" | "reels";
export type EventType = "deadline" | "post" | "film" | "call";
export type PublishPlatform = "reel" | "short" | "tiktok";
export type AlertKind = "overdue" | "new_deal" | "deadline" | "weekly";
export type Channel = "youtube" | "instagram" | "tiktok";
export type PaymentTerms = "net_15" | "net_30" | "net_45" | "net_60" | "missing";
export type Revisions = "one" | "two" | "unlimited";

// ── Envelopes ───────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiList<T> extends ApiSuccess<T[]> {
  pagination: Pagination;
}

export interface ApiFailure {
  success: false;
  message: string;
  error: string;
  // Present on VALIDATION_ERROR: which field failed and why.
  details?: { path: string; message: string }[];
}

// ── Resources ───────────────────────────────────────────────────────────────

export interface ProfileDto {
  id: string;
  email: string;
  name: string;
  channel: string;
  niche: string;
  goals: string[];
  briefingTime: string;
  briefingEmail: boolean;
  briefingSections: BriefingSection[];
  tone: Tone;
  signOff: string;
  autoDraft: Category[];
  notifications: AlertKind[];
  accounts: Record<Provider, AccountStatus>;
  // Sync details for each connected account.
  sync: Partial<Record<Provider, { syncedAt: string | null; lastError: string | null; externalId: string | null }>>;
  // The Google account Gmail, Calendar and YouTube are connected through.
  googleEmail: string | null;
  timezone: string;
  // What this server has keys for, so the app can say what's available.
  features: { ai: boolean; google: boolean; storage: boolean; email: boolean };
  onboarded: boolean;
  // False until the workspace has any data (sample or real).
  hasWorkspace: boolean;
}

export interface MessageDto {
  id: string;
  dealSlug: string | null;
  source: MessageSource;
  category: Category;
  fromName: string;
  fromAddress: string;
  avatarInitial: string;
  avatarColor: string;
  subject: string;
  preview: string;
  body: string[];
  senderSignOff: string;
  summary: string | null;
  receivedAt: string;
  draftReady: boolean;
  draftRequested: boolean;
  minutesSaved: number;
  tone: Tone | null;
  editedReply: string | null;
  read: boolean;
  archived: boolean;
  approvedAt: string | null;
  approvedReply: string | null;
  // Where an approved reply goes: a Gmail draft, a posted YouTube reply, or
  // nowhere (sample messages and Instagram DMs); and whether it got there.
  delivery: "gmail_draft" | "youtube_reply" | "none";
  delivered: boolean;
  // Gmail thread or YouTube video, to open the original.
  externalUrl: string | null;
  drafts: Partial<Record<Tone, string>>;
}

export interface DealTermDto {
  label: string;
  value: string;
  clause: string | null;
  missing: boolean;
}

export interface DealRiskDto {
  title: string;
  fix: string;
}

export interface DeliverableDto {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export interface DealHealth {
  financial: number;
  deadline: number;
  contract: number;
  scope: number;
}

export interface DealDto {
  id: string;
  slug: string;
  brand: string;
  color: string;
  campaign: string;
  stage: DealStage;
  amount: number;
  dueDate: string;
  source: string;
  alert: { text: string; tone: AlertTone } | null;
  health: DealHealth;
  invoiceNumber: string | null;
  invoiceDueDate: string | null;
  paidAt: string | null;
  reminderDraft: string | null;
  inCalendar: boolean;
  // The inbox message the deal's main action replies to.
  replyMessageId: string | null;
  terms: DealTermDto[];
  risks: DealRiskDto[];
  deliverables: DeliverableDto[];
}

// What the contract reader extracted, as corrected by the creator.
export interface ContractTermsInput {
  brand: string;
  campaign: string;
  fee: number;
  deliverables: string;
  due: string;
  usageDays: number;
  usagePaid: boolean;
  payment: PaymentTerms;
  revisions: Revisions;
  stage: Exclude<DealStage, "paid">;
  fileName: string;
  documentId?: string;
  clauses?: Partial<Record<"fee" | "deliverables" | "usageDays" | "payment", string | null>>;
}

// What POST /api/contracts/read found in an uploaded contract.
export interface ContractReadDto {
  documentId: string;
  fileName: string;
  terms: Omit<ContractTermsInput, "stage" | "fileName" | "documentId"> & {
    clauses: Record<"fee" | "deliverables" | "due" | "usageDays" | "payment" | "revisions", string | null>;
  };
}

export interface TodoDto {
  id: string;
  ideaId: string | null;
  title: string;
  detail: string;
  dueDate: string;
  dueMinutes: number | null;
  done: boolean;
}

export interface IdeaDto {
  id: string;
  title: string;
  why: string;
  platforms: IdeaPlatform[];
  todoId: string | null;
}

export interface EventDto {
  id: string;
  title: string;
  type: EventType;
  date: string;
  startMinutes: number | null;
  endMinutes: number | null;
  detail: string | null;
  link: { href: string; label: string } | null;
  tentative: boolean;
  done: boolean;
}

export interface CaptionDto {
  options: string[];
  variant: number;
  text: string | null;
}

export interface PostDto {
  id: string;
  clipId: string;
  platform: PublishPlatform;
  scheduledAt: string;
  why: string;
  caption: string;
  // needs_manual: cut and captioned, but the platform must be posted to by hand.
  status: "scheduled" | "publishing" | "published" | "needs_manual" | "failed";
  externalUrl: string | null;
  error: string | null;
  hasClipFile: boolean;
}

export interface VideoUploadDto {
  videoId: string;
  path: string;
  token: string;
  signedUrl: string;
}

export interface ClipDto {
  id: string;
  position: number;
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
  hashtags: string[];
  captions: Record<PublishPlatform, CaptionDto>;
  posts: PostDto[];
}

export interface VideoDto {
  id: string;
  fileName: string;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
  lengthSec: number;
  quality: string;
  createdAt: string;
  transcript: { sec: number; text: string }[];
  clips: ClipDto[];
}

export interface AlertDto {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  read: boolean;
  dealSlug: string | null;
}

export interface AnalyticsDayDto {
  date: string;
  views: Record<Channel, number>;
  followers: Record<Channel, number>;
  watchMinutes: number;
}

export interface AnalyticsDto {
  // Twice the requested range, oldest first, so screens can compare a
  // period with the one before it.
  days: AnalyticsDayDto[];
  topContent: { id: string; title: string; channel: Channel; format: string; views: number; engagement: number; postedAt: string }[];
  // The last six months, oldest first; month is "2026-10".
  revenue: { month: string; paid: number; owed: number }[];
}

export interface SummaryDto {
  // Approved replies and scheduled clips since Monday.
  minutesSavedThisWeek: number;
}

export interface CopilotAnswerDto {
  question: string;
  answer: string;
}
