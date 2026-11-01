import { prisma, type Prisma } from "db";
import type { Tone } from "../types/api";
import { addDays, fromIsoDate } from "../utils/dates";
import { revoke } from "../lib/google";
import { errorMessage, logger } from "../utils/logger";
import { indexSource, messageText } from "./rag.service";
import { localizer } from "./sample.localize";
import { conflict } from "../utils/AppError";
import {
  sampleAlerts,
  sampleChannelDays,
  sampleDeals,
  sampleEvents,
  sampleIdeas,
  sampleMessages,
  sampleTodos,
  sampleTopContent,
  sampleVideo,
} from "./sample.data";

type Tx = Prisma.TransactionClient;

const TONES: Tone[] = ["friendly", "professional", "shorter"];

// What a brand-new profile's settings are; reset puts them back.
export const DEFAULT_SETTINGS = {
  name: "",
  channel: "",
  niche: "",
  goals: [],
  briefingTime: "8:00",
  briefingEmail: true,
  briefingSections: ["todo", "inbox", "ideas", "deals"],
  tone: "friendly",
  signOff: "",
  autoDraft: ["brand_deal", "collab", "fan_question"],
  notifications: ["overdue", "new_deal", "deadline"],
} satisfies Prisma.ProfileUpdateInput;

export async function hasWorkspace(userId: string, db: Tx | typeof prisma = prisma): Promise<boolean> {
  const [messages, deals, videos] = await Promise.all([
    db.message.count({ where: { profileId: userId } }),
    db.deal.count({ where: { profileId: userId } }),
    db.video.count({ where: { profileId: userId } }),
  ]);
  return messages + deals + videos > 0;
}

// Writes the sample creator's workspace into this user's rows. Refuses if
// the workspace already has data, so it can never duplicate or overwrite.
export async function seedSampleWorkspace(userId: string, tx: Tx, today: string) {
  if (await hasWorkspace(userId, tx)) {
    throw conflict("Your workspace already has data", "WORKSPACE_NOT_EMPTY");
  }
  // The sample, moved so its "today" is the creator's today.
  const { walk } = localizer(today);
  const deals = walk(sampleDeals);
  const messages = walk(sampleMessages);
  const todos = walk(sampleTodos);
  const events = walk(sampleEvents);
  const alerts = walk(sampleAlerts);
  const video = walk(sampleVideo);
  const topContent = walk(sampleTopContent);
  const channelDays = walk(sampleChannelDays(addDays));

  const dealIds = new Map<string, string>();
  for (const d of deals) {
    const deal = await tx.deal.create({
      data: {
        profileId: userId,
        slug: d.slug,
        brand: d.brand,
        color: d.color,
        campaign: d.campaign,
        stage: d.stage,
        amount: d.amount,
        dueDate: fromIsoDate(d.dueDate),
        source: d.source,
        alertText: d.alert?.text,
        alertTone: d.alert?.tone,
        healthFinancial: d.health.financial,
        healthDeadline: d.health.deadline,
        healthContract: d.health.contract,
        healthScope: d.health.scope,
        invoiceNumber: d.invoice?.number,
        invoiceDueDate: d.invoice ? fromIsoDate(d.invoice.dueDate) : undefined,
        paidAt: d.paidAt ? fromIsoDate(d.paidAt) : undefined,
        reminderDraft: d.reminderDraft,
        terms: { create: d.terms.map((t, position) => ({ position, label: t.label, value: t.value, clause: t.clause, missing: t.missing ?? false })) },
        risks: { create: d.risks.map((r, position) => ({ position, title: r.title, fix: r.fix })) },
        deliverables: { create: d.deliverables.map((item, position) => ({ position, title: item.title, dueDate: fromIsoDate(item.dueDate), done: item.done })) },
      },
      select: { id: true },
    });
    dealIds.set(d.slug, deal.id);
  }

  const messageIds = new Map<string, string>();
  for (const m of messages) {
    const message = await tx.message.create({
      data: {
        profileId: userId,
        dealId: m.dealSlug ? dealIds.get(m.dealSlug) : undefined,
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
        receivedAt: new Date(m.receivedAt),
        readAt: m.read ? new Date(m.receivedAt) : undefined,
        draftReady: m.draftReady,
        minutesSaved: m.minutesSaved,
        drafts: m.drafts ? { create: TONES.map((tone) => ({ tone, text: m.drafts![tone] })) } : undefined,
      },
      select: { id: true },
    });
    messageIds.set(m.key, message.id);
    await indexSource(userId, "message", message.id, messageText({ fromName: m.fromName, subject: m.subject, body: m.body, summary: m.summary }), tx);
  }

  const ideaRows = await tx.idea.createManyAndReturn({
    data: sampleIdeas.map((idea) => ({ profileId: userId, ...idea })),
    select: { id: true },
  });

  await tx.todo.createMany({
    data: todos.map((t) => ({ profileId: userId, title: t.title, detail: t.detail, dueDate: fromIsoDate(t.dueDate), dueMinutes: t.dueMinutes, done: t.done })),
  });

  await tx.calendarEvent.createMany({
    data: events.map((e) => {
      const link =
        !e.link ? null
        : "deal" in e.link ? { href: `/dashboard/deals?deal=${e.link.deal}`, label: "Open deal" }
        : "message" in e.link ? { href: `/dashboard/inbox?m=${messageIds.get(e.link.message)}`, label: "Open message" }
        : { href: "/dashboard/publish", label: "Open in Publish" };
      return {
        profileId: userId,
        title: e.title,
        type: e.type,
        date: fromIsoDate(e.date),
        startMinutes: e.start,
        endMinutes: e.end,
        detail: e.detail,
        linkHref: link?.href,
        linkLabel: link?.label,
        tentative: e.tentative ?? false,
        done: e.done ?? false,
      };
    }),
  });

  // The same keys the alert job uses, so it doesn't raise these again.
  const tomorrow = addDays(today, 1);
  const dueTomorrow = await tx.deliverable.findMany({ where: { dueDate: fromIsoDate(tomorrow), deal: { profileId: userId } }, select: { id: true, dealId: true } });
  const dedupeKey = (a: (typeof alerts)[number]) => {
    const dealId = a.dealSlug ? dealIds.get(a.dealSlug) : undefined;
    if (a.kind === "overdue" && dealId) return `overdue:${dealId}`;
    if (a.kind === "deadline" && dealId) {
      const item = dueTomorrow.find((d) => d.dealId === dealId);
      return item ? `deadline:${item.id}` : undefined;
    }
    return undefined;
  };
  await tx.alert.createMany({
    data: alerts.map((a) => ({
      profileId: userId,
      dedupeKey: dedupeKey(a),
      dealId: a.dealSlug ? dealIds.get(a.dealSlug) : undefined,
      kind: a.kind,
      title: a.title,
      detail: a.detail,
      href: a.href,
      createdAt: new Date(a.createdAt),
      readAt: a.read ? new Date(a.createdAt) : undefined,
    })),
  });

  const seededVideo = await tx.video.create({
    select: { id: true },
    data: {
      profileId: userId,
      fileName: video.fileName,
      lengthSec: video.lengthSec,
      quality: video.quality,
      transcript: { create: video.transcript },
      clips: {
        create: video.clips.map((c, position) => ({
          position,
          short: c.short,
          title: c.title,
          quote: c.quote,
          startSec: c.startSec,
          endSec: c.endSec,
          suggestedStartSec: c.startSec,
          suggestedEndSec: c.endSec,
          why: c.why,
          hook: c.hook,
          color: c.color,
          hashtags: c.hashtags,
          captions: { create: (["reel", "short", "tiktok"] as const).map((platform) => ({ platform, options: c.captions[platform] })) },
        })),
      },
    },
  });

  await tx.channelDay.createMany({
    data: channelDays.map((d) => ({ profileId: userId, channel: d.channel, date: fromIsoDate(d.date), views: d.views, followers: d.followers, watchMinutes: d.watchMinutes })),
  });

  await tx.contentPost.createMany({
    data: topContent.map((p) => ({ profileId: userId, ...p, postedAt: fromIsoDate(p.postedAt) })),
  });

  await indexSource(userId, "transcript", seededVideo.id, video.transcript.map((l) => l.text).join(" "), tx);

  return { ideas: ideaRows.length };
}

// Deletes everything in the workspace and sends the account back through
// onboarding with default settings. The profile row (the Supabase user's
// id and email) stays.
export async function resetWorkspace(userId: string) {
  // Disconnecting Google revokes the grant there too, not just here.
  await revoke(userId).catch((err: unknown) => logger.warn("google revoke failed", { userId, error: errorMessage(err) }));
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { profileId: userId } }),
    prisma.alert.deleteMany({ where: { profileId: userId } }),
    prisma.todo.deleteMany({ where: { profileId: userId } }),
    prisma.idea.deleteMany({ where: { profileId: userId } }),
    prisma.deal.deleteMany({ where: { profileId: userId } }),
    prisma.calendarEvent.deleteMany({ where: { profileId: userId } }),
    prisma.video.deleteMany({ where: { profileId: userId } }),
    prisma.channelDay.deleteMany({ where: { profileId: userId } }),
    prisma.contentPost.deleteMany({ where: { profileId: userId } }),
    prisma.connectedAccount.deleteMany({ where: { profileId: userId } }),
    prisma.document.deleteMany({ where: { profileId: userId } }),
    prisma.chunk.deleteMany({ where: { profileId: userId } }),
    prisma.job.deleteMany({ where: { profileId: userId, status: { in: ["queued", "failed", "done"] } } }),
    prisma.profile.updateMany({ where: { id: userId }, data: { ...DEFAULT_SETTINGS, onboardedAt: null } }),
  ]);
}
