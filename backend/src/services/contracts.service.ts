import { prisma } from "db";
import { z } from "zod";
import { env } from "../config/env";
import { AiUnavailableError, generateJson, type Part } from "../lib/ai";
import { badRequest } from "../utils/AppError";
import { clockFor } from "./clock.service";
import { indexSource } from "./rag.service";

// Reads an uploaded contract: pulls its text (pdf.js via unpdf), asks the
// model for the commercial terms and the clause each came from, keeps the
// text as a Document for search, and returns the terms for the creator to
// check before the deal is added. Scanned PDFs with no text layer are sent
// to Gemini as the PDF itself.

const termsSchema = z.object({
  brand: z.string().max(60),
  campaign: z.string().max(80),
  fee: z.number().int().min(0),
  deliverables: z.string().max(200),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usageDays: z.number().int().min(0).max(3650),
  usagePaid: z.boolean(),
  payment: z.enum(["net_15", "net_30", "net_45", "net_60", "missing"]),
  revisions: z.enum(["one", "two", "unlimited"]),
  clauses: z.object({
    fee: z.string().max(20).nullable(),
    deliverables: z.string().max(20).nullable(),
    due: z.string().max(20).nullable(),
    usageDays: z.string().max(20).nullable(),
    payment: z.string().max(20).nullable(),
    revisions: z.string().max(20).nullable(),
  }),
});
export type ExtractedTerms = z.infer<typeof termsSchema>;

const MAX_TEXT = 60_000;

async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    // unpdf is ESM-only; import() loads it from this CommonJS build.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/\s+\n/g, "\n").trim();
  } catch {
    throw badRequest("That file isn't a readable PDF.", "BAD_PDF");
  }
}

export async function readContract(userId: string, file: { buffer: Buffer; originalname: string; mimetype: string }) {
  const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
  const isText = file.mimetype.startsWith("text/") || /\.(txt|md)$/i.test(file.originalname);
  if (!isPdf && !isText) throw badRequest("Upload the contract as a PDF.", "UNSUPPORTED_FILE");

  const bytes = new Uint8Array(file.buffer);
  let text = isPdf ? await pdfText(bytes) : file.buffer.toString("utf8").trim();
  const scanned = isPdf && text.length < 200;
  if (scanned && !env.GEMINI_API_KEY) throw new AiUnavailableError("This PDF is a scan with no text. Reading scans needs GEMINI_API_KEY on this server.");
  text = text.slice(0, MAX_TEXT);

  const { today } = await clockFor(userId);
  const prompt: Part[] = scanned
    ? [{ inlineData: { mimeType: "application/pdf", data: file.buffer.toString("base64") } }, { text: "The contract is the attached PDF." }]
    : [{ text: `Contract text:\n\n${text}` }];
  const terms = await generateJson(
    {
      system: [
        "You read influencer and brand-sponsorship contracts for the creator being hired.",
        `Today is ${today}. Give dates as YYYY-MM-DD.`,
        "brand: the company paying. campaign: a short name for the campaign. fee: the total fee in whole dollars (0 if none). deliverables: a comma-separated list like \"1 YouTube video, 2 Shorts\". due: the final delivery date.",
        "usageDays: how long the brand may use the content (0 if not stated; 3650 for perpetual). usagePaid: true only if there is a separate fee for usage or paid ads.",
        "payment: net_15, net_30, net_45, net_60 (pick the nearest), or missing when the contract gives no payment terms. revisions: one, two, or unlimited (also unlimited when not capped).",
        "clauses: the section number each term came from, like \"§5.1\", or null.",
        "Only use what the contract says. Reply with JSON only.",
      ].join("\n"),
      prompt,
      temperature: 0,
    },
    termsSchema,
  );

  if (scanned) text = `${terms.brand} · ${terms.campaign}: ${terms.deliverables}, $${terms.fee}, due ${terms.due}.`;
  const doc = await prisma.document.create({ data: { profileId: userId, kind: "contract", fileName: file.originalname.slice(0, 200), text } });
  await indexSource(userId, "document", doc.id, `Contract ${file.originalname}\n${text}`);
  return { documentId: doc.id, fileName: doc.fileName, terms };
}
