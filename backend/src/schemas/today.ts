import { z } from "zod";
import { cuid, isoDate, minutesOfDay, text } from "./common";

export const createTodoBody = z
  .object({
    title: text(160),
    detail: z.string().trim().max(200).default(""),
    dueDate: isoDate,
    dueMinutes: minutesOfDay.nullable().default(null),
    // Adding an idea to today links the to-do to it (once per idea).
    ideaId: cuid.optional(),
  })
  .strict();

export const updateTodoBody = z
  .object({ done: z.boolean(), title: text(160), detail: z.string().trim().max(200) })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export const createIdeaBody = z
  .object({
    title: text(160),
    why: text(200),
    platforms: z.array(z.enum(["instagram", "youtube", "tiktok", "shorts", "reels"])).min(1).max(5),
  })
  .strict();

export type CreateIdeaInput = z.infer<typeof createIdeaBody>;
export type CreateTodoInput = z.infer<typeof createTodoBody>;
export type UpdateTodoInput = z.infer<typeof updateTodoBody>;
