import { prisma, type ChunkSource, type Prisma } from "db";
import { features } from "../config/env";
import { embed } from "../lib/ai";
import { enqueue } from "../jobs/queue";
import { errorMessage, logger } from "../utils/logger";

// Retrieval for Copilot and reply drafts. Text from messages, approved
// replies, contracts and transcripts is split into chunks; the embed job
// adds a Gemini embedding to each. Search runs two queries over the
// creator's own chunks (vector similarity and Postgres full-text) and
// merges them with reciprocal rank fusion, so it still finds exact words
// (invoice numbers, brand names) and still works before embeddings exist.

type Db = Prisma.TransactionClient | typeof prisma;

const CHUNK_CHARS = 900;
const OVERLAP_CHARS = 150;

// Paragraph-aware splitting with a little overlap between chunks.
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];
  const pieces = clean.split(/\n\n|(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 1 > CHUNK_CHARS) {
      chunks.push(current.trim());
      current = current.slice(-OVERLAP_CHARS);
    }
    current += (current ? " " : "") + piece;
    while (current.length > CHUNK_CHARS * 1.5) {
      chunks.push(current.slice(0, CHUNK_CHARS).trim());
      current = current.slice(CHUNK_CHARS - OVERLAP_CHARS);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Replaces a source's chunks and queues the embedding.
export async function indexSource(userId: string, sourceType: ChunkSource, sourceId: string, text: string, db: Db = prisma) {
  const chunks = chunkText(text);
  await db.chunk.deleteMany({ where: { sourceType, sourceId } });
  if (chunks.length === 0) return;
  await db.chunk.createMany({ data: chunks.map((content, position) => ({ profileId: userId, sourceType, sourceId, position, content })) });
  if (features.embeddings && db === prisma) await enqueueEmbedding(userId);
}

export async function enqueueEmbedding(userId: string) {
  await enqueue("rag.embed", {}, { profileId: userId, key: `rag.embed:${userId}` });
}

export async function removeSource(sourceType: ChunkSource, sourceId: string, db: Db = prisma) {
  await db.chunk.deleteMany({ where: { sourceType, sourceId } });
}

const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;

// Embeds this creator's chunks that have none yet, 100 at a time. Returns
// how many it embedded. (Raw SQL: Prisma can't read or write vector columns.)
export async function embedPending(userId: string, batch = 100): Promise<number> {
  if (!features.embeddings) return 0;
  let total = 0;
  for (;;) {
    const pending = await prisma.$queryRaw<{ id: string; content: string }[]>`
      SELECT id, content FROM "Chunk" WHERE "profileId" = ${userId}::uuid AND embedding IS NULL ORDER BY "createdAt" LIMIT ${batch}`;
    if (pending.length === 0) return total;
    const vectors = await embed(pending.map((c) => c.content), "RETRIEVAL_DOCUMENT");
    await prisma.$transaction(pending.map((c, i) => prisma.$executeRaw`UPDATE "Chunk" SET embedding = ${vectorLiteral(vectors[i]!)}::vector WHERE id = ${c.id}`));
    total += pending.length;
    if (pending.length < batch) return total;
  }
}

export interface SearchHit {
  id: string;
  sourceType: ChunkSource;
  sourceId: string;
  content: string;
  score: number;
}

const RRF_K = 60;

export async function searchWorkspace(userId: string, query: string, opts: { limit?: number; sources?: ChunkSource[] } = {}): Promise<SearchHit[]> {
  const limit = opts.limit ?? 6;
  const sources = opts.sources ?? ["message", "reply", "document", "transcript"];
  const q = query.trim().slice(0, 500);
  if (!q) return [];

  const keyword = prisma.$queryRaw<Omit<SearchHit, "score">[]>`
    SELECT id, "sourceType", "sourceId", content FROM "Chunk"
    WHERE "profileId" = ${userId}::uuid
      AND "sourceType"::text = ANY(${sources})
      AND to_tsvector('english', content) @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank(to_tsvector('english', content), websearch_to_tsquery('english', ${q})) DESC
    LIMIT 20`;

  let vector: Promise<Omit<SearchHit, "score">[]> = Promise.resolve([]);
  if (features.embeddings) {
    vector = embed([q], "RETRIEVAL_QUERY")
      .then(([v]) => prisma.$queryRaw<Omit<SearchHit, "score">[]>`
        SELECT id, "sourceType", "sourceId", content FROM "Chunk"
        WHERE "profileId" = ${userId}::uuid AND "sourceType"::text = ANY(${sources}) AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral(v!)}::vector
        LIMIT 20`)
      .catch((err: unknown) => {
        // The query embedding failed: keyword results alone still answer.
        logger.warn("vector search skipped", { error: errorMessage(err) });
        return [];
      });
  }

  const [byWords, byMeaning] = await Promise.all([keyword, vector]);
  const merged = new Map<string, SearchHit>();
  for (const list of [byWords, byMeaning]) {
    list.forEach((hit, rank) => {
      const prev = merged.get(hit.id);
      merged.set(hit.id, { ...hit, score: (prev?.score ?? 0) + 1 / (RRF_K + rank + 1) });
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// Where a hit came from, in words, for prompts and answers.
export async function describeHits(userId: string, hits: SearchHit[]) {
  const ids = (type: ChunkSource) => hits.filter((h) => h.sourceType === type).map((h) => h.sourceId);
  const [messages, documents, videos] = await Promise.all([
    prisma.message.findMany({ where: { profileId: userId, id: { in: [...ids("message"), ...ids("reply")] } }, select: { id: true, subject: true, fromName: true } }),
    prisma.document.findMany({ where: { profileId: userId, id: { in: ids("document") } }, select: { id: true, fileName: true } }),
    prisma.video.findMany({ where: { profileId: userId, id: { in: ids("transcript") } }, select: { id: true, fileName: true } }),
  ]);
  const label = (h: SearchHit) => {
    if (h.sourceType === "message") {
      const m = messages.find((x) => x.id === h.sourceId);
      return m ? `Message from ${m.fromName}: "${m.subject}"` : "A message";
    }
    if (h.sourceType === "reply") {
      const m = messages.find((x) => x.id === h.sourceId);
      return m ? `Your reply to ${m.fromName} ("${m.subject}")` : "One of your replies";
    }
    if (h.sourceType === "document") return `Document ${documents.find((x) => x.id === h.sourceId)?.fileName ?? ""}`.trim();
    return `Transcript of ${videos.find((x) => x.id === h.sourceId)?.fileName ?? "a video"}`;
  };
  return hits.map((h) => ({ source: label(h), sourceType: h.sourceType, sourceId: h.sourceId, text: h.content }));
}

// What a message contributes to search: who, what and the body.
export function messageText(m: { fromName: string; subject: string; body: string[]; summary: string | null }) {
  return [`From: ${m.fromName}`, `Subject: ${m.subject}`, ...m.body.map((p) => p.replace(/\*\*/g, "")), m.summary ? `Summary: ${m.summary}` : ""].filter(Boolean).join("\n");
}
