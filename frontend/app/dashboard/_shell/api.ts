"use client";

import { createBrowserClient } from "@supabase/ssr";
import type {
  AccountStatus,
  AlertDto,
  AnalyticsDto,
  ApiFailure,
  ApiList,
  ApiSuccess,
  ClipDto,
  ContractReadDto,
  ContractTermsInput,
  CopilotAnswerDto,
  DealDto,
  DealStage,
  EventDto,
  EventType,
  IdeaDto,
  IdeaPlatform,
  MessageDto,
  PostDto,
  ProfileDto,
  Provider,
  PublishPlatform,
  SummaryDto,
  TodoDto,
  Tone,
  VideoDto,
  VideoUploadDto,
} from "@api-types";

// Every call to the Crevo API goes through here. The Supabase session
// (kept in cookies by @supabase/ssr) supplies the access token; the API
// verifies it and works out the user from it, so no user id is ever sent.

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!browserClient) {
    browserClient = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  }
  return browserClient;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    window.location.href = "/auth/signin";
    throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !form ? { "Content-Type": "application/json" } : {}) },
      body: form ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
      // Never leave a button spinning: the API answers AI requests within
      // about a minute, so give up after 2 minutes (uploads can take longer).
      signal: form ? undefined : AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "TIMEOUT", "This is taking too long. Try again in a minute.");
    }
    // A deployed site still pointing at the local API means NEXT_PUBLIC_API_URL
    // wasn't set when the frontend was built; say so instead of blaming the
    // visitor's connection.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL) && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
      console.error(`Crevo API is set to ${API_URL}. Set NEXT_PUBLIC_API_URL to the deployed API's URL and redeploy the frontend.`);
      throw new ApiError(0, "API_NOT_CONFIGURED", "The dashboard isn't connected to the Crevo API yet. Set NEXT_PUBLIC_API_URL to the API's URL and redeploy.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach Crevo right now. Check your connection.");
  }

  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => null)) as ApiSuccess<unknown> | ApiFailure | null;
  if (response.status === 401) {
    window.location.href = "/auth/signin";
  }
  if (!response.ok || !json || !json.success) {
    const failure = json && !json.success ? json : null;
    throw new ApiError(response.status, failure?.error ?? "INTERNAL_ERROR", failure?.message ?? "Something went wrong. Try again.");
  }
  return json as T;
}

const get = <T>(path: string) => request<ApiSuccess<T>>("GET", path).then((r) => r.data);
const send = <T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) =>
  request<ApiSuccess<T> | undefined>(method, path, body).then((r) => r?.data as T);

export const api = {
  profile: () => get<ProfileDto>("/api/profile"),
  updateProfile: (patch: Partial<Omit<ProfileDto, "id" | "email" | "accounts" | "onboarded" | "hasWorkspace">>) => send<ProfileDto>("PATCH", "/api/profile", patch),
  setAccount: (provider: Provider, status: AccountStatus) => send<ProfileDto>("PUT", `/api/profile/accounts/${provider}`, { status }),
  completeOnboarding: (body: { name?: string; niche: string; goals: string[]; briefingTime: string; timezone?: string; sampleWorkspace: boolean }) =>
    send<ProfileDto>("POST", "/api/profile/onboarding", body),
  resetWorkspace: () => send<null>("DELETE", "/api/workspace"),

  summary: () => get<SummaryDto>("/api/summary"),

  messages: () => request<ApiList<MessageDto>>("GET", "/api/messages?limit=100").then((r) => r.data),
  updateMessage: (id: string, patch: { read?: boolean; archived?: boolean; tone?: Tone; draftRequested?: true; editedReply?: string | null }) =>
    send<MessageDto>("PATCH", `/api/messages/${id}`, patch),
  draftReply: (id: string) => send<MessageDto>("POST", `/api/messages/${id}/drafts`),
  approveMessages: (items: { id: string; text: string }[]) => send<{ messages: MessageDto[]; summary: SummaryDto }>("POST", "/api/messages/approve", { items }),

  deals: () => get<DealDto[]>("/api/deals"),
  createDeal: (terms: ContractTermsInput) => send<DealDto>("POST", "/api/deals", terms),
  updateDeal: (slug: string, patch: { inCalendar?: boolean; stage?: DealStage }) => send<DealDto>("PATCH", `/api/deals/${slug}`, patch),
  setDeliverable: (slug: string, id: string, done: boolean) => send<DealDto>("PATCH", `/api/deals/${slug}/deliverables/${id}`, { done }),

  todos: () => get<TodoDto[]>("/api/todos"),
  createTodo: (body: { title: string; detail: string; dueDate: string; dueMinutes?: number | null; ideaId?: string }) => send<TodoDto>("POST", "/api/todos", body),
  updateTodo: (id: string, patch: { done?: boolean }) => send<TodoDto>("PATCH", `/api/todos/${id}`, patch),
  ideas: () => get<IdeaDto[]>("/api/ideas"),
  createIdea: (body: { title: string; why: string; platforms: IdeaPlatform[] }) => send<IdeaDto>("POST", "/api/ideas", body),

  events: () => get<EventDto[]>("/api/events"),
  createEvent: (body: { title: string; type: EventType; date: string; startMinutes: number | null; endMinutes: number | null; detail: string | null }) =>
    send<EventDto>("POST", "/api/events", body),
  updateEvent: (id: string, patch: { tentative?: boolean; done?: boolean }) => send<EventDto>("PATCH", `/api/events/${id}`, patch),
  deleteEvent: (id: string) => send<undefined>("DELETE", `/api/events/${id}`),

  videos: () => request<ApiList<VideoDto>>("GET", "/api/videos?limit=5").then((r) => r.data),
  video: (id: string) => get<VideoDto>(`/api/videos/${id}`),
  createVideoUpload: (file: { fileName: string; size: number; mimeType: string }) => send<VideoUploadDto>("POST", "/api/videos/uploads", file),
  processVideo: (id: string) => send<VideoDto>("POST", `/api/videos/${id}/process`),
  // A short-lived link to a clip's vertical short (to watch, or to download).
  clipShort: (id: string, download = false) => get<{ url: string }>(`/api/clips/${id}/short${download ? "?download=1" : ""}`),
  renderClip: (id: string) => send<ClipDto>("POST", `/api/clips/${id}/render`),
  rewriteCaption: (id: string, platform: PublishPlatform) => send<ClipDto>("POST", `/api/clips/${id}/captions/${platform}/rewrite`),
  postDownload: (id: string) => get<{ url: string }>(`/api/posts/${id}/download`),
  updateClip: (id: string, patch: { startSec?: number; endSec?: number; skipped?: boolean; hashtags?: string[] }) => send<ClipDto>("PATCH", `/api/clips/${id}`, patch),
  updateCaption: (id: string, platform: PublishPlatform, patch: { variant?: number; text?: string | null }) =>
    send<ClipDto>("PATCH", `/api/clips/${id}/captions/${platform}`, patch),
  scheduleClip: (id: string, posts: { platform: PublishPlatform; date: string; minutes: number; why: string }[]) => send<ClipDto>("POST", `/api/clips/${id}/schedule`, { posts }),
  posts: () => get<PostDto[]>("/api/posts"),

  alerts: () => get<AlertDto[]>("/api/alerts"),
  markAlertsRead: (ids: string[]) => send<AlertDto[]>("POST", "/api/alerts/read", { ids }),

  analytics: (range: number) => get<AnalyticsDto>(`/api/analytics?range=${range}`),
  askCopilot: (question: string, history: { role: "user" | "model"; text: string }[]) => send<CopilotAnswerDto>("POST", "/api/copilot", { question, history }),

  readContract: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return send<ContractReadDto>("POST", "/api/contracts/read", body);
  },

  connectGoogle: (provider: "gmail" | "calendar" | "youtube", returnTo: string) =>
    get<{ url: string }>(`/api/integrations/google/${provider}/connect?${new URLSearchParams({ returnTo })}`),
  disconnect: (provider: Provider) => send<ProfileDto>("DELETE", `/api/integrations/${provider}`),
  syncAccount: (provider: Provider) => send<null>("POST", `/api/integrations/${provider}/sync`),
  importInstagram: (csv: string, fileName: string) => send<{ imported: number; profile: ProfileDto }>("POST", "/api/integrations/instagram/import", { csv, fileName }),

  deleteAccount: () => send<{ loginDeleted: boolean }>("DELETE", "/api/account"),
};
