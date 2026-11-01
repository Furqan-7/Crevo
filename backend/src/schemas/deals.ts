import { z } from "zod";
import { cuid, dealStage, isoDate, slugParam, text } from "./common";

export const listDealsQuery = z.object({ stage: dealStage.optional() });

export const createDealBody = z
  .object({
    brand: text(60),
    campaign: text(80),
    fee: z.number().int().min(0).max(10_000_000),
    deliverables: text(200),
    due: isoDate,
    usageDays: z.number().int().min(0).max(3650),
    usagePaid: z.boolean(),
    payment: z.enum(["net_15", "net_30", "net_45", "net_60", "missing"]),
    revisions: z.enum(["one", "two", "unlimited"]),
    stage: dealStage.exclude(["paid"]),
    fileName: text(200),
    // The contract read by POST /api/contracts/read, to link to the deal.
    documentId: cuid.optional(),
    // The section each term came from, when the contract reader found it.
    clauses: z
      .object({ fee: z.string().max(20).nullable(), deliverables: z.string().max(20).nullable(), usageDays: z.string().max(20).nullable(), payment: z.string().max(20).nullable() })
      .partial()
      .optional(),
  })
  .strict();

export const updateDealBody = z
  .object({ inCalendar: z.boolean(), stage: dealStage })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one change");

export const deliverableParams = slugParam.extend({ deliverableId: cuid });
export const updateDeliverableBody = z.object({ done: z.boolean() }).strict();

export type CreateDealInput = z.infer<typeof createDealBody>;
export type UpdateDealInput = z.infer<typeof updateDealBody>;
