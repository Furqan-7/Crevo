import { prisma, type Job, type Prisma } from "db";
import { errorMessage, logger } from "../utils/logger";

// A small Postgres-backed job queue. Jobs are rows in "Job"; workers claim
// them with FOR UPDATE SKIP LOCKED, so several worker processes can run
// side by side without picking the same job. Failed jobs retry with
// exponential backoff up to maxAttempts.

export type JobHandler = (job: Job) => Promise<void>;

interface EnqueueOptions {
  profileId?: string;
  // While a job with this key is queued or running, enqueueing it again is a no-op.
  key?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueue(type: string, payload: Prisma.InputJsonValue = {}, opts: EnqueueOptions = {}): Promise<Job | null> {
  if (opts.key) {
    const pending = await prisma.job.findFirst({ where: { key: opts.key, status: { in: ["queued", "running"] } }, select: { id: true } });
    if (pending) return null;
  }
  return prisma.job.create({
    data: { type, payload, profileId: opts.profileId, key: opts.key, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 },
  });
}

// Raw SQL because Prisma has no SKIP LOCKED: claim up to `limit` due jobs.
async function claim(limit: number): Promise<Job[]> {
  return prisma.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'running', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE status = 'queued' AND "runAt" <= now()
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

async function settle(job: Job, error?: unknown) {
  if (!error) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "done", finishedAt: new Date(), lockedAt: null, lastError: null } });
    return;
  }
  const message = errorMessage(error).slice(0, 1000);
  const retry = job.attempts < job.maxAttempts;
  await prisma.job.update({
    where: { id: job.id },
    data: retry
      ? { status: "queued", lockedAt: null, lastError: message, runAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000) }
      : { status: "failed", lockedAt: null, lastError: message, finishedAt: new Date() },
  });
  logger.warn("job failed", { type: job.type, id: job.id, attempt: job.attempts, retry, error: message });
}

export async function runJob(job: Job, handlers: Record<string, JobHandler>) {
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`no handler for job type ${job.type}`);
    await handler(job);
    await settle(job);
  } catch (err) {
    await settle(job, err);
  }
}

// Claims and runs jobs until stop() is called. `concurrency` jobs at a time.
export function startWorker(handlers: Record<string, JobHandler>, opts: { concurrency?: number; idleMs?: number } = {}) {
  const concurrency = opts.concurrency ?? 3;
  const idleMs = opts.idleMs ?? 2_000;
  let stopped = false;
  let running = 0;

  async function loop() {
    while (!stopped) {
      try {
        const free = concurrency - running;
        const jobs = free > 0 ? await claim(free) : [];
        for (const job of jobs) {
          running++;
          runJob(job, handlers).finally(() => running--);
        }
        if (jobs.length === 0) await new Promise((r) => setTimeout(r, idleMs));
      } catch (err) {
        logger.error("worker loop error", { error: errorMessage(err) });
        await new Promise((r) => setTimeout(r, idleMs * 5));
      }
    }
  }
  loop();
  return {
    stop: async () => {
      stopped = true;
      while (running > 0) await new Promise((r) => setTimeout(r, 100));
    },
  };
}

// Jobs left "running" by a worker that died are put back in the queue.
export async function requeueStale(olderThanMs = 15 * 60_000) {
  await prisma.job.updateMany({ where: { status: "running", lockedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: "queued", lockedAt: null } });
}

export async function pruneFinished(olderThanMs = 7 * 86_400_000) {
  await prisma.job.deleteMany({ where: { status: { in: ["done", "failed"] }, finishedAt: { lt: new Date(Date.now() - olderThanMs) } } });
}
