import type { Job } from "db";
import { generateAlerts } from "../services/alerts.job";
import { sendBriefing } from "../services/briefing.service";
import { writeDrafts } from "../services/drafts.service";
import { deleteGoogleEvent, syncCalendar } from "../services/integrations/calendar.service";
import { saveGmailDraft, syncGmail } from "../services/integrations/gmail.service";
import { runSync } from "../services/integrations/integrations.service";
import { replyToComment, syncYouTube } from "../services/integrations/youtube.service";
import { publishPost } from "../services/publishing.service";
import { embedPending } from "../services/rag.service";
import { processVideo } from "../services/videos.service";
import type { JobHandler } from "./queue";

// What each job type does. Every handler is safe to run twice.

const owner = (job: Job) => {
  if (!job.profileId) throw new Error(`job ${job.type} has no profileId`);
  return job.profileId;
};
const field = (job: Job, name: string) => {
  const value = (job.payload as Record<string, unknown> | null)?.[name];
  if (typeof value !== "string") throw new Error(`job ${job.type} is missing ${name}`);
  return value;
};

export const handlers: Record<string, JobHandler> = {
  "rag.embed": async (job) => {
    await embedPending(owner(job));
  },
  "drafts.write": async (job) => {
    await writeDrafts(owner(job), field(job, "messageId"));
  },
  "sync.gmail": (job) => runSync(owner(job), "gmail", syncGmail),
  "sync.calendar": (job) => runSync(owner(job), "calendar", syncCalendar),
  "sync.youtube": (job) => runSync(owner(job), "youtube", syncYouTube),
  "gmail.draft": (job) => saveGmailDraft(owner(job), field(job, "messageId")),
  "youtube.reply": (job) => replyToComment(owner(job), field(job, "messageId")),
  "calendar.delete": (job) => deleteGoogleEvent(owner(job), field(job, "googleEventId")),
  "video.process": (job) => processVideo(owner(job), field(job, "videoId")),
  "post.publish": (job) => publishPost(field(job, "postId")),
  "alerts.generate": (job) => generateAlerts(owner(job)),
  "briefing.send": (job) => sendBriefing(owner(job)),
};
