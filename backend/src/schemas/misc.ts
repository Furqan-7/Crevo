import { z } from "zod";
import { cuid } from "./common";

export const markAlertsReadBody = z.object({ ids: z.array(cuid).min(1).max(100) }).strict();

export const analyticsQuery = z.object({
  range: z.enum(["7", "30", "90"]).default("30").transform(Number),
});

export const copilotBody = z
  .object({
    question: z.string().trim().min(2).max(500),
    // The conversation so far, so follow-up questions make sense.
    history: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(4000) }).strict()).max(16).default([]),
  })
  .strict();

export type CopilotInput = z.infer<typeof copilotBody>;

export type AnalyticsQuery = z.infer<typeof analyticsQuery>;
