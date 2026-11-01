"use client";

import type { ContractTermsInput, IdeaPlatform, ProfileDto, PublishPlatform, VideoDto } from "@api-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "../dashboard.module.css";
import Loading from "../(workspace)/loading";
import { TODAY_ISO, copilotQuestions, setWorkspaceClock, type Alert, type BoardDeal, type CalEvent, type Idea, type InboxThread, type Todo, type Tone, type Video } from "../data";
import { ApiError, api } from "./api";
import { TONE_CODE, toAlert, toDeal, toEvent, toIdea, toProfilePatch, toSettings, toThread, toTodo, toVideo } from "./model";
import { CopilotText } from "./CopilotText";
import Notifications from "./Notifications";
import { ACCOUNT_META, DEFAULT_SETTINGS, type AccountId, type Settings } from "./settings";
import { EmptyState } from "./states";
import { BLUE, GREEN, PATTERNS, PURPLE, Pixels, Logo, YELLOW, cx } from "./ui";

// The workspace frame shared by every /dashboard screen: sidebar, sky band,
// Copilot drawer, draft modal and toast. It also holds the workspace's data,
// loaded from the API once, so every screen sees the same state. Changes
// show at once and are saved in the background; if a save fails the toast
// says so and the data is reloaded from the API.

export interface DraftTarget {
  kind: "reply" | "reminder";
  id: string;
  title: string;
  to: string;
  text: string;
  minutesSaved: number;
}

interface ChatTurn {
  role: "you" | "copilot";
  text: string;
}

export interface ThreadPatch {
  read?: boolean;
  archived?: boolean;
  tone?: Tone;
  draftRequested?: true;
  editedReply?: string | null;
}

export interface ClipPatch {
  startSec?: number;
  endSec?: number;
  skipped?: boolean;
  hashtags?: string[];
}

// What the server can do (it has the keys) and how each account is syncing.
export interface Integrations {
  features: ProfileDto["features"];
  sync: ProfileDto["sync"];
  googleEmail: string | null;
}

const NO_INTEGRATIONS: Integrations = { features: { ai: false, google: false, storage: false, email: false }, sync: {}, googleEmail: null };
const integrationsOf = (p: ProfileDto): Integrations => ({ features: p.features, sync: p.sync, googleEmail: p.googleEmail });

interface Shell {
  notify: (message: string) => void;
  integrations: Integrations;
  // Re-reads the profile (settings, accounts, sync state) from the API.
  refreshProfile: () => Promise<void>;
  // Writes the reply with AI; false when AI isn't available.
  regenerateDrafts: (id: string) => Promise<boolean>;
  rewriteCaption: (clipId: string, platform: PublishPlatform) => Promise<boolean>;
  pendingVideo: VideoDto | null;
  refreshVideo: () => Promise<void>;
  openCopilot: () => void;
  openDraft: (draft: DraftTarget) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetWorkspace: () => Promise<void>;
  threads: InboxThread[];
  updateThread: (id: string, patch: ThreadPatch) => void;
  approved: Set<string>;
  approve: (items: { id: string; text: string; minutesSaved: number }[]) => void;
  minutesSaved: number;
  allDeals: BoardDeal[];
  addDeal: (terms: ContractTermsInput) => Promise<BoardDeal | null>;
  dealsInCalendar: Set<string>;
  addDealToCalendar: (slug: string) => void;
  setDeliverable: (slug: string, id: string, done: boolean) => void;
  todos: Todo[];
  toggleTodo: (id: string) => void;
  ideas: Idea[];
  addIdeaToToday: (idea: Idea) => void;
  addIdea: (idea: { title: string; why: string; platforms: IdeaPlatform[] }) => void;
  events: CalEvent[];
  addEvent: (event: Omit<CalEvent, "id">) => Promise<CalEvent | null>;
  removeEvent: (id: string) => void;
  confirmEvent: (id: string) => void;
  video: Video | null;
  updateClip: (id: string, patch: ClipPatch) => void;
  updateCaption: (id: string, platform: PublishPlatform, patch: { variant?: number; text?: string | null }) => void;
  scheduledClips: Set<string>;
  scheduleClip: (id: string, posts: { platform: PublishPlatform; date: string; minutes: number; why: string }[]) => void;
  alerts: Alert[];
  readAlerts: Set<string>;
  markRead: (ids: string[]) => void;
}

const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <AppShell>");
  return shell;
}

interface Workspace {
  threads: InboxThread[];
  deals: BoardDeal[];
  todos: Todo[];
  ideas: Idea[];
  events: CalEvent[];
  video: Video | null;
  pendingVideo: VideoDto | null;
  alerts: Alert[];
  minutesSaved: number;
}

type Collection = "threads" | "deals" | "todos" | "ideas" | "events" | "video" | "alerts" | "summary";

const LOADERS: { [K in Collection]: () => Promise<Partial<Workspace>> } = {
  threads: async () => ({ threads: (await api.messages()).map(toThread) }),
  deals: async () => ({ deals: (await api.deals()).map(toDeal) }),
  todos: async () => ({ todos: (await api.todos()).map(toTodo) }),
  ideas: async () => ({ ideas: (await api.ideas()).map(toIdea) }),
  events: async () => ({ events: (await api.events()).map(toEvent) }),
  // The newest finished video, plus one still uploading or processing.
  video: async () => {
    const videos = await api.videos();
    const ready = videos.find((v) => v.status === "ready");
    const pending = videos.find((v) => v.status !== "ready" && (!ready || v.createdAt > ready.createdAt));
    return { video: ready ? toVideo(ready) : null, pendingVideo: pending ?? null };
  },
  alerts: async () => ({ alerts: (await api.alerts()).map(toAlert) }),
  summary: async () => ({ minutesSaved: (await api.summary()).minutesSavedThisWeek }),
};

const EMPTY: Workspace = { threads: [], deals: [], todos: [], ideas: [], events: [], video: null, pendingVideo: null, alerts: [], minutesSaved: 0 };

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [integrations, setIntegrations] = useState<Integrations>(NO_INTEGRATIONS);
  const [ws, setWs] = useState<Workspace>(EMPTY);
  const [draft, setDraft] = useState<DraftTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const patchWs = useCallback((update: (w: Workspace) => Partial<Workspace>) => setWs((w) => ({ ...w, ...update(w) })), []);

  const reload = useCallback(
    async (...names: Collection[]) => {
      const parts = await Promise.all(names.map((name) => LOADERS[name]()));
      setWs((w) => Object.assign({ ...w }, ...parts));
    },
    [],
  );

  // Saves in the background, one request at a time and in the order the
  // changes were made (so an edited caption is saved before the clip is
  // scheduled with it). On failure: say so, then reload what changed so the
  // screen shows what is really saved.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    <T,>(run: () => Promise<T>, touched: Collection[], onSaved?: (result: T) => void) => {
      queue.current = queue.current
        .then(run)
        .then(onSaved)
        .catch((err: unknown) => {
          notify(err instanceof ApiError ? `Not saved: ${err.message}` : "Not saved. Try again.");
          return reload(...touched).catch(() => undefined);
        });
    },
    [notify, reload],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const profile = await api.profile();
      if (!profile.onboarded) {
        router.replace("/dashboard/onboarding");
        return;
      }
      setWorkspaceClock(profile.timezone);
      setSettings(toSettings(profile));
      setIntegrations(integrationsOf(profile));
      const parts = await Promise.all((Object.keys(LOADERS) as Collection[]).map((name) => LOADERS[name]()));
      setWs(Object.assign({ ...EMPTY }, ...parts));
      setStatus("ready");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const approved = useMemo(() => new Set(ws.threads.filter((t) => t.approved).map((t) => t.id)), [ws.threads]);

  const approve = useCallback(
    (items: { id: string; text: string; minutesSaved: number }[]) => {
      const fresh = items.filter((item) => !approved.has(item.id));
      if (fresh.length === 0) return;
      const ids = new Set(fresh.map((item) => item.id));
      patchWs((w) => ({
        threads: w.threads.map((t) => (ids.has(t.id) ? { ...t, approved: true, unread: false } : t)),
        minutesSaved: w.minutesSaved + fresh.reduce((sum, item) => sum + item.minutesSaved, 0),
      }));
      save(() => api.approveMessages(fresh.map(({ id, text }) => ({ id, text }))), ["threads", "summary"], (result) =>
        patchWs(() => ({ minutesSaved: result.summary.minutesSavedThisWeek })),
      );
    },
    [approved, patchWs, save],
  );

  // Settings show at once; profile fields are saved half a second after the
  // last change (so typing a name is one request), accounts straight away.
  const pendingProfile = useRef<Partial<Settings>>({});
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...patch, accounts: { ...s.accounts, ...patch.accounts } }));
      const { accounts, ...rest } = patch;
      const restoreProfile = (err: unknown) => {
        notify(err instanceof ApiError ? `Not saved: ${err.message}` : "Not saved. Try again.");
        return api.profile().then((p) => setSettings(toSettings(p))).catch(() => undefined);
      };
      if (accounts) {
        queue.current = (Object.keys(accounts) as AccountId[])
          .reduce<Promise<unknown>>((chain, id) => chain.then(() => api.setAccount(id, accounts[id])), queue.current)
          .catch(restoreProfile);
      }
      if (Object.keys(rest).length === 0) return;
      pendingProfile.current = { ...pendingProfile.current, ...rest };
      if (profileTimer.current) clearTimeout(profileTimer.current);
      profileTimer.current = setTimeout(() => {
        const body = toProfilePatch(pendingProfile.current);
        pendingProfile.current = {};
        if (Object.keys(body).length) queue.current = queue.current.then(() => api.updateProfile(body)).catch(restoreProfile);
      }, 500);
    },
    [notify],
  );

  // The phone menu closes whenever the screen changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ⌘K / Ctrl+K opens the Copilot, Escape closes whatever is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCopilotOpen(true);
      } else if (e.key === "Escape") {
        setDraft(null);
        setCopilotOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function approveDraft() {
    if (!draft) return;
    approve([{ id: draft.id, text: draft.text, minutesSaved: draft.minutesSaved }]);
    const toGmail = ws.threads.find((t) => t.id === draft.id)?.delivery === "gmail_draft";
    notify(`${draft.kind === "reminder" ? "Reminder" : "Reply"} ${toGmail ? "saved to your Gmail drafts" : "approved"}`);
    setDraft(null);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuestion("");
    const history = chat.map((t) => ({ role: t.role === "you" ? ("user" as const) : ("model" as const), text: t.text }));
    setChat((c) => [...c, { role: "you", text: q }, { role: "copilot", text: "…" }]);
    const answer = await api.askCopilot(q, history).then((r) => r.answer).catch((err: unknown) => (err instanceof ApiError ? err.message : "I couldn't answer that just now. Try again."));
    setChat((c) => [...c.slice(0, -1), { role: "copilot", text: answer }]);
  }

  const activeDeals = ws.deals.filter((d) => d.stage !== "Paid");
  const nav = [
    { label: "Today", href: "/dashboard", color: BLUE, pattern: PATTERNS.briefing },
    { label: "Inbox", href: "/dashboard/inbox", color: GREEN, pattern: PATTERNS.inbox, count: status === "ready" ? ws.threads.length : undefined },
    { label: "Publish", href: "/dashboard/publish", color: YELLOW, pattern: PATTERNS.publish },
    { label: "Deals", href: "/dashboard/deals", color: PURPLE, pattern: PATTERNS.deals, count: status === "ready" ? activeDeals.filter((d) => d.alert).length : undefined },
  ];

  const screenName =
    [...nav, { label: "Calendar", href: "/dashboard/calendar" }, { label: "Analytics", href: "/dashboard/analytics" }, { label: "Settings", href: "/dashboard/settings" }]
      .filter((item) => (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)))
      .map((item) => item.label)[0] ?? "";

  const refreshProfile = useCallback(async () => {
    const profile = await api.profile();
    setWorkspaceClock(profile.timezone);
    setSettings(toSettings(profile));
    setIntegrations(integrationsOf(profile));
  }, []);

  const shell: Shell = {
    notify,
    integrations,
    refreshProfile,
    regenerateDrafts: async (id) => {
      try {
        const thread = toThread(await api.draftReply(id));
        patchWs((w) => ({ threads: w.threads.map((t) => (t.id === id ? thread : t)) }));
        return true;
      } catch (err) {
        notify(err instanceof ApiError ? err.message : "Couldn't write the reply. Try again.");
        return false;
      }
    },
    rewriteCaption: async (clipId, platform) => {
      try {
        const clip = await api.rewriteCaption(clipId, platform);
        patchWs((w) => ({ video: w.video && { ...w.video, clips: w.video.clips.map((c) => (c.id === clipId ? { ...c, captions: clip.captions } : c)) } }));
        return true;
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "AI_NOT_CONFIGURED")) notify(err instanceof ApiError ? err.message : "Couldn't write a caption. Try again.");
        return false;
      }
    },
    pendingVideo: ws.pendingVideo,
    refreshVideo: () => reload("video", "summary"),
    openCopilot: () => setCopilotOpen(true),
    openDraft: setDraft,
    settings,
    updateSettings,
    resetWorkspace: async () => {
      await api.resetWorkspace();
    },
    threads: ws.threads,
    updateThread: (id, patch) => {
      patchWs((w) => ({
        threads: patch.archived
          ? w.threads.filter((t) => t.id !== id)
          : w.threads.map((t) =>
              t.id === id
                ? {
                    ...t,
                    unread: patch.read === undefined ? t.unread : !patch.read,
                    tone: patch.tone ?? t.tone,
                    draftRequested: patch.draftRequested ?? t.draftRequested,
                    editedReply: patch.editedReply === undefined ? t.editedReply : patch.editedReply,
                  }
                : t,
            ),
      }));
      save(() => api.updateMessage(id, { ...patch, tone: patch.tone ? TONE_CODE[patch.tone] : undefined }), ["threads"]);
    },
    approved,
    approve,
    minutesSaved: ws.minutesSaved,
    allDeals: ws.deals,
    addDeal: async (terms) => {
      try {
        const deal = toDeal(await api.createDeal(terms));
        patchWs((w) => ({ deals: [...w.deals, deal] }));
        return deal;
      } catch (err) {
        notify(err instanceof ApiError ? `Not added: ${err.message}` : "Not added. Try again.");
        return null;
      }
    },
    dealsInCalendar: new Set(ws.deals.filter((d) => d.inCalendar).map((d) => d.slug)),
    addDealToCalendar: (slug) => {
      patchWs((w) => ({ deals: w.deals.map((d) => (d.slug === slug ? { ...d, inCalendar: true } : d)) }));
      save(() => api.updateDeal(slug, { inCalendar: true }), ["deals"]);
    },
    setDeliverable: (slug, id, done) => {
      patchWs((w) => ({ deals: w.deals.map((d) => (d.slug === slug ? { ...d, deliverables: d.deliverables.map((item) => (item.id === id ? { ...item, done } : item)) } : d)) }));
      save(() => api.setDeliverable(slug, id, done), ["deals"]);
    },
    todos: ws.todos,
    toggleTodo: (id) => {
      const todo = ws.todos.find((t) => t.id === id);
      if (!todo) return;
      patchWs((w) => ({ todos: w.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
      save(() => api.updateTodo(id, { done: !todo.done }), ["todos"]);
    },
    ideas: ws.ideas,
    addIdeaToToday: (idea) => {
      if (idea.todoId) return;
      patchWs((w) => ({ ideas: w.ideas.map((i) => (i.id === idea.id ? { ...i, todoId: "saving" } : i)) }));
      save(() => api.createTodo({ title: `Film: ${idea.title}`, detail: "Added from Ideas for today", dueDate: TODAY_ISO, ideaId: idea.id }), ["todos", "ideas"], (todo) =>
        patchWs((w) => ({ todos: [...w.todos, toTodo(todo)], ideas: w.ideas.map((i) => (i.id === idea.id ? { ...i, todoId: todo.id } : i)) })),
      );
    },
    addIdea: (idea) => {
      save(() => api.createIdea(idea), ["ideas"], (saved) => patchWs((w) => ({ ideas: [...w.ideas, toIdea(saved)] })));
    },
    events: ws.events,
    addEvent: async (event) => {
      try {
        const saved = toEvent(await api.createEvent({ title: event.title, type: event.type, date: event.date, startMinutes: event.start ?? null, endMinutes: event.end ?? null, detail: event.detail ?? null }));
        patchWs((w) => ({ events: [...w.events, saved] }));
        return saved;
      } catch (err) {
        notify(err instanceof ApiError ? `Not added: ${err.message}` : "Not added. Try again.");
        return null;
      }
    },
    removeEvent: (id) => {
      patchWs((w) => ({ events: w.events.filter((e) => e.id !== id) }));
      save(() => api.deleteEvent(id), ["events"]);
    },
    confirmEvent: (id) => {
      patchWs((w) => ({ events: w.events.map((e) => (e.id === id ? { ...e, tentative: false } : e)) }));
      save(() => api.updateEvent(id, { tentative: false }), ["events"]);
    },
    video: ws.video,
    updateClip: (id, patch) => {
      patchWs((w) => ({
        video: w.video && {
          ...w.video,
          clips: w.video.clips.map((c) => {
            if (c.id !== id) return c;
            // A trim re-renders the vertical short: show that straight away.
            const trimmed = (patch.startSec !== undefined && patch.startSec !== c.startSec) || (patch.endSec !== undefined && patch.endSec !== c.endSec);
            return { ...c, ...patch, ...(trimmed && c.render.status !== "none" ? { render: { ...c.render, status: "rendering" as const, progress: 0, stale: false } } : {}) };
          }),
        },
      }));
      save(() => api.updateClip(id, patch), ["video"]);
    },
    updateCaption: (id, platform, patch) => {
      patchWs((w) => ({
        video: w.video && {
          ...w.video,
          clips: w.video.clips.map((c) => (c.id === id ? { ...c, captions: { ...c.captions, [platform]: { ...c.captions[platform], ...patch } } } : c)),
        },
      }));
      save(() => api.updateCaption(id, platform, patch), ["video"]);
    },
    scheduledClips: new Set((ws.video?.clips ?? []).filter((c) => c.posts.length > 0).map((c) => c.id)),
    scheduleClip: (id, posts) => {
      patchWs((w) => ({
        video: w.video && {
          ...w.video,
          clips: w.video.clips.map((c) =>
            c.id === id ? { ...c, posts: posts.map((p) => ({ id: `${c.id}-${p.platform}`, platform: p.platform, scheduledAt: `${p.date}T00:00:00.000Z`, status: "scheduled" as const, externalUrl: null, error: null, hasClipFile: false })) } : c,
          ),
        },
      }));
      save(() => api.scheduleClip(id, posts), ["video", "summary"], () => reload("video", "summary").catch(() => undefined));
    },
    alerts: ws.alerts,
    readAlerts: new Set(ws.alerts.filter((a) => a.read).map((a) => a.id)),
    markRead: (ids) => {
      const unread = ids.filter((id) => ws.alerts.some((a) => a.id === id && !a.read));
      if (unread.length === 0) return;
      patchWs((w) => ({ alerts: w.alerts.map((a) => (unread.includes(a.id) ? { ...a, read: true } : a)) }));
      save(() => api.markAlertsRead(unread), ["alerts"]);
    },
  };

  const initial = (settings.name.trim()[0] ?? "?").toUpperCase();

  return (
    <ShellContext.Provider value={shell}>
      <div className={styles.app} data-app-root>
        <aside className={cx(styles.sidebar, menuOpen && styles.sidebarOpen)}>
          <div className={styles.phoneBar}>
            <Link className={styles.logo} href="/" aria-label="Crevo home">
              <Logo />
              CREVO
            </Link>
            <span className={styles.phoneTitle}>{screenName}</span>
            <button type="button" className={styles.menuBtn} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="workspace-nav">
              {menuOpen ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Close</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>Menu</>
              )}
            </button>
          </div>
          <nav className={styles.nav} aria-label="Workspace" id="workspace-nav">
            {nav.map((item) => {
              const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link key={item.label} href={item.href} className={cx(styles.navItem, active && styles.navActive)} aria-current={active ? "page" : undefined}>
                  <Pixels color={item.color} pattern={item.pattern} />
                  <span>{item.label}</span>
                  {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
                </Link>
              );
            })}
            <div className={styles.navLabel}>Workspace</div>
            <Link
              href="/dashboard/calendar"
              className={cx(styles.navItem, pathname.startsWith("/dashboard/calendar") && styles.navActive)}
              aria-current={pathname.startsWith("/dashboard/calendar") ? "page" : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
              <span>Calendar</span>
            </Link>
            <Link
              href="/dashboard/analytics"
              className={cx(styles.navItem, pathname.startsWith("/dashboard/analytics") && styles.navActive)}
              aria-current={pathname.startsWith("/dashboard/analytics") ? "page" : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
              <span>Analytics</span>
            </Link>
            <button type="button" className={styles.navItem} onClick={() => { setMenuOpen(false); setCopilotOpen(true); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2l2.4 6.9H22l-6 4.4 2.3 7L12 16l-6.3 4.3L8 13.3 2 8.9h7.6z" /></svg>
              <span>Copilot</span>
              <kbd className={styles.kbdSmall}>⌘K</kbd>
            </button>
            <Link
              href="/dashboard/settings"
              className={cx(styles.navItem, pathname.startsWith("/dashboard/settings") && styles.navActive)}
              aria-current={pathname.startsWith("/dashboard/settings") ? "page" : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              <span>Settings</span>
            </Link>
          </nav>
          <div className={styles.sideFoot}>
            <div className={styles.connected}>
              <span>Connected</span>
              <div className={styles.connIcons}>
                {(Object.keys(ACCOUNT_META) as AccountId[])
                  .filter((id) => settings.accounts[id] === "connected" || settings.accounts[id] === "imported")
                  .map((id) => (
                    <span key={id} style={{ background: ACCOUNT_META[id].color }} title={ACCOUNT_META[id].name}>{ACCOUNT_META[id].mark}</span>
                  ))}
                <Link className={styles.connAdd} href="/dashboard/settings?tab=accounts" aria-label="Manage connected accounts" title="Manage connected accounts">+</Link>
              </div>
            </div>
            <div className={styles.me}>
              <span className={styles.avatar}>{initial}</span>
              <div className={styles.meText}>
                <strong>{settings.name || "Your workspace"}</strong>
                <span>{settings.channel || "Add your channel in Settings"}</span>
              </div>
              <a className={styles.signOut} href="/auth/signout" title="Sign out" aria-label="Sign out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
              </a>
            </div>
          </div>
        </aside>

        <main className={styles.main} id="top">
          <div className={styles.sky} aria-hidden="true">
            <div className={styles.skyGrid} />
            <div className={styles.clouds} />
            <div className={styles.skyFade} />
            <span className={styles.bigPx} style={{ right: "16%", top: 92 }}><Pixels color="#aeabff" pattern="1001011001101001" size={7} /></span>
            <span className={styles.bigPx} style={{ right: "34%", top: 150 }}><Pixels color="#ffcc40" pattern="1000011101000100" size={7} /></span>
          </div>
          <div className={styles.wrap}>
            {status === "ready" ? (
              children
            ) : status === "error" ? (
              <EmptyState
                title="Your workspace didn't load"
                action={<button type="button" className={styles.btnDark} onClick={load}>Try again</button>}
              >
                {loadError} Nothing you saved is lost.
              </EmptyState>
            ) : (
              <Loading />
            )}
          </div>
        </main>

        {draft && (
          <div className={styles.overlay} onClick={() => setDraft(null)}>
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="draft-title" onClick={(e) => e.stopPropagation()}>
              <div className={styles.eyebrow}><span>[</span>{draft.kind === "reminder" ? "payment reminder" : "reply draft"}<span>]</span></div>
              <h3 id="draft-title" className={styles.modalTitle}>{draft.title}</h3>
              <div className={styles.field}><span>To</span><strong>{draft.to}</strong></div>
              <textarea className={styles.textarea} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={9} />
              <p className={styles.modalNote}>
                {ws.threads.find((t) => t.id === draft.id)?.delivery === "gmail_draft"
                  ? "Nothing is sent: approving saves it to your Gmail drafts, for you to send."
                  : "Nothing is sent. Approving keeps it here; connect Gmail to have approved replies saved to your drafts."}
              </p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className={styles.btnDark} onClick={approveDraft}>Approve and save to drafts</button>
              </div>
            </div>
          </div>
        )}

        <div className={cx(styles.drawer, copilotOpen && styles.drawerOpen)} aria-hidden={!copilotOpen}>
          <div className={styles.drawerHead}>
            <span className={styles.spark}>✦</span>
            <strong>Copilot</strong>
            <button type="button" className={styles.close} onClick={() => setCopilotOpen(false)} aria-label="Close Copilot">×</button>
          </div>
          <div className={styles.chat}>
            {chat.length === 0 && (
              <p className={styles.chatEmpty}>Ask anything about your deals, deadlines, money or content. Answers come from your workspace.</p>
            )}
            {chat.map((turn, i) => (
              <div key={i} className={turn.role === "you" ? styles.bubbleYou : styles.bubbleBot}>{turn.role === "you" ? turn.text : <CopilotText text={turn.text} />}</div>
            ))}
          </div>
          <div className={styles.suggest}>
            {copilotQuestions.map((q) => (
              <button key={q} type="button" className={styles.mini} onClick={() => ask(q)}>{q}</button>
            ))}
          </div>
          <form className={styles.askForm} onSubmit={(e) => { e.preventDefault(); ask(question); }}>
            <input className={styles.askInput} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask Crevo…" aria-label="Ask Crevo" />
            <button type="submit" className={styles.btnDark}>Ask</button>
          </form>
        </div>
        {copilotOpen && <div className={styles.drawerShade} onClick={() => setCopilotOpen(false)} />}

        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </div>
    </ShellContext.Provider>
  );
}

// The Ask bar and bell, with the screen's main action on the right
// (on phones the action drops to its own full-width row).
export function TopBar({ children }: { children?: ReactNode }) {
  const { openCopilot } = useShell();
  return (
    <header className={styles.top}>
      <button type="button" className={styles.ask} onClick={openCopilot}>
        <span className={styles.spark}>✦</span>
        <span className={styles.askText}>Ask Crevo: “Who still owes me money?”</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>
      <div className={styles.topActions}>
        <Notifications />
        {children && <div className={styles.topAction}>{children}</div>}
      </div>
    </header>
  );
}

// `[ eyebrow ]`, the screen title, one line of context and a green status pill.
export function PageHead({ eyebrow, title, lead, badge }: { eyebrow: string; title: string; lead: ReactNode; badge?: ReactNode }) {
  return (
    <section className={styles.hello}>
      <div>
        <div className={styles.eyebrow}><span>[</span>{eyebrow}<span>]</span></div>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
      </div>
      {badge && <span className={styles.saved}>◷ {badge}</span>}
    </section>
  );
}
