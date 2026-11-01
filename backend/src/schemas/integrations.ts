import { z } from "zod";
import { provider, text } from "./common";

export const providerParams = z.object({ provider });
export const googleProviderParams = z.object({ provider: z.enum(["gmail", "calendar", "youtube"]) });
export const connectQuery = z.object({ returnTo: z.string().max(200).optional() });
export const instagramImportBody = z
  .object({
    csv: z.string().min(1).max(2_000_000),
    fileName: text(200),
  })
  .strict();
