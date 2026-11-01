import "./helpers/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessContract } from "../src/services/dealHealth";
import { bodyText, htmlToText, parseAddress, replyMime } from "../src/services/integrations/gmail.service";
import { guessType } from "../src/services/integrations/calendar.service";
import { parseCsv, parseDate } from "../src/services/integrations/instagram.service";
import { durationSec } from "../src/services/integrations/youtube.service";
import { chunkText } from "../src/services/rag.service";
import { localizer } from "../src/services/sample.localize";
import { decrypt, encrypt, sign, verify } from "../src/utils/crypto";
import { isValidTimeZone, minutesNowIn, todayIn, weekStartIso, zonedToUtc } from "../src/utils/dates";
import { parseJson } from "../src/lib/ai";

describe("dates and time zones", () => {
  it("works out today and local time in a zone", () => {
    const at = new Date("2026-10-30T23:30:00Z");
    assert.equal(todayIn("UTC", at), "2026-10-30");
    assert.equal(todayIn("Asia/Tokyo", at), "2026-10-31");
    assert.equal(todayIn("America/Los_Angeles", at), "2026-10-30");
    assert.equal(minutesNowIn("Asia/Tokyo", at), 8 * 60 + 30);
  });
  it("turns a local time into UTC, across a DST change", () => {
    // London leaves summer time on 25 Oct 2026.
    assert.equal(zonedToUtc("2026-10-24", 9 * 60, "Europe/London").toISOString(), "2026-10-24T08:00:00.000Z");
    assert.equal(zonedToUtc("2026-10-26", 9 * 60, "Europe/London").toISOString(), "2026-10-26T09:00:00.000Z");
    assert.equal(zonedToUtc("2026-10-30", 18 * 60 + 30, "America/New_York").toISOString(), "2026-10-30T22:30:00.000Z");
  });
  it("validates zones and finds Mondays", () => {
    assert.equal(isValidTimeZone("Europe/London"), true);
    assert.equal(isValidTimeZone("Mars/Olympus"), false);
    assert.equal(weekStartIso("2026-11-01"), "2026-10-26");
    assert.equal(weekStartIso("2026-10-26"), "2026-10-26");
  });
});

describe("sample workspace dates", () => {
  it("shifts ISO dates and renders tokens for the new today", () => {
    const { walk, offset } = localizer("2026-11-04");
    assert.equal(offset, 7);
    const out = walk({ due: "2026-10-30", at: "2026-10-28T09:02:00Z", text: "deliver by {{2026-10-30:F}} ({{2026-10-30:f}}), due {{2026-10-22:D}}", href: "/dashboard/calendar?date=2026-10-29" });
    assert.deepEqual(out, { due: "2026-11-06", at: "2026-11-04T09:02:00Z", text: "deliver by Friday 6 November (Fri 6 Nov), due 29 Oct", href: "/dashboard/calendar?date=2026-11-05" });
  });
});

describe("RAG chunking", () => {
  it("keeps short text whole and splits long text with overlap", () => {
    assert.deepEqual(chunkText("  Hello   there.  "), ["Hello there."]);
    assert.deepEqual(chunkText(""), []);
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about the invoice and the deadline.`).join(" ");
    const chunks = chunkText(long);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.length <= 1400));
    assert.ok(chunks[1]!.includes("Sentence"), "overlap carries context");
  });
});

describe("Instagram CSV", () => {
  it("parses quotes, separators and line endings", () => {
    assert.deepEqual(parseCsv('date,views\r\n2026-10-01,"1,200"\n2026-10-02,900\n'), [["date", "views"], ["2026-10-01", "1,200"], ["2026-10-02", "900"]]);
    assert.deepEqual(parseCsv('a;"b ""quoted"""\n'), [["a", 'b "quoted"']]);
  });
  it("reads common date formats", () => {
    assert.equal(parseDate("2026-10-01"), "2026-10-01");
    assert.equal(parseDate("10/28/2026"), "2026-10-28");
    assert.equal(parseDate("28/10/2026"), "2026-10-28");
    assert.equal(parseDate("Oct 28, 2026"), "2026-10-28");
    assert.equal(parseDate("not a date"), null);
  });
});

describe("Gmail helpers", () => {
  it("parses From headers", () => {
    assert.deepEqual(parseAddress('"Alex · Nike" <alex@nike.com>'), { name: "Alex · Nike", address: "alex@nike.com" });
    assert.deepEqual(parseAddress("jess@glossier.com"), { name: "jess@glossier.com", address: "jess@glossier.com" });
  });
  it("finds the body and drops the quoted thread", () => {
    const enc = (s: string) => Buffer.from(s).toString("base64url");
    const part = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: enc("Hi Maya,\n\nCan you do Friday?\n\nOn Mon, 26 Oct 2026, Maya wrote:\n> old") } }] };
    assert.equal(bodyText(part), "Hi Maya,\n\nCan you do Friday?");
    assert.equal(htmlToText("<p>Hi&nbsp;there</p><p>Second &amp; last</p>"), "Hi there\n\nSecond & last");
  });
  it("writes a threaded reply", () => {
    const raw = Buffer.from(replyMime({ to: "alex@nike.com", subject: "Spring brief", inReplyTo: "<abc@mail>", text: "Thanks!" }), "base64url").toString("utf8");
    assert.match(raw, /^To: alex@nike.com\r\nSubject: Re: Spring brief\r\nIn-Reply-To: <abc@mail>\r\nReferences: <abc@mail>/);
    assert.ok(raw.endsWith(Buffer.from("Thanks!").toString("base64")));
  });
});

describe("tokens at rest and signed state", () => {
  it("round-trips encryption and rejects tampering", () => {
    const sealed = encrypt("1//refresh-token");
    assert.notEqual(sealed, "1//refresh-token");
    assert.equal(decrypt(sealed), "1//refresh-token");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    assert.throws(() => decrypt(parts.join(".")));
  });
  it("verifies signed state and rejects forged or expired ones", () => {
    const state = sign({ uid: "u1" }, 60);
    assert.equal(verify<{ uid: string }>(state)?.uid, "u1");
    assert.equal(verify(`${state.split(".")[0]}.AAAA`), null);
    assert.equal(verify(sign({ uid: "u1" }, -1)), null);
  });
});

describe("other helpers", () => {
  it("scores contracts like the board", () => {
    const { health, risks } = assessContract(
      { brand: "Sony", campaign: "Alpha", fee: 2800, deliverables: "1 YouTube video, 2 Shorts", due: "2026-11-29", usageDays: 90, usagePaid: false, payment: "net_60", revisions: "unlimited", stage: "new_offer", fileName: "x.pdf" },
      "2026-10-30",
    );
    assert.deepEqual(health, { financial: 16, deadline: 25, contract: 12, scope: 17 });
    assert.deepEqual(risks.map((r) => r.title), ["Net 60 payment", "Unlimited revisions", "Free usage rights"]);
  });
  it("reads YouTube durations, guesses event types and parses fenced JSON", () => {
    assert.equal(durationSec("PT1M5S"), 65);
    assert.equal(durationSec("PT2H"), 7200);
    assert.equal(guessType({ summary: "Film B-roll" }), "film");
    assert.equal(guessType({ summary: "Weekly sync with Leo" }), "call");
    assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  });
});
