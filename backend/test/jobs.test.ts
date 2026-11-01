import { TEST_DB, calls, json, on, startApi, token } from "./helpers/setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// The job queue, the scheduler and what it runs: alerts, the briefing
// email and posting scheduled clips.

const skip = !TEST_DB && "set TEST_DATABASE_URL to run the integration tests";

describe("background jobs", { skip }, () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let db: typeof import("db").prisma;
  let queue: typeof import("../src/jobs/queue");
  let scheduler: typeof import("../src/jobs/scheduler");
  const user = token({ name: "Maya Lopez" });

  before(async () => {
    on("POST", "https://generativelanguage.googleapis.com/", (req) => json({ embeddings: req.json<{ requests: unknown[] }>().requests.map(() => ({ values: new Array(768).fill(0.1) })) }));
    api = await startApi();
    db = (await import("db")).prisma;
    queue = await import("../src/jobs/queue");
    scheduler = await import("../src/jobs/scheduler");
    await api.call(user.token, "POST", "/api/profile/onboarding", { niche: "Tech & gear", goals: ["Save time"], briefingTime: "0:00", timezone: "UTC" });
  });
  after(() => api.close());

  it("dedupes by key, retries with backoff, then gives up", async () => {
    const key = `test.flaky:${user.sub}`;
    const job = await queue.enqueue("test.flaky", { n: 1 }, { profileId: user.sub, key, maxAttempts: 2 });
    assert.ok(job);
    assert.equal(await queue.enqueue("test.flaky", {}, { profileId: user.sub, key }), null);

    const boom = { "test.flaky": async () => { throw new Error("boom"); } };
    const claimed = await db.job.update({ where: { id: job.id }, data: { status: "running", attempts: 1 } });
    await queue.runJob(claimed, boom);
    let row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, "queued");
    assert.equal(row.lastError, "boom");
    assert.ok(row.runAt.getTime() > Date.now() + 60_000, "retries later, not straight away");

    await queue.runJob(await db.job.update({ where: { id: job.id }, data: { status: "running", attempts: 2 } }), boom);
    row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, "failed");
  });

  it("runs queued jobs with the worker", async () => {
    let ran = 0;
    await queue.enqueue("test.ok", {}, { profileId: user.sub });
    const worker = queue.startWorker({ "test.ok": async () => { ran++; } }, { idleMs: 50 });
    for (let i = 0; i < 40 && ran === 0; i++) await new Promise((r) => setTimeout(r, 50));
    await worker.stop();
    assert.equal(ran, 1);
    assert.equal((await db.job.findFirstOrThrow({ where: { type: "test.ok", profileId: user.sub } })).status, "done");
  });

  it("raises alerts once, from the workspace's data", async () => {
    const { generateAlerts } = await import("../src/services/alerts.job");
    const before = await db.alert.count({ where: { profileId: user.sub } });
    await generateAlerts(user.sub);
    await generateAlerts(user.sub);
    const overdue = await db.alert.findMany({ where: { profileId: user.sub, kind: "overdue" } });
    assert.equal(overdue.length, 1, "the sample's overdue alert isn't doubled");
    const added = (await db.alert.count({ where: { profileId: user.sub } })) - before;
    assert.ok(added <= 2, "only new deadlines or a weekly summary are added");
  });

  it("emails the briefing once a day, at the creator's time", async () => {
    const { dueBriefings, sendBriefing } = await import("../src/services/briefing.service");
    assert.ok((await dueBriefings()).includes(user.sub));
    let mail: { to: string[]; subject: string; html: string } | null = null;
    on("POST", "https://api.resend.com/emails", (req) => {
      mail = req.json();
      return json({ id: "email-1" });
    });
    await sendBriefing(user.sub);
    assert.deepEqual(mail!.to, [`${user.sub.slice(0, 8)}@test.dev`]);
    assert.match(mail!.subject, /^Your briefing: /);
    assert.match(mail!.html, /Good morning, Maya/);
    const sends = calls.filter((c) => c.url.hostname === "api.resend.com").length;
    await sendBriefing(user.sub);
    assert.equal(calls.filter((c) => c.url.hostname === "api.resend.com").length, sends, "not twice in a day");
    assert.ok(!(await dueBriefings()).includes(user.sub));
  });

  it("posts scheduled clips when they're due, honestly marking what needs the creator", async () => {
    const video = (await api.call(user.token, "GET", "/api/videos")).body.data[0];
    const clip = video.clips[0];
    const today = new Date().toISOString().slice(0, 10);
    await api.call(user.token, "POST", `/api/clips/${clip.id}/schedule`, { posts: [{ platform: "reel", date: today, minutes: 0, why: "test" }] });
    await scheduler.tick();
    const job = await db.job.findFirstOrThrow({ where: { type: "post.publish", profileId: user.sub } });
    const { handlers } = await import("../src/jobs/handlers");
    await queue.runJob(await db.job.update({ where: { id: job.id }, data: { status: "running", attempts: 1 } }), handlers);

    const post = (await api.call(user.token, "GET", "/api/posts")).body.data.find((p: { clipId: string }) => p.clipId === clip.id);
    assert.equal(post.status, "needs_manual");
    assert.match(post.error, /sample video/);
    const alert = (await api.call(user.token, "GET", "/api/alerts")).body.data.find((a: { title: string }) => a.title.includes("ready to post on Instagram"));
    assert.ok(alert);
  });

  it("queues embeddings for new text", async () => {
    await scheduler.tick();
    assert.ok(await db.job.findFirst({ where: { type: "rag.embed", profileId: user.sub } }));
  });
});
