"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import base from "../../dashboard.module.css";
import styles from "./settings.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { ACCOUNT_META, type AccountId, type BriefingSection, type NotificationId, type Settings as SettingsShape } from "../../_shell/settings";
import { BLUE, GREEN, PATTERNS, PURPLE, Pixels, YELLOW, cx } from "../../_shell/ui";
import { ApiError, api } from "../../_shell/api";
import { browserTimeZone, goals, niches, type InboxThread, type Tone } from "../../data";

const CONNECT_ERRORS: Record<string, string> = {
  cancelled: "Connecting was cancelled. Nothing changed.",
  permissions: "Google didn't give every permission Crevo needs. Connect again and leave all the boxes ticked.",
  expired: "That connect link expired. Try again.",
  failed: "Connecting didn't work. Try again in a minute.",
};

// IANA zones the browser knows, for the time zone picker.
const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();
import { SETTINGS_TABS, type SettingsTab } from "./tabs";

const TONES: Tone[] = ["Friendly", "Professional", "Shorter"];
const BRIEFING_TIMES = ["7:00", "8:00", "9:00", "10:00"];

const SECTIONS: { id: BriefingSection; label: string; detail: string; color: string; pattern: string }[] = [
  { id: "todo", label: "Today's to-do", detail: "From your inbox and calendar", color: BLUE, pattern: PATTERNS.briefing },
  { id: "inbox", label: "Sorted inbox", detail: "Counts by category and drafted replies", color: GREEN, pattern: PATTERNS.inbox },
  { id: "ideas", label: "Ideas for today", detail: "From what your audience asks", color: YELLOW, pattern: PATTERNS.publish },
  { id: "deals", label: "Deals and payments", detail: "Risks, deadlines and overdue invoices", color: PURPLE, pattern: PATTERNS.deals },
];

const NOTIFICATIONS: { id: NotificationId; label: string; detail: string }[] = [
  { id: "overdue", label: "Overdue payments", detail: "When an invoice passes its due date" },
  { id: "newDeal", label: "New brand offers", detail: "When Crevo sorts a new brand deal into your inbox" },
  { id: "deadline", label: "Deadlines tomorrow", detail: "The evening before a deliverable is due" },
  { id: "weekly", label: "Weekly summary", detail: "Every Sunday: money in, posts out, time saved" },
];

const AUTO_DRAFT: { id: keyof SettingsShape["autoDraft"]; label: string; detail: string }[] = [
  { id: "Brand deal", label: "Brand deals", detail: "Replies that confirm dates and ask for missing terms" },
  { id: "Collab", label: "Collabs", detail: "Replies that suggest times from your calendar" },
  { id: "Fan question", label: "Fan questions", detail: "Short answers from your past replies and bio" },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx(styles.toggle, on && styles.toggleOn)} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Row({ title, detail, children }: { title: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

// A brand reply from the inbox in the chosen tone, ending with the
// creator's sign-off.
function sampleReply(threads: InboxThread[], tone: Tone, signOff: string) {
  const thread = threads.find((t) => t.category === "Brand deal" && t.drafts) ?? threads.find((t) => t.drafts);
  const draft = thread?.drafts?.[tone].replace(/==/g, "") ?? "Hi there,\n\nThanks for reaching out! This is how your replies will end.\n\nBest";
  const body = draft.split("\n\n").slice(0, -1).join("\n\n");
  return `${body}\n\n${signOff.trim() || "Best"}`;
}

export default function Settings({ initialTab }: { initialTab: SettingsTab }) {
  const router = useRouter();
  const { notify, settings, updateSettings, threads, resetWorkspace, integrations, refreshProfile } = useShell();

  // "Gmail sorts brand emails… · synced 10:42", or the last sync's problem.
  function syncLine(id: AccountId, state: string, detail: string) {
    const info = integrations.sync[id];
    if (state === "imported") return `Metrics imported from CSV${info?.syncedAt ? ` · ${new Date(info.syncedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`;
    if (state !== "connected") return info?.lastError ?? detail;
    if (info?.lastError) return `Last sync failed: ${info.lastError}`;
    if (!info?.syncedAt) return `${detail} · first sync running`;
    return `${detail} · synced ${new Date(info.syncedAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`;
  }
  const [resetting, setResetting] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState<AccountId | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function save(patch: Partial<SettingsShape>) {
    updateSettings(patch);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  }

  function open(next: SettingsTab) {
    setTab(next);
    router.replace(`/dashboard/settings?tab=${next}`, { scroll: false });
  }

  // Gmail, Calendar and YouTube connect through Google's consent screen.
  async function connect(id: AccountId) {
    if (id !== "gmail" && id !== "calendar" && id !== "youtube") return;
    if (!integrations.features.google) return notify("Connecting Google accounts isn't set up on this server yet.");
    setConnecting(id);
    try {
      window.location.href = (await api.connectGoogle(id, "/dashboard/settings?tab=accounts")).url;
    } catch (err) {
      setConnecting(null);
      notify(err instanceof ApiError ? err.message : "Couldn't start connecting. Try again.");
    }
  }

  async function disconnect(id: AccountId) {
    setConnecting(id);
    try {
      await api.disconnect(id);
      await refreshProfile();
      notify(`${ACCOUNT_META[id].name} disconnected`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't disconnect. Try again.");
    } finally {
      setConnecting(null);
    }
  }

  async function syncNow(id: AccountId) {
    try {
      await api.syncAccount(id);
      notify(`Syncing ${ACCOUNT_META[id].name}…`);
      setTimeout(() => refreshProfile().catch(() => undefined), 8000);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't start a sync. Try again.");
    }
  }

  async function importCsv(file: File) {
    try {
      const result = await api.importInstagram(await file.text(), file.name);
      await refreshProfile();
      notify(`${file.name}: ${result.imported} days imported`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't import that CSV.");
    }
  }

  async function removeAccount() {
    if (!window.confirm("Delete your Crevo account? Your workspace, uploads and connections are deleted for good.")) return;
    setResetting(true);
    try {
      const result = await api.deleteAccount();
      // The login is gone too when the server could delete it; sign out either way.
      if (!result.loginDeleted) window.alert("Your workspace was deleted. Your sign-in will be removed by the Crevo team.");
      window.location.href = "/auth/signout";
    } catch (err) {
      setResetting(false);
      notify(err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.");
    }
  }

  // Back from Google: say how it went, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected") as AccountId | null;
    const failed = params.get("connect_error");
    if (!connected && !failed) return;
    if (connected && ACCOUNT_META[connected]) notify(`${ACCOUNT_META[connected].name} connected. The first sync is running.`);
    if (failed) notify(CONNECT_ERRORS[failed] ?? CONNECT_ERRORS.failed);
    refreshProfile().catch(() => undefined);
    router.replace(`/dashboard/settings?tab=${tab}`, { scroll: false });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resetDemo() {
    if (!window.confirm("Delete everything in your workspace and start onboarding again? This can't be undone.")) return;
    setResetting(true);
    try {
      await resetWorkspace();
      window.location.href = "/dashboard/onboarding";
    } catch {
      setResetting(false);
      notify("Couldn't reset your workspace. Try again.");
    }
  }

  const active = SETTINGS_TABS.find((t) => t.id === tab)!;
  const connectedCount = (Object.keys(ACCOUNT_META) as AccountId[]).filter((id) => ["connected", "imported"].includes(settings.accounts[id])).length;

  return (
    <>
      <TopBar>
        <a className={base.btnLine} href="/auth/signout">Sign out</a>
      </TopBar>

      <PageHead
        eyebrow="settings"
        title="Settings"
        lead="Your profile, connected accounts and how Crevo works for you."
        badge="changes save automatically"
      />

      <div className={styles.layout}>
        <nav className={styles.tabs} aria-label="Settings sections">
          {SETTINGS_TABS.map((t) => (
            <button key={t.id} type="button" className={cx(styles.tab, tab === t.id && styles.tabOn)} onClick={() => open(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <strong>{t.label}</strong>
              <small>{t.id === "accounts" ? `${connectedCount} connected` : t.hint}</small>
            </button>
          ))}
        </nav>

        <section className={styles.card} aria-labelledby="settings-title">
          <div className={styles.cardHead}>
            <h2 id="settings-title">{active.label}</h2>
            <span className={cx(styles.saved, saved && styles.savedOn)} role="status">{saved ? "✓ Saved" : ""}</span>
          </div>

          {tab === "profile" && (
            <>
              <div className={styles.profile}>
                <span className={base.avatar}>{(settings.name.trim()[0] ?? "M").toUpperCase()}</span>
                <div>
                  <strong>{settings.name || "Your name"}</strong>
                  <small>{settings.channel}</small>
                </div>
              </div>
              <label className={styles.field}>
                <span>Name</span>
                <input value={settings.name} onChange={(e) => save({ name: e.target.value })} placeholder="Your name" />
              </label>
              <label className={styles.field}>
                <span>Main channel</span>
                <input value={settings.channel} onChange={(e) => save({ channel: e.target.value })} placeholder="@handle · YouTube" />
              </label>
              <label className={styles.field}>
                <span>Time zone</span>
                <select value={settings.timezone} onChange={(e) => save({ timezone: e.target.value })}>
                  {[...new Set([settings.timezone, browserTimeZone(), ...ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
                <small>Your briefing, deadlines and &ldquo;today&rdquo; follow this. This device is on {browserTimeZone().replace(/_/g, " ")}.</small>
              </label>
              <label className={styles.field}>
                <span>Sign-in email</span>
                <input value={settings.email} readOnly disabled />
                <small>The email you sign in with. It can’t be changed here.</small>
              </label>
              <fieldset className={styles.group}>
                <legend>Your niche</legend>
                <div className={styles.chips}>
                  {niches.map((n) => (
                    <button key={n} type="button" className={cx(styles.chip, settings.niche === n && styles.chipOn)} aria-pressed={settings.niche === n} onClick={() => save({ niche: n })}>{n}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Your goals <small>pick one or more</small></legend>
                <div className={styles.chips}>
                  {goals.map((g) => {
                    const on = settings.goals.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        className={cx(styles.chip, on && styles.chipOn)}
                        aria-pressed={on}
                        onClick={() => {
                          if (on && settings.goals.length === 1) return;
                          save({ goals: on ? settings.goals.filter((x) => x !== g) : [...settings.goals, g] });
                        }}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {tab === "accounts" && (
            <>
              <ul className={styles.accounts}>
                {(Object.keys(ACCOUNT_META) as AccountId[]).map((id) => {
                  const meta = ACCOUNT_META[id];
                  const state = settings.accounts[id];
                  return (
                    <li key={id}>
                      <span className={styles.mark} style={{ background: meta.color }}>{meta.mark}</span>
                      <span className={styles.rowText}>
                        <strong>{meta.name}</strong>
                        <small>
                          {syncLine(id, state, meta.detail)}
                        </small>
                      </span>
                      <span className={styles.accountActions}>
                        {state === "soon" ? (
                          <span className={base.tag}>Soon</span>
                        ) : connecting === id ? (
                          <span className={styles.pending}>Connecting…</span>
                        ) : state === "connected" ? (
                          <>
                            <span className={styles.ok}>✓ Connected</span>
                            <button type="button" className={base.mini} onClick={() => syncNow(id)}>Sync now</button>
                            <button type="button" className={base.mini} onClick={() => disconnect(id)}>Disconnect</button>
                          </>
                        ) : state === "imported" ? (
                          <>
                            <span className={styles.ok}>✓ Imported</span>
                            <button type="button" className={base.mini} onClick={() => csvInput.current?.click()}>Re-import</button>
                          </>
                        ) : id === "instagram" ? (
                          <button type="button" className={base.btnGhost} onClick={() => csvInput.current?.click()}>Import CSV</button>
                        ) : (
                          <button type="button" className={base.btnDark} onClick={() => connect(id)}>Connect</button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsv(file);
                  e.target.value = "";
                }}
              />
              {integrations.googleEmail && <p className={styles.note}>Google account: {integrations.googleEmail}</p>}
              {!integrations.features.google && <p className={styles.note}>Connecting Gmail, Calendar and YouTube isn&apos;t set up on this server yet.</p>}
              <p className={styles.note}>🔒 Crevo reads your mail and channel stats, and only saves approved replies as Gmail drafts or posts approved comment replies. Nothing is sent, posted or booked without your approval. Disconnecting stops new syncs and removes Google Calendar events from Crevo.</p>
              <p className={styles.note}>Instagram CSV: export daily insights from Meta Business Suite (Insights › Export), or any sheet with a <b>date</b> column and <b>views</b> and/or <b>followers</b> columns.</p>
            </>
          )}

          {tab === "briefing" && (
            <>
              <fieldset className={styles.group}>
                <legend>Send my briefing at</legend>
                <div className={styles.chips}>
                  {BRIEFING_TIMES.map((t) => (
                    <button key={t} type="button" className={cx(styles.chip, base.mono, settings.briefingTime === t && styles.chipOn)} aria-pressed={settings.briefingTime === t} onClick={() => save({ briefingTime: t })}>
                      {t} am
                    </button>
                  ))}
                </div>
              </fieldset>
              <Row title="Email me the briefing" detail={`Arrives at ${settings.briefingTime} am, Monday to Sunday. It’s always on your Today screen too.`}>
                <Toggle on={settings.briefingEmail} onChange={(on) => save({ briefingEmail: on })} label="Email me the briefing" />
              </Row>
              <Row title="Preview the email" detail="Opens today’s briefing email with your time, name and sections.">
                <a
                  className={base.btnGhost}
                  target="_blank"
                  rel="noopener"
                  href={`/dashboard/email/briefing?${new URLSearchParams({
                    time: settings.briefingTime,
                    name: settings.name.split(" ")[0] || "there",
                    sections: (Object.keys(settings.briefingSections) as BriefingSection[]).filter((k) => settings.briefingSections[k]).join(","),
                  })}`}
                >
                  Preview ↗
                </a>
              </Row>
              <h3 className={styles.subTitle}>What it includes</h3>
              {SECTIONS.map((s) => (
                <Row
                  key={s.id}
                  title={s.label}
                  detail={
                    <span className={styles.withIcon}>
                      <Pixels color={s.color} pattern={s.pattern} />
                      {s.detail}
                    </span>
                  }
                >
                  <Toggle
                    on={settings.briefingSections[s.id]}
                    label={s.label}
                    onChange={(on) => {
                      const next = { ...settings.briefingSections, [s.id]: on };
                      if (!Object.values(next).some(Boolean)) return notify("Keep at least one section in your briefing");
                      save({ briefingSections: next });
                    }}
                  />
                </Row>
              ))}
            </>
          )}

          {tab === "replies" && (
            <>
              <fieldset className={styles.group}>
                <legend>Default tone</legend>
                <div className={styles.segment} role="radiogroup" aria-label="Default tone">
                  {TONES.map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={settings.tone === t} className={cx(styles.segmentBtn, settings.tone === t && styles.segmentOn)} onClick={() => save({ tone: t })}>
                      {t}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className={styles.field}>
                <span>Sign-off</span>
                <textarea rows={2} value={settings.signOff} onChange={(e) => save({ signOff: e.target.value })} />
              </label>
              <div className={styles.sample}>
                <div className={styles.sampleHead}>
                  <span>Preview · reply to Nike</span>
                  <span className={base.tag}>{settings.tone.toLowerCase()}</span>
                </div>
                <p>{sampleReply(threads, settings.tone, settings.signOff)}</p>
              </div>
              <h3 className={styles.subTitle}>Draft replies automatically for</h3>
              {AUTO_DRAFT.map((a) => (
                <Row key={a.id} title={a.label} detail={a.detail}>
                  <Toggle on={settings.autoDraft[a.id]} onChange={(on) => save({ autoDraft: { ...settings.autoDraft, [a.id]: on } })} label={`Auto-draft ${a.label}`} />
                </Row>
              ))}
              <p className={styles.note}>Spam is never answered. Every draft waits for your approval before it’s saved to Gmail.</p>
            </>
          )}

          {tab === "notifications" && (
            <>
              {NOTIFICATIONS.map((n) => (
                <Row key={n.id} title={n.label} detail={n.detail}>
                  <Toggle on={settings.notifications[n.id]} onChange={(on) => save({ notifications: { ...settings.notifications, [n.id]: on } })} label={n.label} />
                </Row>
              ))}
              <p className={styles.note}>Alerts appear under the bell and in your briefing email{settings.briefingEmail ? "" : " (briefing email is off)"}.</p>
            </>
          )}

          {tab === "account" && (
            <>
              <div className={styles.plan}>
                <div>
                  <span className={styles.planName}>Free plan</span>
                  <strong>$0 / month</strong>
                  <small>1 creator · Gmail, Calendar and YouTube · daily briefing</small>
                </div>
                <a className={base.btnDark} href="/#pricing">See plans</a>
              </div>
              <Row title="Sign out" detail="Signs you out on this device.">
                <a className={base.btnGhost} href="/auth/signout">Sign out</a>
              </Row>
              <Row title="Delete account" detail="Deletes your account, workspace, uploads and connections for good.">
                <button type="button" className={cx(base.btnGhost, styles.danger)} onClick={removeAccount} disabled={resetting}>Delete</button>
              </Row>
              <Row title="Reset workspace" detail="Deletes your inbox, deals, posts and settings, and starts onboarding again.">
                <button type="button" className={cx(base.btnGhost, styles.danger)} onClick={resetDemo} disabled={resetting}>{resetting ? "Resetting…" : "Reset"}</button>
              </Row>
            </>
          )}
        </section>
      </div>
    </>
  );
}
