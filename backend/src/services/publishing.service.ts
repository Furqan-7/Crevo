import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { prisma } from "db";
import { accessToken, hasScopes } from "../lib/google";
import { signedDownload } from "../lib/storage";
import { notFound } from "../utils/AppError";
import { renderClip } from "./videos.service";

// Posting a scheduled clip when its time comes. It posts the clip's
// vertical 9:16 short (rendered after upload, or now if the clip was
// trimmed since), kept in Storage. YouTube Shorts upload
// through the YouTube API when YouTube is connected. Instagram and TikTok
// only allow posting through apps they have approved, so for those the
// post is marked "ready to post" and the creator gets an alert with the
// clip to download and the caption.

const PLATFORM_LABEL = { reel: "Instagram", short: "YouTube Shorts", tiktok: "TikTok" } as const;

async function uploadShort(userId: string, file: string, caption: string) {
  const token = await accessToken(userId);
  const bytes = await readFile(file);
  const title = (caption.split("\n")[0] ?? "").replace(/#\w+/g, "").trim().slice(0, 95) || "New Short";
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes.length) },
    body: JSON.stringify({
      snippet: { title: /#shorts/i.test(title) ? title : `${title} #shorts`.slice(0, 100), description: caption.slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) throw new Error(`YouTube upload start failed: ${start.status} ${(await start.text()).slice(0, 200)}`);
  const put = await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) }, body: bytes });
  if (!put.ok) throw new Error(`YouTube upload failed: ${put.status} ${(await put.text()).slice(0, 200)}`);
  const video = (await put.json()) as { id: string };
  return `https://www.youtube.com/shorts/${video.id}`;
}

export async function publishPost(postId: string) {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId }, include: { clip: { include: { video: true } } } });
  if (!post || (post.status !== "scheduled" && post.status !== "failed")) return;
  const { clip } = post;
  const { video } = clip;
  const userId = video.profileId;
  const label = PLATFORM_LABEL[post.platform];
  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "publishing", error: null } });

  const manual = async (reason: string | null) => {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "needs_manual", error: reason } });
    await prisma.alert.upsert({
      where: { profileId_dedupeKey: { profileId: userId, dedupeKey: `post:${post.id}` } },
      create: {
        profileId: userId,
        kind: "deadline",
        title: `${clip.short} is ready to post on ${label}`,
        detail: reason ?? "The clip is cut and the caption is written. Download it from Publish and post it.",
        href: `/dashboard/publish?clip=${clip.id}`,
        createdAt: new Date(),
        dedupeKey: `post:${post.id}`,
      },
      update: {},
    });
  };

  if (!video.storagePath) {
    await manual("This is the sample video, so there's no file to cut. Post it yourself, or upload your own video.");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "crevo-"));
  try {
    const current = clip.renderStatus === "ready" && clip.renderPath && clip.renderedStartSec === clip.startSec && clip.renderedEndSec === clip.endSec;
    const clipPath = current ? clip.renderPath! : await renderClip(userId, clip.id);
    if (!clipPath) throw new Error("the short couldn't be made");
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { clipPath } });
    const out = join(dir, "short.mp4");
    const file = await fetch(await signedDownload(clipPath, 3600));
    if (!file.ok) throw new Error(`couldn't read the short (${file.status})`);
    await writeFile(out, new Uint8Array(await file.arrayBuffer()));

    const youtube = await prisma.connectedAccount.findUnique({ where: { profileId_provider: { profileId: userId, provider: "youtube" } } });
    if (post.platform === "short" && youtube?.status === "connected" && (await hasScopes(userId, "youtube"))) {
      if ((await stat(out)).size === 0) throw new Error("the cut clip is empty");
      const url = await uploadShort(userId, out, post.caption);
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "published", externalUrl: url, publishedAt: new Date() } });
      return;
    }
    await manual(post.platform === "short" ? "Connect YouTube in Settings to post Shorts automatically. For now the clip is ready to download." : null);
  } catch (err) {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "publishing failed" } });
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A short-lived link to download a cut clip.
export async function clipDownloadUrl(userId: string, postId: string) {
  const post = await prisma.scheduledPost.findFirst({ where: { id: postId, clip: { video: { profileId: userId } } }, include: { clip: { select: { short: true } } } });
  if (!post?.clipPath) throw notFound("Clip file");
  return signedDownload(post.clipPath, 600, `${post.clip.short.replace(/[^\w-]+/g, "-")}-${post.platform}.mp4`);
}
