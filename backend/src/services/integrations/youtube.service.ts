import { prisma } from "db";
import { googleFetch } from "../../lib/google";
import { addDays, fromIsoDate, todayIn } from "../../utils/dates";
import { ingestMessage } from "../inbox.ingest";

// YouTube: channel stats and top videos for Analytics, comments into the
// Inbox, and posting an approved reply to a comment.

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

interface Channel {
  id: string;
  snippet: { title: string; customUrl?: string };
  statistics: { subscriberCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
}
interface Video {
  id: string;
  snippet: { title: string; publishedAt: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails: { duration: string };
}
interface CommentThread {
  snippet: {
    videoId: string;
    topLevelComment: { id: string; snippet: { authorDisplayName: string; authorChannelId?: { value: string }; textOriginal: string; publishedAt: string } };
  };
}

// ISO 8601 duration ("PT1M5S") in seconds.
export function durationSec(iso: string) {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export async function syncYouTube(userId: string) {
  const [profile, account] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, channel: true } }),
    prisma.connectedAccount.findUnique({ where: { profileId_provider: { profileId: userId, provider: "youtube" } } }),
  ]);
  const today = todayIn(profile.timezone);
  const channels = await googleFetch<{ items?: Channel[] }>(userId, `${DATA}/channels?part=snippet,statistics,contentDetails&mine=true`);
  const channel = channels.items?.[0];
  if (!channel) throw new Error("This Google account has no YouTube channel");

  // Daily views, watch time and subscribers gained. 180 days the first time.
  const start = account?.syncedAt ? addDays(today, -30) : addDays(today, -179);
  const report = await googleFetch<{ rows?: [string, number, number, number][] }>(
    userId,
    `${ANALYTICS}?${new URLSearchParams({ ids: "channel==MINE", startDate: start, endDate: today, metrics: "views,estimatedMinutesWatched,subscribersGained", dimensions: "day", sort: "day" })}`,
  );
  for (const [day, views, minutes, subs] of report.rows ?? []) {
    const data = { views: Math.round(views), followers: Math.max(0, Math.round(subs)), watchMinutes: Math.round(minutes) };
    await prisma.channelDay.upsert({
      where: { profileId_channel_date: { profileId: userId, channel: "youtube", date: fromIsoDate(day) } },
      create: { profileId: userId, channel: "youtube", date: fromIsoDate(day), ...data },
      update: data,
    });
  }

  // The latest 50 uploads, for Top posts.
  const uploads = await googleFetch<{ items?: { contentDetails: { videoId: string } }[] }>(userId, `${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${channel.contentDetails.relatedPlaylists.uploads}`);
  const ids = (uploads.items ?? []).map((i) => i.contentDetails.videoId);
  const videos = ids.length ? (await googleFetch<{ items?: Video[] }>(userId, `${DATA}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`)).items ?? [] : [];
  for (const v of videos) {
    const views = Number(v.statistics.viewCount ?? 0);
    const data = {
      title: v.snippet.title.slice(0, 200),
      channel: "youtube" as const,
      format: durationSec(v.contentDetails.duration) <= 60 ? "Short" : "Video",
      views,
      engagement: views ? Math.round(((Number(v.statistics.likeCount ?? 0) + Number(v.statistics.commentCount ?? 0)) / views) * 1000) / 10 : 0,
      postedAt: fromIsoDate(v.snippet.publishedAt.slice(0, 10)),
    };
    await prisma.contentPost.upsert({ where: { profileId_externalId: { profileId: userId, externalId: v.id } }, create: { profileId: userId, externalId: v.id, ...data }, update: data });
  }

  // New comments from viewers (not the creator's own) since the last sync.
  const since = account?.syncedAt ? account.syncedAt.getTime() - 3_600_000 : Date.now() - 7 * 86_400_000;
  const threads = await googleFetch<{ items?: CommentThread[] }>(userId, `${DATA}/commentThreads?part=snippet&maxResults=50&order=time&allThreadsRelatedToChannelId=${channel.id}`);
  const titles = new Map(videos.map((v) => [v.id, v.snippet.title]));
  for (const t of threads.items ?? []) {
    const c = t.snippet.topLevelComment;
    if (c.snippet.authorChannelId?.value === channel.id || new Date(c.snippet.publishedAt).getTime() < since) continue;
    await ingestMessage(userId, {
      source: "youtube",
      externalId: c.id,
      threadId: t.snippet.videoId,
      fromName: c.snippet.authorDisplayName,
      fromAddress: `YouTube comment · ${titles.get(t.snippet.videoId) ?? "your video"}`.slice(0, 200),
      subject: c.snippet.textOriginal.replace(/\s+/g, " ").slice(0, 80),
      body: c.snippet.textOriginal,
      receivedAt: new Date(c.snippet.publishedAt),
    });
  }

  await prisma.connectedAccount.update({ where: { profileId_provider: { profileId: userId, provider: "youtube" } }, data: { externalId: channel.id, syncedAt: new Date(), lastError: null } });
  if (!profile.channel) {
    await prisma.profile.update({ where: { id: userId }, data: { channel: `${channel.snippet.customUrl ?? channel.snippet.title} · ${compact(Number(channel.statistics.subscriberCount ?? 0))} on YouTube` } });
  }
}

// Posts the approved reply under the viewer's comment.
export async function replyToComment(userId: string, messageId: string) {
  const message = await prisma.message.findFirst({ where: { id: messageId, profileId: userId } });
  if (!message || message.source !== "youtube" || !message.externalId || !message.approvedReply || message.replyExternalId) return;
  const reply = await googleFetch<{ id: string }>(userId, `${DATA}/comments?part=snippet`, { method: "POST", body: { snippet: { parentId: message.externalId, textOriginal: message.approvedReply } } });
  await prisma.message.update({ where: { id: message.id }, data: { replyExternalId: reply.id } });
}
