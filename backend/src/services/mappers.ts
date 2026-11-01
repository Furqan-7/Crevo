import type { Prisma } from "db";
import type {
  AlertDto,
  CaptionDto,
  ClipDto,
  DealDto,
  EventDto,
  IdeaDto,
  MessageDto,
  PostDto,
  PublishPlatform,
  Tone,
  TodoDto,
  VideoDto,
} from "../types/api";
import { toIsoDate } from "../utils/dates";

// Prisma rows → API objects. Each `include` below is the exact shape its
// mapper needs, so services query with it and the compiler keeps the two
// in step.

export const messageInclude = { drafts: true, deal: { select: { slug: true } } } satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function toMessageDto(m: MessageRow): MessageDto {
  const drafts: Partial<Record<Tone, string>> = {};
  for (const d of m.drafts) drafts[d.tone] = d.text;
  return {
    id: m.id,
    dealSlug: m.deal?.slug ?? null,
    source: m.source,
    category: m.category,
    fromName: m.fromName,
    fromAddress: m.fromAddress,
    avatarInitial: m.avatarInitial,
    avatarColor: m.avatarColor,
    subject: m.subject,
    preview: m.preview,
    body: m.body,
    senderSignOff: m.senderSignOff,
    summary: m.summary,
    receivedAt: m.receivedAt.toISOString(),
    draftReady: m.draftReady,
    draftRequested: m.draftRequested,
    minutesSaved: m.minutesSaved,
    tone: m.tone,
    editedReply: m.editedReply,
    read: m.readAt !== null,
    archived: m.archivedAt !== null,
    approvedAt: m.approvedAt?.toISOString() ?? null,
    approvedReply: m.approvedReply,
    delivery: m.externalId && m.source === "gmail" ? "gmail_draft" : m.externalId && m.source === "youtube" ? "youtube_reply" : "none",
    delivered: m.replyExternalId !== null,
    externalUrl:
      m.source === "gmail" && m.threadId
        ? `https://mail.google.com/mail/u/0/#all/${m.threadId}`
        : m.source === "youtube" && m.threadId && m.externalId
          ? `https://www.youtube.com/watch?v=${m.threadId}&lc=${m.externalId}`
          : null,
    drafts,
  };
}

export const dealInclude = {
  terms: { orderBy: { position: "asc" } },
  risks: { orderBy: { position: "asc" } },
  deliverables: { orderBy: { position: "asc" } },
  messages: { select: { id: true }, orderBy: { receivedAt: "desc" }, take: 1 },
} satisfies Prisma.DealInclude;
type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

export function toDealDto(d: DealRow): DealDto {
  return {
    id: d.id,
    slug: d.slug,
    brand: d.brand,
    color: d.color,
    campaign: d.campaign,
    stage: d.stage,
    amount: d.amount,
    dueDate: toIsoDate(d.dueDate),
    source: d.source,
    alert: d.alertText && d.alertTone ? { text: d.alertText, tone: d.alertTone } : null,
    health: { financial: d.healthFinancial, deadline: d.healthDeadline, contract: d.healthContract, scope: d.healthScope },
    invoiceNumber: d.invoiceNumber,
    invoiceDueDate: d.invoiceDueDate ? toIsoDate(d.invoiceDueDate) : null,
    paidAt: d.paidAt ? toIsoDate(d.paidAt) : null,
    reminderDraft: d.reminderDraft,
    inCalendar: d.inCalendar,
    replyMessageId: d.messages[0]?.id ?? null,
    terms: d.terms.map((t) => ({ label: t.label, value: t.value, clause: t.clause, missing: t.missing })),
    risks: d.risks.map((r) => ({ title: r.title, fix: r.fix })),
    deliverables: d.deliverables.map((item) => ({ id: item.id, title: item.title, dueDate: toIsoDate(item.dueDate), done: item.done })),
  };
}

export function toTodoDto(t: Prisma.TodoGetPayload<object>): TodoDto {
  return {
    id: t.id,
    ideaId: t.ideaId,
    title: t.title,
    detail: t.detail,
    dueDate: toIsoDate(t.dueDate),
    dueMinutes: t.dueMinutes,
    done: t.done,
  };
}

export const ideaInclude = { todo: { select: { id: true } } } satisfies Prisma.IdeaInclude;

export function toIdeaDto(i: Prisma.IdeaGetPayload<{ include: typeof ideaInclude }>): IdeaDto {
  return { id: i.id, title: i.title, why: i.why, platforms: i.platforms, todoId: i.todo?.id ?? null };
}

export function toEventDto(e: Prisma.CalendarEventGetPayload<object>): EventDto {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    date: toIsoDate(e.date),
    startMinutes: e.startMinutes,
    endMinutes: e.endMinutes,
    detail: e.detail,
    link: e.linkHref && e.linkLabel ? { href: e.linkHref, label: e.linkLabel } : null,
    tentative: e.tentative,
    done: e.done,
  };
}

export function toPostDto(p: Prisma.ScheduledPostGetPayload<object>): PostDto {
  return {
    id: p.id,
    clipId: p.clipId,
    platform: p.platform,
    scheduledAt: p.scheduledAt.toISOString(),
    why: p.why,
    caption: p.caption,
    status: p.status,
    externalUrl: p.externalUrl,
    error: p.error,
    hasClipFile: p.clipPath !== null,
  };
}

export const clipInclude = { captions: true, posts: { orderBy: { scheduledAt: "asc" } } } satisfies Prisma.ClipInclude;
type ClipRow = Prisma.ClipGetPayload<{ include: typeof clipInclude }>;

const PLATFORMS: PublishPlatform[] = ["reel", "short", "tiktok"];

export function toClipDto(c: ClipRow): ClipDto {
  const captions = Object.fromEntries(
    PLATFORMS.map((platform) => {
      const row = c.captions.find((cap) => cap.platform === platform);
      const caption: CaptionDto = row ? { options: row.options, variant: row.variant, text: row.text } : { options: [], variant: 0, text: null };
      return [platform, caption];
    }),
  ) as Record<PublishPlatform, CaptionDto>;
  return {
    id: c.id,
    position: c.position,
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
    hashtags: c.hashtags,
    captions,
    posts: c.posts.map(toPostDto),
  };
}

export const videoInclude = {
  transcript: { orderBy: { sec: "asc" } },
  clips: { orderBy: { position: "asc" }, include: clipInclude },
} satisfies Prisma.VideoInclude;

export function toVideoDto(v: Prisma.VideoGetPayload<{ include: typeof videoInclude }>): VideoDto {
  return {
    id: v.id,
    fileName: v.fileName,
    status: v.status,
    error: v.error,
    lengthSec: v.lengthSec,
    quality: v.quality,
    createdAt: v.createdAt.toISOString(),
    transcript: v.transcript.map((line) => ({ sec: line.sec, text: line.text })),
    clips: v.clips.map(toClipDto),
  };
}

export const alertInclude = { deal: { select: { slug: true } } } satisfies Prisma.AlertInclude;

export function toAlertDto(a: Prisma.AlertGetPayload<{ include: typeof alertInclude }>): AlertDto {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    detail: a.detail,
    href: a.href,
    createdAt: a.createdAt.toISOString(),
    read: a.readAt !== null,
    dealSlug: a.deal?.slug ?? null,
  };
}
