import { GEMINI, TEST_DB, calls, geminiText, json, on, startApi, token } from "./helpers/setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// Google OAuth, Gmail, Calendar and YouTube against faked Google APIs.

const skip = !TEST_DB && "set TEST_DATABASE_URL to run the integration tests";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const YT = "https://www.googleapis.com/youtube/v3";
const ALL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.upload",
].join(" ");
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("integrations", { skip }, () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let db: typeof import("db").prisma;
  let jobs: typeof import("../src/jobs/handlers").handlers;
  let runJob: typeof import("../src/jobs/queue").runJob;
  const user = token({ name: "Maya Lopez" });

  // Runs every queued job of a type for the user, like the worker would.
  async function drain(type: string) {
    const queued = await db.job.findMany({ where: { profileId: user.sub, type, status: "queued" } });
    for (const job of queued) await runJob(await db.job.update({ where: { id: job.id }, data: { status: "running", attempts: { increment: 1 } } }), jobs);
    return queued.length;
  }

  before(async () => {
    on("POST", "https://oauth2.googleapis.com/token", (req) => {
      const form = new URLSearchParams(req.text);
      if (form.get("grant_type") === "refresh_token") {
        return form.get("refresh_token") === "1//refresh" ? json({ access_token: "ya29.refreshed", expires_in: 3600 }) : json({ error: "invalid_grant" }, 400);
      }
      return form.get("code") === "good-code"
        ? json({ access_token: "ya29.first", expires_in: 3600, refresh_token: "1//refresh", scope: ALL_SCOPES, id_token: idToken("maya@gmail.com") })
        : json({ access_token: "ya29.partial", expires_in: 3600, refresh_token: "1//refresh", scope: "openid email", id_token: idToken("maya@gmail.com") });
    });
    on("POST", "https://oauth2.googleapis.com/revoke", () => new Response(null, { status: 200 }));
    on("POST", GEMINI, (req) => {
      const system = req.json<{ systemInstruction?: { parts: { text: string }[] } }>().systemInstruction?.parts[0]?.text ?? "";
      if (system.includes("You sort")) {
        const brand = req.text.includes("Nike") ? "Nike" : null;
        return geminiText(JSON.stringify({ category: brand ? "brand_deal" : "fan_question", summary: brand ? "Nike asks to confirm Friday." : "A viewer question.", needsDecision: false, brand, keyFacts: brand ? ["Friday 6 November"] : [] }));
      }
      if (system.includes("You write replies")) return geminiText(JSON.stringify({ friendly: "Hi!", professional: "Hello.", shorter: "Yes." }));
      return geminiText("{}");
    });
    on("POST", GEMINI.replace("/models/", "/models/") + "gemini-embedding-001:batchEmbedContents", (req) =>
      json({ embeddings: req.json<{ requests: unknown[] }>().requests.map(() => ({ values: new Array(768).fill(0.1) })) }),
    );
    api = await startApi();
    db = (await import("db")).prisma;
    jobs = (await import("../src/jobs/handlers")).handlers;
    runJob = (await import("../src/jobs/queue")).runJob;
    await api.call(user.token, "POST", "/api/profile/onboarding", { niche: "Tech & gear", goals: ["Save time"], briefingTime: "8:00", timezone: "Europe/London", sampleWorkspace: false });
  });
  after(() => api.close());

  it("connects Google with signed state and stores tokens encrypted", async () => {
    const start = await api.call(user.token, "GET", "/api/integrations/google/gmail/connect?returnTo=/dashboard/settings?tab=accounts");
    const url = new URL(start.body.data.url);
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.match(url.searchParams.get("scope")!, /gmail\.compose/);
    const state = url.searchParams.get("state")!;

    const forged = await api.call(null, "GET", `/integrations/google/callback?state=${state.slice(0, -3)}abc&code=good-code`);
    assert.match(forged.headers.get("location")!, /connect_error=expired/);
    const partial = await api.call(null, "GET", `/integrations/google/callback?state=${state}&code=partial-code`);
    assert.match(partial.headers.get("location")!, /connect_error=permissions/);

    const done = await api.call(null, "GET", `/integrations/google/callback?state=${state}&code=good-code`);
    assert.equal(done.status, 303);
    assert.equal(done.headers.get("location"), "http://localhost:3000/dashboard/settings?tab=accounts&connected=gmail");
    const conn = await db.googleConnection.findUniqueOrThrow({ where: { profileId: user.sub } });
    assert.equal(conn.googleEmail, "maya@gmail.com");
    assert.ok(!conn.refreshTokenEnc.includes("1//refresh"), "refresh token is encrypted");
    const profile = await api.call(user.token, "GET", "/api/profile");
    assert.equal(profile.body.data.accounts.gmail, "connected");
    assert.equal(profile.body.data.googleEmail, "maya@gmail.com");
  });

  it("syncs Gmail: sorts, links the deal, alerts, queues a draft, skips repeats", async () => {
    await api.call(user.token, "POST", "/api/deals", { brand: "Nike", campaign: "Spring", fee: 4000, deliverables: "1 Reel", due: "2026-12-01", usageDays: 30, usagePaid: false, payment: "net_30", revisions: "two", stage: "negotiating", fileName: "nike.pdf" });
    on("GET", `${GMAIL}/profile`, () => json({ emailAddress: "maya@gmail.com" }));
    on("GET", `${GMAIL}/messages`, (req) => (req.url.pathname.endsWith("/messages") ? json({ messages: [{ id: "g1" }, { id: "g2" }] }) : json({}, 404)));
    const message = (id: string, from: string, subject: string, body: string) => ({
      id,
      threadId: `t-${id}`,
      internalDate: String(Date.now() - 3600_000),
      payload: {
        mimeType: "multipart/alternative",
        headers: [{ name: "From", value: from }, { name: "Subject", value: subject }, { name: "Message-ID", value: `<${id}@mail.gmail.com>` }],
        parts: [{ mimeType: "text/plain", body: { data: b64(body) } }],
      },
    });
    on("GET", `${GMAIL}/messages/g1`, () => json(message("g1", "Alex · Nike <alex@nike.com>", "Spring brief", "Hi Maya, can you deliver by Friday 6 November?\n\nOn Mon, Maya wrote:\n> older")));
    on("GET", `${GMAIL}/messages/g2`, () => json(message("g2", "Maya <maya@gmail.com>", "Note to self", "my own mail")));

    assert.equal(await drain("sync.gmail"), 1);
    const inbox = (await api.call(user.token, "GET", "/api/messages")).body.data;
    assert.equal(inbox.length, 1, "the creator's own mail is skipped");
    const nike = inbox[0];
    assert.equal(nike.category, "brand_deal");
    assert.equal(nike.dealSlug?.startsWith("nike-"), true);
    assert.deepEqual(nike.body, ["Hi Maya, can you deliver by **Friday 6 November**?"], "quoted history is cut, key facts bolded");
    assert.equal(nike.delivery, "gmail_draft");
    assert.equal(nike.externalUrl, "https://mail.google.com/mail/u/0/#all/t-g1");
    assert.equal((await api.call(user.token, "GET", "/api/alerts")).body.data[0].kind, "new_deal");

    await drain("drafts.write");
    assert.equal((await api.call(user.token, "GET", "/api/messages")).body.data[0].drafts.shorter, "Yes.");

    await db.job.create({ data: { profileId: user.sub, type: "sync.gmail" } });
    await drain("sync.gmail");
    assert.equal((await api.call(user.token, "GET", "/api/messages")).body.data.length, 1, "no duplicates on the next sync");
  });

  it("saves an approved reply as a threaded Gmail draft", async () => {
    const nike = (await api.call(user.token, "GET", "/api/messages")).body.data[0];
    let sent = "";
    on("POST", `${GMAIL}/drafts`, (req) => {
      const body = req.json<{ message: { threadId: string; raw: string } }>();
      sent = Buffer.from(body.message.raw, "base64url").toString("utf8");
      assert.equal(body.message.threadId, "t-g1");
      return json({ id: "draft-1" });
    });
    await api.call(user.token, "POST", "/api/messages/approve", { items: [{ id: nike.id, text: "Yes, Friday works." }] });
    await drain("gmail.draft");
    assert.match(sent, /In-Reply-To: <g1@mail.gmail.com>/);
    assert.match(sent, /Subject: Re: Spring brief/);
    assert.equal((await api.call(user.token, "GET", "/api/messages")).body.data[0].delivered, true);
  });

  it("refreshes an expired access token, and marks revoked access", async () => {
    await db.googleConnection.update({ where: { profileId: user.sub }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    const before = calls.length;
    await db.job.create({ data: { profileId: user.sub, type: "sync.gmail" } });
    await drain("sync.gmail");
    const refreshed = calls.slice(before).find((c) => c.url.href === "https://oauth2.googleapis.com/token");
    assert.equal(new URLSearchParams(refreshed!.text).get("grant_type"), "refresh_token");

    on("GET", `${GMAIL}/profile`, () => new Response("unauthorized", { status: 401 }), { once: true });
    await db.job.create({ data: { profileId: user.sub, type: "sync.gmail" } });
    await drain("sync.gmail");
    const profile = (await api.call(user.token, "GET", "/api/profile")).body.data;
    assert.equal(profile.accounts.gmail, "disconnected");
    assert.match(profile.sync.gmail.lastError, /removed/);
  });

  it("syncs Google Calendar both ways", async () => {
    const start = (await api.call(user.token, "GET", "/api/integrations/google/calendar/connect")).body.data.url;
    await api.call(null, "GET", `/integrations/google/callback?state=${new URL(start).searchParams.get("state")}&code=good-code`);
    on("GET", CAL, () =>
      json({
        items: [
          { id: "ev1", status: "confirmed", summary: "Call with Leo", htmlLink: "https://calendar.google.com/ev1", start: { dateTime: "2026-11-03T14:00:00Z" }, end: { dateTime: "2026-11-03T15:00:00Z" } },
          { id: "ev2", status: "confirmed", summary: "Pushed by us", start: { date: "2026-11-04" }, extendedProperties: { private: { crevo: "1" } } },
        ],
      }),
    );
    const pushed: string[] = [];
    on("POST", CAL, (req) => {
      pushed.push(req.json<{ summary: string }>().summary);
      return json({ id: `g-${pushed.length}` });
    });
    const far = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await api.call(user.token, "POST", "/api/events", { title: "Film B-roll", type: "film", date: far, startMinutes: 600, endMinutes: 660 });
    const deal = (await api.call(user.token, "GET", "/api/deals")).body.data[0];
    await api.call(user.token, "PATCH", `/api/deals/${deal.slug}`, { inCalendar: true });
    await drain("sync.calendar");

    const events = (await api.call(user.token, "GET", "/api/events")).body.data;
    const leo = events.find((e: { title: string }) => e.title === "Call with Leo");
    assert.equal(leo.date, "2026-11-03");
    assert.equal(leo.startMinutes, 14 * 60, "14:00 UTC is 14:00 in London after the clocks change");
    assert.equal(leo.link.href, "https://calendar.google.com/ev1");
    assert.ok(!events.some((e: { title: string }) => e.title === "Pushed by us"), "our own events don't come back");
    assert.deepEqual(pushed.sort(), ["Film B-roll", "Nike: 1 Reel"]);
  });

  it("syncs YouTube stats, videos and comments, and posts approved replies", async () => {
    const start = (await api.call(user.token, "GET", "/api/integrations/google/youtube/connect")).body.data.url;
    await api.call(null, "GET", `/integrations/google/callback?state=${new URL(start).searchParams.get("state")}&code=good-code`);
    on("GET", `${YT}/channels`, () => json({ items: [{ id: "UC1", snippet: { title: "Maya", customUrl: "@mayalopez" }, statistics: { subscriberCount: "180000" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] }));
    on("GET", "https://youtubeanalytics.googleapis.com/v2/reports", () => json({ rows: [["2026-10-28", 12000, 30000, 40], ["2026-10-29", 15000, 33000, 55]] }));
    on("GET", `${YT}/playlistItems`, () => json({ items: [{ contentDetails: { videoId: "v1" } }] }));
    on("GET", `${YT}/videos`, () => json({ items: [{ id: "v1", snippet: { title: "Camera setup", publishedAt: "2026-10-20T10:00:00Z" }, statistics: { viewCount: "1000", likeCount: "80", commentCount: "20" }, contentDetails: { duration: "PT45S" } }] }));
    on("GET", `${YT}/commentThreads`, () =>
      json({
        items: [
          { snippet: { videoId: "v1", topLevelComment: { id: "c1", snippet: { authorDisplayName: "@sam", authorChannelId: { value: "UCfan" }, textOriginal: "What mic is that?", publishedAt: new Date().toISOString() } } } },
          { snippet: { videoId: "v1", topLevelComment: { id: "c2", snippet: { authorDisplayName: "Maya", authorChannelId: { value: "UC1" }, textOriginal: "Pinned!", publishedAt: new Date().toISOString() } } } },
        ],
      }),
    );
    await drain("sync.youtube");

    const analytics = (await api.call(user.token, "GET", "/api/analytics?range=90")).body.data;
    assert.equal(analytics.topContent[0].format, "Short");
    assert.equal(analytics.topContent[0].engagement, 10);
    assert.equal((await api.call(user.token, "GET", "/api/profile")).body.data.channel, "@mayalopez · 180k on YouTube");
    const comment = (await api.call(user.token, "GET", "/api/messages?category=fan_question")).body.data.find((m: { externalUrl: string }) => m.externalUrl?.includes("lc=c1"));
    assert.ok(comment, "the viewer's comment is in the inbox, the creator's own isn't");
    assert.equal(comment.delivery, "youtube_reply");

    let posted: { snippet: { parentId: string; textOriginal: string } } | null = null;
    on("POST", `${YT}/comments`, (req) => {
      posted = req.json();
      return json({ id: "reply-1" });
    });
    await api.call(user.token, "POST", "/api/messages/approve", { items: [{ id: comment.id, text: "A wireless clip-on!" }] });
    await drain("youtube.reply");
    assert.deepEqual(posted, { snippet: { parentId: "c1", textOriginal: "A wireless clip-on!" } });
  });

  it("revokes the Google grant when the last Google account is disconnected", async () => {
    await api.call(user.token, "DELETE", "/api/integrations/calendar");
    assert.ok(await db.googleConnection.findUnique({ where: { profileId: user.sub } }), "YouTube still uses it");
    assert.equal(await db.calendarEvent.count({ where: { profileId: user.sub, source: "google" } }), 0);
    await api.call(user.token, "DELETE", "/api/integrations/youtube");
    assert.equal(await db.googleConnection.findUnique({ where: { profileId: user.sub } }), null);
    assert.ok(calls.some((c) => c.url.href === "https://oauth2.googleapis.com/revoke"));
  });
});
