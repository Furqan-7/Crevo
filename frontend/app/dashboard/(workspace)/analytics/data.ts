// Analytics constants. Daily views, top posts and brand income come from
// the API; the format and posting-time benchmarks below are fixed until the
// YouTube and Instagram integrations report them.

import type { AnalyticsDayDto } from "@api-types";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export type Channel = "youtube" | "instagram" | "tiktok";

// Categorical slots 1–3 of the validated palette, in fixed order. A channel
// keeps its colour when others are filtered out.
export const CHANNELS: { id: Channel; label: string; color: string }[] = [
  { id: "youtube", label: "YouTube", color: "#2a78d6" },
  { id: "instagram", label: "Instagram", color: "#eb6834" },
  { id: "tiktok", label: "TikTok", color: "#1baf7a" },
];

export type DayStat = AnalyticsDayDto;

export const formats: { label: string; avgViews: number; videos: number }[] = [
  { label: "Shorts under 30s", avgViews: 84000, videos: 14 },
  { label: "Shorts 30–60s", avgViews: 52000, videos: 9 },
  { label: "Gear reviews", avgViews: 41000, videos: 6 },
  { label: "Studio tours", avgViews: 38000, videos: 2 },
  { label: "Editing tutorials", avgViews: 27000, videos: 5 },
  { label: "Vlogs", avgViews: 22000, videos: 8 },
];
export const AVERAGE_VIEWS = 36500;

export const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const HEAT_SLOTS = ["6–9 am", "9–12", "12–3 pm", "3–6 pm", "6–9 pm", "9–12 am"];
// Average engagement per post, as an index where 100 = your typical post.
export const heat: number[][] = [
  [38, 52, 71, 64, 96, 58],
  [41, 55, 74, 66, 101, 61],
  [44, 58, 79, 70, 142, 66],
  [40, 61, 131, 72, 108, 63],
  [36, 50, 77, 81, 126, 92],
  [52, 84, 98, 88, 104, 79],
  [57, 89, 93, 80, 97, 54],
];
