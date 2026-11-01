import { prisma, type Category, type Tone } from "db";
import { z } from "zod";
import { features } from "../config/env";
import { generateJson } from "../lib/ai";
import type { MessageDto } from "../types/api";
import { badRequest, notFound } from "../utils/AppError";
import { messageInclude, toMessageDto } from "./mappers";
import { describeHits, searchWorkspace } from "./rag.service";

// AI writing for the inbox: sorting a new message, and drafting a reply in
// all three tones. Drafts mark the key facts with ==double equals== (the
// inbox highlights them) and end with the creator's sign-off. Context comes
// from the linked deal and, through RAG, the creator's own past replies.

const draftsSchema = z.object({ friendly: z.string().min(1), professional: z.string().min(1), shorter: z.string().min(1) });

// requested: the creator asked for this reply (Draft a reply / Regenerate),
// so it shows even when Settings › Replies doesn't auto-draft this category.
// The background job writes drafts ahead without marking them requested.
export async function writeDrafts(userId: string, messageId: string, opts: { requested?: boolean } = {}): Promise<MessageDto> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, profileId: userId },
    include: { deal: { include: { terms: { orderBy: { position: "asc" } }, risks: { orderBy: { position: "asc" } } } } },
  });
  if (!message) throw notFound("Message");
  if (message.category === "spam") throw badRequest("Spam doesn't need a reply", "SPAM_REPLY");
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });

  // Past replies only help match the voice: give up on them after 8 seconds.
  const past = await Promise.race([
    searchWorkspace(userId, `${message.subject} ${message.body.join(" ")}`.slice(0, 400), { sources: ["reply"], limit: 3 }).catch(() => []),
    new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 8_000)),
  ]);
  const examples = (await describeHits(userId, past)).map((h) => `- ${h.text}`).join("\n");
  const deal = message.deal;
  const dealFacts = deal
    ? [`Linked deal: ${deal.brand} · ${deal.campaign}, $${deal.amount}, stage ${deal.stage}.`, ...deal.terms.map((t) => `${t.label}: ${t.value}${t.missing ? " (missing)" : ""}`), ...deal.risks.map((r) => `Risk: ${r.title} → ${r.fix}`)].join("\n")
    : "";
  const isShortForm = message.source !== "gmail";

  const drafts = await generateJson(
    {
      system: [
        `You write replies for ${profile.name || "a content creator"}${profile.niche ? `, a ${profile.niche.toLowerCase()} creator` : ""}${profile.channel ? ` (${profile.channel})` : ""}.`,
        "Write as the creator, first person. Never invent facts, dates, prices or promises that aren't in the message, the deal or the creator's past replies; when something must be confirmed, ask for it.",
        "Wrap the 2–4 key facts (dates, amounts, asks) in ==double equals==.",
        isShortForm
          ? "This is a comment or DM: one to three sentences, no greeting line, no sign-off."
          : `This is an email: greeting line, short paragraphs separated by blank lines, and end with exactly this sign-off:\n${profile.signOff || `Best,\n${(profile.name || "").split(" ")[0]}`.trim()}`,
        'Reply with JSON: {"friendly": "...", "professional": "...", "shorter": "..."}. friendly is warm, professional is formal, shorter is the briefest version that still answers.',
      ].join("\n"),
      prompt: [
        `From: ${message.fromName} <${message.fromAddress}>`,
        `Subject: ${message.subject}`,
        "",
        message.body.map((p) => p.replace(/\*\*/g, "")).join("\n\n"),
        dealFacts ? `\n${dealFacts}` : "",
        examples ? `\nHow the creator has replied before (match their voice, not their facts):\n${examples}` : "",
      ].join("\n"),
      temperature: 0.6,
      // The creator is waiting on the button: fail with a clear error rather
      // than hang while a provider struggles.
      timeoutMs: 40_000,
    },
    draftsSchema,
  );

  await prisma.$transaction([
    ...(Object.keys(drafts) as Tone[]).map((tone) =>
      prisma.messageDraft.upsert({
        where: { messageId_tone: { messageId, tone } },
        create: { messageId, tone, text: drafts[tone] },
        update: { text: drafts[tone] },
      }),
    ),
    prisma.message.update({ where: { id: messageId }, data: { draftReady: true, editedReply: null, ...(opts.requested ? { draftRequested: true } : {}) } }),
  ]);
  return toMessageDto(await prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude }));
}

// ── Sorting new messages ────────────────────────────────────────────────────

const triageSchema = z.object({
  category: z.enum(["brand_deal", "collab", "fan_question", "spam"]),
  summary: z.string().max(400),
  // A reply needs the creator's own decision (a new offer, a date to pick),
  // so Crevo shouldn't draft one unasked.
  needsDecision: z.boolean(),
  // The brand, when it's about a brand deal.
  brand: z.string().max(80).nullable(),
  // Short facts worth bolding in the message (dates, amounts).
  keyFacts: z.array(z.string().max(80)).max(4),
});
export type Triage = z.infer<typeof triageSchema>;

// Without a model: keyword rules, no summary.
function ruleTriage(text: string): Triage {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  const category: Category = has(["followers in", "guaranteed results", "crypto", "click here", "limited offer", "unsubscribe"])
    ? "spam"
    : has(["sponsor", "partnership", "brand deal", "campaign", "invoice", "rate card", "paid collaboration", "contract", "brief"])
      ? "brand_deal"
      : has(["collab", "collaborate", "podcast", "feature you", "guest", "together"])
        ? "collab"
        : "fan_question";
  return { category, summary: "", needsDecision: category !== "fan_question", brand: null, keyFacts: [] };
}

export async function triage(input: { fromName: string; fromAddress: string; subject: string; body: string; source: "gmail" | "youtube" | "instagram" }): Promise<Triage> {
  const text = `${input.subject}\n${input.body}`;
  if (!features.ai) return ruleTriage(text);
  try {
    return await generateJson(
      {
        system: [
          "You sort a content creator's incoming messages.",
          "Categories: brand_deal (a brand or agency about sponsorship, payment, invoices, briefs or contracts), collab (another creator, podcast or show wanting to work together), fan_question (a viewer's comment or question), spam (scams, follower selling, mass promotions).",
          "summary: one or two plain sentences on what they want and any deadline or amount. No preamble.",
          'Reply with JSON: {"category": "...", "summary": "...", "needsDecision": true|false, "brand": "..."|null, "keyFacts": ["..."]}.',
        ].join("\n"),
        prompt: `Source: ${input.source}\nFrom: ${input.fromName} <${input.fromAddress}>\nSubject: ${input.subject}\n\n${input.body.slice(0, 6000)}`,
        temperature: 0.1,
      },
      triageSchema,
    );
  } catch {
    // Sorting must never lose a message: fall back to the rules.
    return ruleTriage(text);
  }
}
