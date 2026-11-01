import { z } from "zod";
import { eventType, isoDate, minutesOfDay, text } from "./common";

export const listEventsQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, "from must be on or before to");

export const createEventBody = z
  .object({
    title: text(160),
    type: eventType,
    date: isoDate,
    startMinutes: minutesOfDay.nullable().default(null),
    endMinutes: minutesOfDay.nullable().default(null),
    detail: z.string().trim().max(300).nullable().default(null),
    tentative: z.boolean().default(false),
  })
  .strict()
  .refine((e) => (e.startMinutes === null) === (e.endMinutes === null), "Give both a start and an end, or neither")
  .refine((e) => e.startMinutes === null || e.endMinutes === null || e.endMinutes > e.startMinutes, "The event must end after it starts");

export const updateEventBody = z
  .object({ tentative: z.boolean(), done: z.boolean() })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export type ListEventsQuery = z.infer<typeof listEventsQuery>;
export type CreateEventInput = z.infer<typeof createEventBody>;
export type UpdateEventInput = z.infer<typeof updateEventBody>;
