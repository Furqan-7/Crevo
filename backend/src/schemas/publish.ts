import { z } from "zod";
import { cuid, isoDate, minutesOfDay, paginationQuery, publishPlatform } from "./common";

export const listVideosQuery = paginationQuery;

export const updateClipBody = z
  .object({
    startSec: z.number().int().min(0),
    endSec: z.number().int().min(1),
    skipped: z.boolean(),
    hashtags: z.array(z.string().regex(/^#[a-z0-9_]{1,50}$/, "Hashtags are # plus letters, numbers or _")).max(30),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export const captionParams = z.object({ id: cuid, platform: publishPlatform });
export const updateCaptionBody = z
  .object({
    variant: z.number().int().min(0),
    // null drops the creator's edit and shows the picked option again.
    text: z.string().max(5000).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export const scheduleClipBody = z
  .object({
    posts: z
      .array(z.object({ platform: publishPlatform, date: isoDate, minutes: minutesOfDay, why: z.string().trim().max(200) }).strict())
      .min(1)
      .max(3)
      .refine((posts) => new Set(posts.map((p) => p.platform)).size === posts.length, "One post per platform"),
  })
  .strict();

export const createUploadBody = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    size: z.number().int().positive(),
    mimeType: z.string().max(100),
  })
  .strict();

export const listPostsQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export type UpdateClipInput = z.infer<typeof updateClipBody>;
export type UpdateCaptionInput = z.infer<typeof updateCaptionBody>;
export type ScheduleClipInput = z.infer<typeof scheduleClipBody>;
export type ListPostsQuery = z.infer<typeof listPostsQuery>;
