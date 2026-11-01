import { createReadStream } from "fs";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { Readable } from "stream";
import { tmpdir } from "os";
import { join } from "path";
import { prisma, type Prisma } from "db";
import { z } from "zod";
import { enqueue } from "../jobs/queue";
import { generateJson, uploadGeminiFile } from "../lib/ai";
import { probe, qualityLabel, renderShort, type FocusPoint } from "../lib/ffmpeg";
import { downloadToFile, fileInfo, safeName, signedDownload, signedUpload, supabaseAdmin, uploadFile } from "../lib/storage";
import { logger } from "../utils/logger";
import type { PublishPlatform } from "../types/api";
import { badRequest, notFound } from "../utils/AppError";
import { indexSource } from "./rag.service";
import { toVideoDto, videoInclude } from "./mappers";

// Real video uploads for Publish. The browser uploads straight to Supabase
// Storage with a signed URL; then a job reads the length and size with
// ffmpeg, has Gemini watch the video for a transcript, the clips worth
// posting (with where the speaker is in the frame) and captions for each
// platform, saves it all, and renders each clip as a vertical 9:16 short
// whose frame follows the speaker. Progress (0-100 and the current stage)
// is saved as it goes, for the progress bar in Publish.

const MAX_BYTES = 2 * 1024 ** 3;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/mpeg"];

export async function createUpload(userId: string, input: { fileName: string; size: number; mimeType: string }) {
  supabaseAdmin();
  if (!VIDEO_TYPES.includes(input.mimeType)) throw badRequest("Upload an MP4, MOV or WebM video.", "UNSUPPORTED_FILE");
  if (input.size > MAX_BYTES) throw badRequest("Videos can be up to 2 GB.", "FILE_TOO_LARGE");
  const video = await prisma.video.create({ data: { profileId: userId, fileName: input.fileName.slice(0, 200), status: "uploading", mimeType: input.mimeType } });
  const path = `${userId}/videos/${video.id}-${safeName(input.fileName)}`;
  await prisma.video.update({ where: { id: video.id }, data: { storagePath: path } });
  const upload = await signedUpload(path);
  return { videoId: video.id, path: upload.path, token: upload.token, signedUrl: upload.signedUrl };
}

// The browser calls this once its upload finished.
export async function startProcessing(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, profileId: userId } });
  if (!video) throw notFound("Video");
  if (video.status !== "uploading" && video.status !== "failed") throw badRequest("This video is already being processed", "ALREADY_PROCESSING");
  if (!video.storagePath || !(await fileInfo(video.storagePath))) throw badRequest("The upload didn't finish. Try uploading again.", "UPLOAD_MISSING");
  await prisma.video.update({ where: { id: video.id }, data: { status: "processing", error: null, progress: 1, stage: "Starting" } });
  await enqueue("video.process", { videoId }, { profileId: userId, key: `video.process:${videoId}`, maxAttempts: 2 });
  return toVideoDto(await prisma.video.findUniqueOrThrow({ where: { id: videoId }, include: videoInclude }));
}

export async function getVideo(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, profileId: userId }, include: videoInclude });
  if (!video) throw notFound("Video");
  return toVideoDto(video);
}

const PLATFORMS: PublishPlatform[] = ["reel", "short", "tiktok"];
const analysisSchema = z.object({
  transcript: z.array(z.object({ sec: z.number().min(0), text: z.string().min(1).max(500) })).min(1).max(400),
  clips: z
    .array(
      z.object({
        title: z.string().max(120),
        short: z.string().max(30),
        quote: z.string().max(160),
        startSec: z.number().min(0),
        endSec: z.number().min(1),
        why: z.string().max(120),
        hook: z.number().int().min(0).max(100),
        captions: z.object({ reel: z.array(z.string()).min(1).max(3), short: z.array(z.string()).min(1).max(3), tiktok: z.array(z.string()).min(1).max(3) }),
        hashtags: z.array(z.string()).max(10),
        focus: z.array(z.object({ sec: z.number().min(0), x: z.number().min(0).max(1) })).max(60).optional(),
      }),
    )
    .min(1)
    .max(5),
});

const CLIP_COLORS = ["#7b77e8", "#56c25a", "#e2a400", "#2a6df4", "#eb6834"];

// Saves progress at most every second (at once when the stage changes),
// and always saves the latest value, so a burst of updates isn't lost.
function progressWriter(videoId: string) {
  let lastAt = 0;
  let saved = { value: -1, stage: "" };
  let pending: { value: number; stage: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = async (next: { value: number; stage: string }) => {
    lastAt = Date.now();
    saved = next;
    await prisma.video.update({ where: { id: videoId }, data: { progress: next.value, stage: next.stage } }).catch(() => undefined);
  };
  return async (value: number, stage: string) => {
    const next = { value: Math.max(1, Math.min(99, Math.round(value))), stage };
    if (next.value === saved.value && stage === saved.stage) return;
    if (stage !== saved.stage || Date.now() - lastAt >= 1_000) {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      return write(next);
    }
    pending = next;
    timer ??= setTimeout(() => {
      timer = null;
      if (pending) void write(pending);
      pending = null;
    }, 1_000 - (Date.now() - lastAt));
  };
}

// The job: everything that happens after the upload.
export async function processVideo(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, profileId: userId } });
  if (!video?.storagePath) throw new Error("video not found");
  const progress = progressWriter(videoId);
  let ticker: ReturnType<typeof setInterval> | null = null;
  // The video is downloaded once and used from disk for every step.
  const dir = await mkdtemp(join(tmpdir(), "crevo-video-"));
  try {
    await progress(1, "Getting your video ready");
    const local = join(dir, "source");
    await downloadToFile(video.storagePath, local, (f) => void progress(1 + f * 3, "Getting your video ready"));
    const meta = await probe(local);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { name: true, niche: true, tone: true } });

    await progress(5, "Sending the video to the AI");
    const { size } = await stat(local);
    const stream = Readable.toWeb(createReadStream(local)) as ReadableStream<Uint8Array>;
    const file = await uploadGeminiFile(stream, size, video.mimeType ?? "video/mp4", video.fileName, (f) => void progress(5 + f * 25, "Sending the video to the AI"));

    // The AI gives no progress while it watches, so the bar moves on an
    // estimate from the video's length (slowing as it nears 65%).
    const started = Date.now();
    const expectedMs = Math.min(300_000, Math.max(20_000, meta.durationSec * 300));
    ticker = setInterval(() => void progress(30 + 35 * (1 - Math.exp(-(Date.now() - started) / expectedMs)), "Watching the video and finding the best moments"), 2_000);
    await progress(30, "Watching the video and finding the best moments");
    const result = await generateJson(
      {
        system: [
          `You are a short-form video editor for ${profile.name || "a creator"}${profile.niche ? ` (${profile.niche.toLowerCase()})` : ""}. Captions use a ${profile.tone} tone.`,
          `The video is ${meta.durationSec} seconds long.`,
          "transcript: what is said, one entry every sentence or two, with the second it starts.",
          "clips: the 3 best moments to post as vertical shorts, 15–60 seconds each, starting on a strong hook and ending on a complete thought; inside the video's length; not overlapping. hook is 0–100 for how strongly it opens.",
          "short: 1–3 words naming the clip. quote: the clip's key line, as said. why: why it will work, under 10 words.",
          "captions: two options per platform. reel: 1–3 sentences with a call to action. short: a title under 100 characters ending with #shorts. tiktok: casual, lowercase, under 150 characters.",
          "hashtags: five, each starting with #, lowercase, no spaces.",
          "focus: for each clip, where the speaker (or main subject) is across the frame, so a vertical crop can follow them: { sec, x } every 2–3 seconds through the clip and whenever they move, sec in seconds from the start of the video, x from 0 (left edge) to 1 (right edge) for the middle of their face or body.",
          "Reply with JSON only.",
        ].join("\n"),
        prompt: [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: "Transcribe this video and pick the clips." }],
        temperature: 0.4,
        timeoutMs: 10 * 60_000,
      },
      analysisSchema,
    );

    clearInterval(ticker);
    ticker = null;
    await progress(66, "Writing captions");
    const clips = result.clips
      .map((c) => ({ ...c, startSec: Math.max(0, Math.round(c.startSec)), endSec: Math.min(meta.durationSec, Math.round(c.endSec)) }))
      .filter((c) => c.endSec - c.startSec >= 5)
      .sort((a, b) => a.startSec - b.startSec);
    if (clips.length === 0) throw new Error("no usable clips were found");

    await prisma.$transaction(async (tx) => {
      await tx.transcriptLine.createMany({ data: result.transcript.map((l) => ({ videoId, sec: Math.round(l.sec), text: l.text })) });
      for (const [position, c] of clips.entries()) {
        await tx.clip.create({
          data: {
            videoId,
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
            color: CLIP_COLORS[position % CLIP_COLORS.length]!,
            hashtags: [...new Set(c.hashtags.map((h) => `#${h.replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "")}`).filter((h) => h.length > 1))],
            focus: (c.focus ?? []) as Prisma.InputJsonValue,
            captions: { create: PLATFORMS.map((platform) => ({ platform, options: c.captions[platform] })) },
          },
        });
      }
      await tx.video.update({ where: { id: videoId }, data: { lengthSec: meta.durationSec, quality: qualityLabel(meta.width, meta.height) } });
    });
    await indexSource(userId, "transcript", videoId, result.transcript.map((l) => l.text).join(" "));

    // The vertical shorts, one after another (70% → 99%). A clip that fails
    // to render doesn't sink the rest; it can be retried from Publish.
    const saved = await prisma.clip.findMany({ where: { videoId }, orderBy: { position: "asc" }, select: { id: true } });
    for (const [i, c] of saved.entries()) {
      const stage = `Making vertical short ${i + 1} of ${saved.length}`;
      await progress(70 + (i / saved.length) * 29, stage);
      await renderClip(userId, c.id, { input: local, width: meta.width, height: meta.height, onProgress: (f) => void progress(70 + ((i + f) / saved.length) * 29, stage) }).catch(() => undefined);
    }
    await prisma.video.update({ where: { id: videoId }, data: { status: "ready", progress: 100, stage: "", error: null } });
  } catch (err) {
    await prisma.video.update({ where: { id: videoId }, data: { status: "failed", stage: "", error: err instanceof Error ? err.message.slice(0, 300) : "processing failed" } });
    throw err;
  } finally {
    if (ticker) clearInterval(ticker);
    await rm(dir, { recursive: true, force: true });
  }
}

// Renders one clip as a vertical 9:16 short and keeps it in Storage. Also
// runs after a trim (the clip.render job), and when posting finds the
// stored short out of date.
export async function renderClip(
  userId: string,
  clipId: string,
  // input: the source already on disk (processVideo); otherwise it's downloaded.
  opts: { input?: string; width?: number | null; height?: number | null; onProgress?: (fraction: number) => void } = {},
): Promise<string | null> {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, video: { profileId: userId } }, include: { video: true } });
  if (!clip) throw notFound("Clip");
  if (!clip.video.storagePath) return null; // the sample video has no file
  const { startSec, endSec } = clip;
  await prisma.clip.update({ where: { id: clipId }, data: { renderStatus: "rendering", renderProgress: 0, renderError: null } });
  const dir = await mkdtemp(join(tmpdir(), "crevo-short-"));
  let lastWrite = 0;
  try {
    let input = opts.input;
    if (!input) {
      input = join(dir, "source");
      await downloadToFile(clip.video.storagePath, input);
    }
    const size = opts.width !== undefined ? { width: opts.width ?? null, height: opts.height ?? null } : await probe(input);
    const out = join(dir, "short.mp4");
    await renderShort({
      input,
      startSec,
      endSec,
      width: size.width,
      height: size.height,
      focus: Array.isArray(clip.focus) ? (clip.focus as unknown as FocusPoint[]) : null,
      output: out,
      onProgress: (f) => {
        opts.onProgress?.(f);
        if (Date.now() - lastWrite < 1_000) return;
        lastWrite = Date.now();
        void prisma.clip.update({ where: { id: clipId }, data: { renderProgress: Math.min(99, Math.round(f * 100)) } }).catch(() => undefined);
      },
    });
    const path = `${userId}/shorts/${clipId}.mp4`;
    await uploadFile(path, new Uint8Array(await readFile(out)), "video/mp4");
    // Only mark it current if the clip wasn't trimmed again meanwhile.
    await prisma.clip.update({ where: { id: clipId }, data: { renderStatus: "ready", renderProgress: 100, renderPath: path, renderedStartSec: startSec, renderedEndSec: endSec } });
    return path;
  } catch (err) {
    logger.warn("short render failed", { clipId, error: err instanceof Error ? err.message : String(err) });
    await prisma.clip.update({ where: { id: clipId }, data: { renderStatus: "failed", renderError: err instanceof Error ? err.message.slice(0, 300) : "render failed" } }).catch(() => undefined);
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A short-lived link to watch or download a clip's vertical short.
export async function shortUrl(userId: string, clipId: string, download: boolean) {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, video: { profileId: userId } }, select: { renderPath: true, renderStatus: true, short: true } });
  if (!clip) throw notFound("Clip");
  if (!clip.renderPath || clip.renderStatus !== "ready") throw badRequest("This short isn't ready yet.", "SHORT_NOT_READY");
  return signedDownload(clip.renderPath, 3600, download ? `${clip.short.replace(/[^\w-]+/g, "-")}-short.mp4` : undefined);
}

// Queues a fresh render (after a trim, or to retry a failed one).
export async function queueRender(userId: string, clipId: string) {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, video: { profileId: userId } }, include: { video: { select: { storagePath: true } } } });
  if (!clip) throw notFound("Clip");
  if (!clip.video.storagePath) throw badRequest("The sample video has no file to render. Upload your own video.", "SAMPLE_VIDEO");
  await prisma.clip.update({ where: { id: clipId }, data: { renderStatus: "rendering", renderProgress: 0, renderError: null } });
  // The span is in the key: a trim during a render still gets its own render.
  await enqueue("clip.render", { clipId }, { profileId: userId, key: `clip.render:${clipId}:${clip.startSec}-${clip.endSec}`, maxAttempts: 2 });
}
