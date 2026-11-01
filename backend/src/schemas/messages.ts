import { z } from "zod";
import { category, cuid, paginationQuery, tone } from "./common";

export const listMessagesQuery = paginationQuery.extend({
  category: category.optional(),
  q: z.string().trim().max(100).optional(),
  archived: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export const updateMessageBody = z
  .object({
    read: z.boolean(),
    archived: z.boolean(),
    tone,
    draftRequested: z.literal(true),
    // null throws the edit away and goes back to the drafted text.
    editedReply: z.string().max(5000).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export const approveMessagesBody = z
  .object({
    items: z
      .array(z.object({ id: cuid, text: z.string().trim().min(1).max(5000) }).strict())
      .min(1)
      .max(100),
  })
  .strict();

export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;
export type UpdateMessageInput = z.infer<typeof updateMessageBody>;
export type ApproveMessagesInput = z.infer<typeof approveMessagesBody>;
