import { prisma } from "db";
import { features } from "../config/env";
import { dueBriefings } from "../services/briefing.service";
import { todayIn } from "../utils/dates";
import { errorMessage, logger } from "../utils/logger";
import { handlers } from "./handlers";
import { enqueue, pruneFinished, requeueStale, startWorker } from "./queue";

// Every minute, queues the work that is due: account syncs, hourly alerts,
// briefings at each creator's local time, posts whose time has come, and
// embeddings for new text. Keys stop duplicates; `ranRecently` stops a job
// being queued again too soon after it last finished.

const MINUTE = 60_000;
const SYNC_EVERY = { gmail: 10 * MINUTE, calendar: 15 * MINUTE, youtube: 6 * 60 * MINUTE } as const;

async function ranRecently(key: string, withinMs: number) {
  const job = await prisma.job.findFirst({
    where: { key, OR: [{ status: { in: ["queued", "running"] } }, { finishedAt: { gt: new Date(Date.now() - withinMs) } }] },
    select: { id: true },
  });
  return Boolean(job);
}

async function every(type: string, profileId: string, withinMs: number, payload = {}) {
  const key = `${type}:${profileId}`;
  if (!(await ranRecently(key, withinMs))) await enqueue(type, payload, { profileId, key });
}

export async function tick() {
  await requeueStale();

  if (features.google) {
    const accounts = await prisma.connectedAccount.findMany({ where: { status: "connected", provider: { in: ["gmail", "calendar", "youtube"] } }, select: { profileId: true, provider: true } });
    for (const a of accounts) await every(`sync.${a.provider}`, a.profileId, SYNC_EVERY[a.provider as keyof typeof SYNC_EVERY]);
  }

  const profiles = await prisma.profile.findMany({ where: { onboardedAt: { not: null } }, select: { id: true, timezone: true } });
  for (const p of profiles) await every("alerts.generate", p.id, 60 * MINUTE);

  for (const id of await dueBriefings()) {
    const tz = profiles.find((p) => p.id === id)?.timezone ?? "UTC";
    await enqueue("briefing.send", {}, { profileId: id, key: `briefing.send:${id}:${todayIn(tz)}`, maxAttempts: 3 });
  }

  const duePosts = await prisma.scheduledPost.findMany({ where: { status: "scheduled", scheduledAt: { lte: new Date() } }, select: { id: true, clip: { select: { video: { select: { profileId: true } } } } }, take: 50 });
  for (const post of duePosts) await enqueue("post.publish", { postId: post.id }, { profileId: post.clip.video.profileId, key: `post.publish:${post.id}`, maxAttempts: 3 });

  if (features.embeddings) {
    const pending = await prisma.$queryRaw<{ profileId: string }[]>`SELECT DISTINCT "profileId" FROM "Chunk" WHERE embedding IS NULL LIMIT 50`;
    for (const { profileId } of pending) await every("rag.embed", profileId, 0);
  }
}

// The worker and the scheduler together. Runs inside the API (RUN_WORKER)
// or on its own (src/worker.ts).
export function startBackground() {
  const worker = startWorker(handlers);
  let ticks = 0;
  const run = () =>
    tick()
      .then(() => (++ticks % 60 === 0 ? pruneFinished() : undefined))
      .catch((err: unknown) => logger.error("scheduler tick failed", { error: errorMessage(err) }));
  run();
  const timer = setInterval(run, MINUTE);
  logger.info("background worker started");
  return {
    stop: async () => {
      clearInterval(timer);
      await worker.stop();
    },
  };
}
