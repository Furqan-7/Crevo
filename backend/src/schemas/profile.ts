import { z } from "zod";
import { isValidTimeZone } from "../utils/dates";
import { accountStatus, alertKind, briefingSection, category, provider, text, tone } from "./common";

const briefingTime = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use a time like 8:00");
export const timezone = z.string().max(64).refine(isValidTimeZone, "Use an IANA time zone like Europe/London");

export const updateProfileBody = z
  .object({
    name: z.string().trim().max(80),
    channel: z.string().trim().max(120),
    niche: z.string().trim().max(60),
    goals: z.array(text(80)).max(10),
    briefingTime,
    briefingEmail: z.boolean(),
    briefingSections: z.array(briefingSection).min(1, "Keep at least one section in your briefing"),
    tone,
    signOff: z.string().max(200),
    autoDraft: z.array(category.exclude(["spam"])),
    notifications: z.array(alertKind),
    timezone,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one setting to change");

export const accountParams = z.object({ provider });
export const updateAccountBody = z.object({ status: accountStatus }).strict();

export const completeOnboardingBody = z
  .object({
    name: z.string().trim().max(80).optional(),
    niche: z.string().trim().max(60),
    goals: z.array(text(80)).min(1).max(10),
    briefingTime,
    timezone: timezone.optional(),
    accounts: z.partialRecord(provider, accountStatus).optional(),
    // Fill an empty workspace with the sample creator's inbox, deals and posts.
    sampleWorkspace: z.boolean().default(true),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileBody>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingBody>;
