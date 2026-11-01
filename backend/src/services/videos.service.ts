import { prisma } from "db";
import { z } from "zod";
import { enqueue } from "../jobs/queue";
import { generateJson, uploadGeminiFile } from "../lib/ai";
import { probe, qualityLabel } from "../lib/ffmpeg";
import { fileInfo, safeName, signedDownload, signedUpload, supabaseAdmin } from "../lib/storage";
import type { PublishPlatform } from "../types/api";
import { badRequest, notFound } from "../utils/AppError";
import { indexSource } from "./rag.service";
import { toVideoDto, videoInclude } from "./mappers";

// Real video uploads for Publish. The browser uploads straight to Supabase
// Storage with a signed URL; then a job reads the length and size with
// ffmpeg, has Gemini watch the video for a transcript, the clips worth
// posting and captions for each platform, and saves it all.

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
  await prisma.video.update({ where: { id: video.id }, data: { status: "processing", error: null } });
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
      }),
    )
    .min(1)
    .max(5),
});

const CLIP_COLORS = ["#7b77e8", "#56c25a", "#e2a400", "#2a6df4", "#eb6834"];

// The job: everything that happens after the upload.
export async function processVideo(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, profileId: userId } });
  if (!video?.storagePath) throw new Error("video not found");
  try {
    const url = await signedDownload(video.storagePath, 3 * 3600);
    const info = await fileInfo(video.storagePath);
    const meta = await probe(url);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { name: true, niche: true, tone: true } });

    const download = await fetch(url);
    if (!download.ok || !download.body) throw new Error(`couldn't read the upload (${download.status})`);
    const file = await uploadGeminiFile(download.body, info?.size ?? Number(download.headers.get("content-length") ?? 0), video.mimeType ?? "video/mp4", video.fileName);

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
          "Reply with JSON only.",
        ].join("\n"),
        prompt: [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: "Transcribe this video and pick the clips." }],
        temperature: 0.4,
        timeoutMs: 10 * 60_000,
      },
      analysisSchema,
    );

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
            captions: { create: PLATFORMS.map((platform) => ({ platform, options: c.captions[platform] })) },
          },
        });
      }
      await tx.video.update({ where: { id: videoId }, data: { status: "ready", lengthSec: meta.durationSec, quality: qualityLabel(meta.width, meta.height), error: null } });
    });
    await indexSource(userId, "transcript", videoId, result.transcript.map((l) => l.text).join(" "));
  } catch (err) {
    await prisma.video.update({ where: { id: videoId }, data: { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "processing failed" } });
    throw err;
  }
}
