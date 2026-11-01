import { GEMINI, TEST_DB, calls, geminiText, json, on, startApi, token, type FakeRequest } from "./helpers/setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// The API end to end against a real Postgres (TEST_DATABASE_URL), with
// Gemini, Groq and Supabase faked at the network edge.

const skip = !TEST_DB && "set TEST_DATABASE_URL to run the integration tests";

// Deterministic "embeddings": words hashed into 768 buckets, so texts that
// share words point the same way.
function fakeVector(text: string) {
  const v = new Array<number>(768).fill(0);
  for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % 768]! += 1;
  }
  return v.map((x) => x + 0.001);
}

interface GeminiBody {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: string; parts: { text?: string; functionResponse?: { name: string; response: { result: unknown } } }[] }[];
}

// Answers like Gemini would, by what the system prompt asks for.
function fakeGemini(req: FakeRequest) {
  const body = req.json<GeminiBody>();
  const system = body.systemInstruction?.parts[0]?.text ?? "";
  if (system.includes("You write replies")) {
    return geminiText(JSON.stringify({ friendly: "Hi Alex,\n\nYes to ==Friday==!\n\nBest,\nMaya", professional: "Dear Alex,\n\nConfirmed for ==Friday==.\n\nBest,\nMaya", shorter: "Confirmed: ==Friday==." }));
  }
  if (system.includes("You read influencer")) {
    return geminiText(
      JSON.stringify({
        brand: "Rode",
        campaign: "Mic launch",
        fee: 1500,
        deliverables: "1 YouTube video",
        due: "2026-12-15",
        usageDays: 60,
        usagePaid: false,
        payment: "missing",
        revisions: "two",
        clauses: { fee: "§2", deliverables: "§1", due: "§1.2", usageDays: "§4", payment: null, revisions: "§3" },
      }),
    );
  }
  if (system.includes("Copilot inside Crevo")) {
    const answered = body.contents.flatMap((c) => c.parts).find((p) => p.functionResponse);
    if (!answered) return json({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_unpaid_invoices", args: {} } }] } }] });
    const invoices = answered.functionResponse!.response.result as { brand: string; amount: number }[];
    return geminiText(`${invoices[0]!.brand} owes you $${invoices[0]!.amount}.`);
  }
  if (system.includes("captions for")) return geminiText(JSON.stringify({ caption: "A brand new caption 🎥" }));
  return geminiText(JSON.stringify({ category: "fan_question", summary: "", needsDecision: false, brand: null, keyFacts: [] }));
}

describe("API", { skip }, () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  const a = token({ name: "Maya Lopez" });
  const b = token();

  before(async () => {
    on("POST", GEMINI, (req) => {
      if (req.url.pathname.endsWith(":batchEmbedContents")) {
        const { requests } = req.json<{ requests: { content: { parts: { text: string }[] } }[] }>();
        return json({ embeddings: requests.map((r) => ({ values: fakeVector(r.content.parts[0]!.text) })) });
      }
      return fakeGemini(req);
    });
    api = await startApi();
  });
  after(() => api.close());

  it("refuses requests without a valid Supabase token", async () => {
    assert.equal((await api.call(null, "GET", "/api/profile")).status, 401);
    assert.equal((await api.call("not.a.jwt", "GET", "/api/profile")).body.error, "INVALID_TOKEN");
    assert.equal((await api.call(token({ ttl: -60 }).token, "GET", "/api/profile")).status, 401);
    const forged = `${a.token.split(".").slice(0, 2).join(".")}.${Buffer.alloc(64).toString("base64url")}`;
    assert.equal((await api.call(forged, "GET", "/api/profile")).status, 401);
  });

  it("onboards with the account's name and zone and seeds a dated sample", async () => {
    const r = await api.call(a.token, "POST", "/api/profile/onboarding", { niche: "Tech & gear", goals: ["Save time"], briefingTime: "7:30", timezone: "Asia/Tokyo" });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.name, "Maya Lopez");
    assert.equal(r.body.data.timezone, "Asia/Tokyo");
    assert.equal(r.body.data.features.ai, true);
    const todos = await api.call(a.token, "GET", "/api/todos");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    assert.equal(todos.body.data[0].dueDate, today, "the sample's today is the creator's today");
    assert.equal((await api.call(a.token, "POST", "/api/workspace/sample")).status, 409);
    assert.equal((await api.call(b.token, "POST", "/api/profile/onboarding", { niche: "Beauty", goals: ["Save time"], briefingTime: "8:00", timezone: "Mars/Base" })).status, 400);
  });

  it("validates input and keeps users apart", async () => {
    const msgs = await api.call(a.token, "GET", "/api/messages?q=nike");
    const nike = msgs.body.data[0];
    assert.equal((await api.call(a.token, "GET", "/api/messages?limit=1000")).body.error, "VALIDATION_ERROR");
    assert.equal((await api.call(a.token, "PATCH", `/api/messages/${nike.id}`, { tone: "rude" })).status, 400);
    await api.call(b.token, "GET", "/api/profile");
    assert.equal((await api.call(b.token, "PATCH", `/api/messages/${nike.id}`, { read: true })).status, 404);
    assert.equal((await api.call(b.token, "POST", `/api/messages/${nike.id}/drafts`)).status, 404);
    assert.equal((await api.call(b.token, "GET", "/api/deals/nike")).status, 404);
  });

  it("drafts replies with AI, falling back to Groq when Gemini fails", async () => {
    const nike = (await api.call(a.token, "GET", "/api/messages?q=nike")).body.data[0];
    const r = await api.call(a.token, "POST", `/api/messages/${nike.id}/drafts`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.drafts.shorter, "Confirmed: ==Friday==.");
    const prompt = calls.filter((c) => c.url.pathname.includes(":generateContent")).at(-1)!.json<GeminiBody>();
    assert.match(prompt.systemInstruction!.parts[0]!.text, /Best,\nMaya/, "uses the creator's sign-off");
    assert.match(JSON.stringify(prompt.contents), /Spring campaign/, "includes the linked deal");

    on("POST", /:generateContent$/, () => json({ error: { message: "overloaded" } }, 503), { once: true });
    on("POST", "https://api.groq.com/openai/v1/chat/completions", () =>
      json({ choices: [{ message: { content: JSON.stringify({ friendly: "From Groq", professional: "From Groq.", shorter: "Groq." }) } }] }),
    );
    const fallback = await api.call(a.token, "POST", `/api/messages/${nike.id}/drafts`);
    assert.equal(fallback.body.data.drafts.friendly, "From Groq");
  });

  it("approves replies, indexes them and counts the time saved", async () => {
    const nike = (await api.call(a.token, "GET", "/api/messages?q=nike")).body.data[0];
    const r = await api.call(a.token, "POST", "/api/messages/approve", { items: [{ id: nike.id, text: "Hi Alex, confirmed for Friday." }] });
    assert.equal(r.body.data.messages[0].approvedReply, "Hi Alex, confirmed for Friday.");
    assert.equal(r.body.data.messages[0].delivery, "none", "sample messages have nowhere to deliver to");
    assert.equal(r.body.data.summary.minutesSavedThisWeek, 8);
  });

  it("answers Copilot with tools over the workspace", async () => {
    const r = await api.call(a.token, "POST", "/api/copilot", { question: "Who still owes me money?", history: [{ role: "user", text: "hi" }, { role: "model", text: "Hello!" }] });
    assert.equal(r.body.data.answer, "Glossier owes you $2500.");
  });

  it("reads a contract, keeps it for search and links it to the deal", async () => {
    const form = new FormData();
    form.set("file", new Blob(["§1 The creator delivers 1 YouTube video by 15 December. §4 Rode may use the content for 60 days. §2 Fee: $1,500."], { type: "text/plain" }), "rode-contract.txt");
    const read = await api.call(a.token, "POST", "/api/contracts/read", form);
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.equal(read.body.data.terms.brand, "Rode");
    const { terms, documentId } = read.body.data;
    const deal = await api.call(a.token, "POST", "/api/deals", {
      brand: terms.brand, campaign: terms.campaign, fee: terms.fee, deliverables: terms.deliverables, due: terms.due, usageDays: terms.usageDays,
      usagePaid: terms.usagePaid, payment: terms.payment, revisions: terms.revisions, stage: "new_offer", fileName: "rode-contract.txt", documentId,
      clauses: { fee: terms.clauses.fee, deliverables: terms.clauses.deliverables, usageDays: terms.clauses.usageDays, payment: terms.clauses.payment },
    });
    assert.equal(deal.status, 201);
    assert.equal(deal.body.data.terms[0].clause, "§2");
    assert.equal((await api.call(b.token, "POST", "/api/deals", { ...deal.body.data, documentId })).status, 400, "another user's document can't be linked");

    const unsupported = new FormData();
    unsupported.set("file", new Blob(["x"], { type: "image/png" }), "photo.png");
    assert.equal((await api.call(a.token, "POST", "/api/contracts/read", unsupported)).body.error, "UNSUPPORTED_FILE");
  });

  it("finds workspace text with hybrid search after the embed job", async () => {
    const { embedPending, searchWorkspace } = await import("../src/services/rag.service");
    const embedded = await embedPending(a.sub);
    assert.ok(embedded > 0);
    const hits = await searchWorkspace(a.sub, "how long can Rode use the content usage", { limit: 3 });
    assert.equal(hits[0]?.sourceType, "document");
    const words = await searchWorkspace(a.sub, "#0142", { limit: 3 });
    assert.ok(words.some((h) => h.content.includes("0142")), "exact words still match");
    assert.deepEqual(await searchWorkspace(b.sub, "Rode usage"), [], "search never crosses accounts");
  });

  it("writes new captions with AI", async () => {
    const video = (await api.call(a.token, "GET", "/api/videos")).body.data[0];
    const clip = video.clips[0];
    const r = await api.call(a.token, "POST", `/api/clips/${clip.id}/captions/reel/rewrite`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.captions.reel.options.at(-1), "A brand new caption 🎥");
    assert.equal(r.body.data.captions.reel.variant, r.body.data.captions.reel.options.length - 1);
  });

  it("previews the briefing from the workspace", async () => {
    const html = await api.call(a.token, "GET", "/api/briefing/preview?format=html&sections=deals");
    assert.equal(html.status, 200);
    assert.match(html.body, /Glossier/);
    assert.doesNotMatch(html.body, /Today&#39;s to-do|Today's to-do/);
    assert.equal((await api.call(a.token, "GET", "/api/briefing/preview?sections=nope")).status, 400);
  });

  it("imports Instagram metrics from CSV", async () => {
    const r = await api.call(a.token, "POST", "/api/integrations/instagram/import", { csv: "Date,Reach,New followers\n2026-10-01,\"1,200\",14\n02/10/2026,800,9\nbad,1,1\n", fileName: "insights.csv" });
    assert.equal(r.body.data.imported, 2);
    assert.equal(r.body.data.profile.accounts.instagram, "imported");
    assert.equal((await api.call(a.token, "POST", "/api/integrations/instagram/import", { csv: "a,b\n1,2", fileName: "x.csv" })).body.error, "CSV_COLUMNS");
  });

  it("says what isn't set up instead of pretending", async () => {
    assert.equal((await api.call(a.token, "POST", "/api/videos/uploads", { fileName: "v.mp4", size: 10, mimeType: "video/mp4" })).body.error, "STORAGE_NOT_CONFIGURED");
  });

  it("deletes the account and everything in it", async () => {
    const r = await api.call(b.token, "DELETE", "/api/account");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.loginDeleted, false, "no service-role key in tests, so the login stays");
    const again = await api.call(b.token, "GET", "/api/profile");
    assert.equal(again.body.data.hasWorkspace, false);
  });
});
