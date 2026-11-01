import { z } from "zod";

export const isoDate = z.iso.date("Use a YYYY-MM-DD date");
export const cuid = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i, "Invalid id");
export const minutesOfDay = z.number().int().min(0).max(24 * 60);

export const idParam = z.object({ id: cuid });
export const slugParam = z.object({ slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "Invalid deal") });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const tone = z.enum(["friendly", "professional", "shorter"]);
export const category = z.enum(["brand_deal", "collab", "fan_question", "spam"]);
export const provider = z.enum(["gmail", "calendar", "youtube", "instagram", "tiktok"]);
export const accountStatus = z.enum(["connected", "disconnected", "imported", "soon"]);
export const briefingSection = z.enum(["todo", "inbox", "ideas", "deals"]);
export const alertKind = z.enum(["overdue", "new_deal", "deadline", "weekly"]);
export const eventType = z.enum(["deadline", "post", "film", "call"]);
export const publishPlatform = z.enum(["reel", "short", "tiktok"]);
export const dealStage = z.enum(["new_offer", "negotiating", "in_production", "invoiced", "paid"]);

// Trimmed text with a length cap; blank strings are rejected.
export const text = (max: number) => z.string().trim().min(1).max(max);
