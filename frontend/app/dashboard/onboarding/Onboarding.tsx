"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import base from "../dashboard.module.css";
import styles from "./onboarding.module.css";
import { BLUE, GREEN, Logo, PATTERNS, PURPLE, Pixels, YELLOW, cx } from "../_shell/ui";
import type { Provider } from "@api-types";
import { ApiError, api } from "../_shell/api";
import { browserTimeZone, goals, niches, onboardingAccounts } from "../data";

const STEPS = ["Connect", "About you", "First briefing"];
const BRIEFING_TIMES = ["7:00", "8:00", "9:00"];

type AccountState = "connected" | "connecting" | "connect" | "csv" | "imported" | "soon";

export default function Onboarding({ name }: { name?: string }) {
  const router = useRouter();
  const csvInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Record<string, AccountState>>(
    () => Object.fromEntries(onboardingAccounts.map((a) => [a.id, a.action])),
  );
  const [csvName, setCsvName] = useState<string | null>(null);
  const [features, setFeatures] = useState({ google: false });

  // What's really connected (this page is also where Google sends people
  // back to after connecting).
  useEffect(() => {
    api
      .profile()
      .then((p) => {
        setFeatures({ google: p.features.google });
        setAccounts((s) => {
          const next = { ...s };
          for (const a of onboardingAccounts) {
            const status = p.accounts[a.id as Provider];
            if (status === "connected" || status === "imported") next[a.id] = status;
          }
          return next;
        });
      })
      .catch(() => undefined);
    const failed = new URLSearchParams(window.location.search).get("connect_error");
    if (failed) setError(failed === "cancelled" ? "Connecting was cancelled. You can connect later in Settings." : "Connecting didn't work. You can try again, or later in Settings.");
  }, []);
  const [niche, setNiche] = useState(niches[0]);
  const [goal, setGoal] = useState<Set<string>>(new Set([goals[0]]));
  const [briefingAt, setBriefingAt] = useState("8:00");

  const connected = onboardingAccounts.filter((a) => accounts[a.id] === "connected" || accounts[a.id] === "imported");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Finishing (or skipping, with the defaults) saves these choices and
  // opens the workspace, filled with the sample creator's inbox, deals and
  // posts until real accounts are connected.
  async function finish(save = false) {
    setSaving(true);
    setError(null);
    try {
      await api.completeOnboarding({
        name,
        niche: save ? niche : niches[0],
        goals: save ? [...goal] : [goals[0]],
        briefingTime: save ? briefingAt : "8:00",
        timezone: browserTimeZone(),
        sampleWorkspace: true,
      });
      router.push("/dashboard");
    } catch (err) {
      setSaving(false);
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  }

  // Off to Google's consent screen; it sends the creator back here.
  async function connect(id: string) {
    if (id !== "gmail" && id !== "calendar" && id !== "youtube") return;
    if (!features.google) {
      setError("Connecting Google accounts isn't set up on this server yet. You can carry on and connect later in Settings.");
      return;
    }
    setAccounts((s) => ({ ...s, [id]: "connecting" }));
    try {
      const back = `/dashboard/onboarding${name ? `?name=${encodeURIComponent(name)}` : ""}`;
      window.location.href = (await api.connectGoogle(id, back)).url;
    } catch (err) {
      setAccounts((s) => ({ ...s, [id]: "connect" }));
      setError(err instanceof ApiError ? err.message : "Couldn't start connecting. Try again.");
    }
  }

  async function importCsv(file: File) {
    try {
      const result = await api.importInstagram(await file.text(), file.name);
      setCsvName(`${file.name} · ${result.imported} days`);
      setAccounts((s) => ({ ...s, instagram: "imported" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't import that CSV.");
    }
  }

  function toggleGoal(g: string) {
    setGoal((s) => {
      const next = new Set(s);
      if (next.has(g) && next.size > 1) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  const briefing = [
    { color: BLUE, pattern: PATTERNS.briefing, title: "Today's to-do", detail: "From your inbox and calendar" },
    { color: GREEN, pattern: PATTERNS.inbox, title: "Messages sorted", detail: "Replies drafted in your tone" },
    { color: YELLOW, pattern: PATTERNS.publish, title: "Ideas for today", detail: step === 2 ? `For ${niche.toLowerCase()}, from what your audience asks` : "From what your audience asks" },
    { color: PURPLE, pattern: PATTERNS.deals, title: "Deals and payments", detail: "Risks flagged, reminders ready" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.sky} aria-hidden="true">
        <div className={styles.grid} />
        <div className={styles.clouds} />
        <span className={styles.px} style={{ left: "12%", top: 170 }}><Pixels color="#a2e198" pattern="1010010110100101" size={7} /></span>
        <span className={styles.px} style={{ left: "30%", top: 100 }}><Pixels color="#ffcc40" pattern="1000011101000100" size={7} /></span>
        <span className={styles.px} style={{ right: "10%", top: 150 }}><Pixels color="#aeabff" pattern="1001011001101001" size={7} /></span>
      </div>

      <header className={styles.top}>
        <Link className={styles.logo} href="/" aria-label="Crevo home">
          <Logo className={styles.logoMark} />
          CREVO
        </Link>
        <ol className={styles.steps} aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li key={label} className={cx(styles.step, i === step && styles.stepNow, i < step && styles.stepDone)} aria-current={i === step ? "step" : undefined}>
              <button type="button" onClick={() => i < step && setStep(i)} disabled={i >= step}>
                <span className={styles.stepMark}>{i < step ? "✓" : i + 1}</span>
                <span className={styles.stepLabel}>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.skip} onClick={() => finish()} disabled={saving}>Skip for now</button>
      </header>

      <div className={styles.body}>
        <section className={styles.card} aria-labelledby="step-title">
          <div className={base.eyebrow}><span>[</span>step {step + 1} of {STEPS.length}<span>]</span></div>

          {step === 0 && (
            <>
              <h1 id="step-title" className={styles.h1}>Connect your accounts</h1>
              <p className={styles.lead}>{name ? `Welcome, ${name}. ` : ""}Crevo reads these to build your daily briefing. You can add more later.</p>
              <ul className={styles.accounts}>
                {onboardingAccounts.map((a) => {
                  const state = accounts[a.id];
                  return (
                    <li key={a.id}>
                      <span className={styles.mark} style={{ background: a.color }}>{a.mark}</span>
                      <span className={styles.accountText}>
                        <strong>{a.name}</strong>
                        <small>{state === "imported" && csvName ? `${csvName} imported` : a.detail}</small>
                      </span>
                      {state === "connected" || state === "imported" ? (
                        <span className={styles.connected}>✓ {state === "imported" ? "Imported" : "Connected"}</span>
                      ) : state === "connecting" ? (
                        <span className={styles.connecting}>Connecting…</span>
                      ) : state === "connect" ? (
                        <button type="button" className={cx(base.btnDark, styles.accountBtn)} onClick={() => connect(a.id)}>Connect</button>
                      ) : state === "csv" ? (
                        <button type="button" className={cx(base.btnGhost, styles.accountBtn)} onClick={() => csvInput.current?.click()}>Import CSV</button>
                      ) : (
                        <span className={base.tag}>Soon</span>
                      )}
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
              {error && step === 0 && <p className={styles.error} role="alert">{error}</p>}
              <p className={styles.note}>🔒 Nothing is sent, posted or booked without your approval.</p>
            </>
          )}

          {step === 1 && (
            <>
              <h1 id="step-title" className={styles.h1}>Tell us about you</h1>
              <p className={styles.lead}>Your briefing, ideas and reply tone are tuned to this. You can change it in Settings.</p>
              <fieldset className={styles.group}>
                <legend>Your niche</legend>
                <div className={styles.chips}>
                  {niches.map((n) => (
                    <button key={n} type="button" className={cx(styles.chip, niche === n && styles.chipOn)} aria-pressed={niche === n} onClick={() => setNiche(n)}>{n}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Your main goal <small>pick one or more</small></legend>
                <div className={styles.chips}>
                  {goals.map((g) => (
                    <button key={g} type="button" className={cx(styles.chip, goal.has(g) && styles.chipOn)} aria-pressed={goal.has(g)} onClick={() => toggleGoal(g)}>{g}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Send my briefing at</legend>
                <div className={styles.chips}>
                  {BRIEFING_TIMES.map((t) => (
                    <button key={t} type="button" className={cx(styles.chip, base.mono, briefingAt === t && styles.chipOn)} aria-pressed={briefingAt === t} onClick={() => setBriefingAt(t)}>{t} am</button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <h1 id="step-title" className={styles.h1}>Your first briefing is ready</h1>
              <p className={styles.lead}>Here&apos;s what Crevo found. It arrives every morning at {briefingAt} am.</p>
              <ul className={styles.briefing}>
                {briefing.map((b) => (
                  <li key={b.title}>
                    <Pixels color={b.color} pattern={b.pattern} size={4} />
                    <span>
                      <strong>{b.title}</strong>
                      <small>{b.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className={styles.actions}>
            {step === 0 ? (
              <Link className={base.btnGhost} href="/">Back</Link>
            ) : (
              <button type="button" className={base.btnGhost} onClick={() => setStep(step - 1)}>Back</button>
            )}
            <button type="button" className={cx(base.btnDark, styles.continue)} onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish(true))} disabled={saving}>
              {step < STEPS.length - 1 ? "Continue" : saving ? "Setting up…" : "Open my briefing"}
            </button>
          </div>
          {error && step !== 0 && <p className={styles.error} role="alert">{error}</p>}
          {step === STEPS.length - 1 && !error && (
            <p className={styles.sample}>Until your accounts sync, your workspace starts with a sample creator&apos;s inbox, deals and posts. Reset it any time in Settings.</p>
          )}
        </section>

        <aside className={styles.side} aria-label="What happens next">
          {step === 0 && (
            <>
              <h2>Next: tell us about you</h2>
              <div className={styles.preview}>
                <span className={styles.previewLabel}>Your niche</span>
                <div className={styles.chips}>
                  {niches.map((n) => <span key={n} className={cx(styles.chip, styles.chipStatic, niche === n && styles.chipOn)}>{n}</span>)}
                </div>
                <span className={styles.previewLabel}>Your main goal</span>
                <div className={styles.chips}>
                  {goals.map((g) => <span key={g} className={cx(styles.chip, styles.chipStatic, goal.has(g) && styles.chipOn)}>{g}</span>)}
                </div>
              </div>
            </>
          )}
          {step < 2 && (
            <>
              <h2>Then your first briefing</h2>
              <ul className={cx(styles.preview, styles.briefing)}>
                {briefing.map((b) => (
                  <li key={b.title}>
                    <Pixels color={b.color} pattern={b.pattern} size={4} />
                    <span>
                      <strong>{b.title}</strong>
                      <small>{b.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Your setup</h2>
              <dl className={cx(styles.preview, styles.summary)}>
                <div><dt>Connected</dt><dd>{connected.map((a) => a.name).join(", ") || "Nothing yet"}</dd></div>
                <div><dt>Niche</dt><dd>{niche}</dd></div>
                <div><dt>Goal</dt><dd>{[...goal].join(", ")}</dd></div>
                <div><dt>Briefing</dt><dd>Every day at {briefingAt} am</dd></div>
              </dl>
              <button type="button" className={styles.sideLink} onClick={() => setStep(0)}>Connect more accounts</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
