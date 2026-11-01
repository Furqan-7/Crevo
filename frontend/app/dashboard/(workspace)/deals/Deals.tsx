"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContractTermsInput } from "@api-types";
import { useRef, useState } from "react";
import base from "../../dashboard.module.css";
import styles from "./deals.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { EmptyState, ReconnectBanner } from "../../_shell/states";
import { cx, healthColor } from "../../_shell/ui";
import { HEALTH_MAX, dealScore as score, dealStages, type BoardDeal } from "../../data";
import ContractUpload from "./ContractUpload";

const HEALTH_ROWS: { key: keyof BoardDeal["health"]; label: string }[] = [
  { key: "financial", label: "Financial" },
  { key: "deadline", label: "Deadline" },
  { key: "contract", label: "Contract" },
  { key: "scope", label: "Scope" },
];

function money(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;
}

export default function Deals({ initialSlug }: { initialSlug?: string }) {
  const router = useRouter();
  const { notify, openDraft, approved, dealsInCalendar: inCalendar, addDealToCalendar, allDeals, addDeal, setDeliverable, threads, settings } = useShell();
  const boardDeals = allDeals.filter((d) => d.stage !== "Paid");
  const [uploading, setUploading] = useState<string | null>(null);
  const [slug, setSlug] = useState(boardDeals.find((d) => d.slug === initialSlug)?.slug ?? boardDeals.find((d) => d.alert)?.slug ?? boardDeals[0]?.slug);
  // Phones show one stage at a time; it follows the selected deal until a tab is picked.
  const [phoneStage, setPhoneStage] = useState<BoardDeal["stage"] | null>(null);
  const panel = useRef<HTMLElement>(null);

  const deal = boardDeals.find((d) => d.slug === slug) ?? boardDeals[0];
  const total = boardDeals.reduce((sum, d) => sum + d.amount, 0);
  const reminder = boardDeals.find((d) => d.overdue);
  const reminderSaved = Boolean(reminder?.replyId && approved.has(reminder.replyId));

  const shownStage = phoneStage ?? deal.stage;

  function select(next: string, reveal = false) {
    setSlug(next);
    setPhoneStage(null);
    router.replace(`/dashboard/deals?deal=${next}`, { scroll: false });
    // On phones the detail panel sits below the board, so bring it into view.
    if (reveal && window.matchMedia("(max-width: 860px)").matches) {
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  if (!deal) {
    return (
      <>
        <TopBar>
          <button type="button" className={base.btnDark} onClick={() => setUploading("")}>＋ Upload contract</button>
        </TopBar>
        {uploading !== null && <ContractUpload onClose={() => setUploading(null)} onAdd={add} />}
        <PageHead eyebrow="deals" title="Brand deals" lead="No deals yet. Upload a contract and Crevo reads the terms and scores the deal." />
        <EmptyState title="Your pipeline is empty" color={dealStages[0].color} action={<button type="button" className={base.btnDark} onClick={() => setUploading("")}>Upload a contract</button>}>
          New offers from your inbox show up here too.
        </EmptyState>
      </>
    );
  }

  async function add(terms: ContractTermsInput) {
    const added = await addDeal(terms);
    if (!added) return;
    setUploading(null);
    select(added.slug);
    notify(`${added.brand} added to ${added.stage}`);
  }

  // Deals from the inbox reply on that thread; the reminder for an overdue
  // invoice is saved against the invoice's thread. Deals added from a
  // contract have no thread to reply on.
  const replyId = deal.replyId;
  const isReminder = Boolean(deal.overdue && deal.replyId);

  function draftReply() {
    if (!replyId) return;
    if (isReminder) {
      openDraft({ kind: "reminder", id: replyId, title: "Payment reminder", to: `${deal.brand} · accounts`, text: deal.overdue!.reminder, minutesSaved: 10 });
      return;
    }
    const thread = threads.find((t) => t.id === replyId);
    const fixes = deal.risks.map((r) => `- ${r.fix}`).join("\n");
    const tone = thread?.tone ?? settings.tone;
    openDraft({
      kind: "reply",
      id: replyId,
      title: `Reply to ${deal.brand}`,
      to: thread?.from ?? `${deal.brand} · partnerships`,
      text: thread?.editedReply
        ? thread.editedReply
        : thread?.drafts
          ? thread.drafts[tone].replace(/==/g, "")
          : `Hi ${deal.brand} team,\n\nThanks for the ${deal.campaign.toLowerCase()} offer! ${
              fixes ? `Before I sign, could we update a few points?\n\n${fixes}\n\n` : "Everything looks good on my side. "
            }Looking forward to it.\n\n${settings.signOff || "Best"}`,
      minutesSaved: 8,
    });
  }

  function addToCalendar() {
    addDealToCalendar(deal.slug);
    notify(`${deal.deliverables.length} ${deal.brand} deadlines added to your calendar`);
  }

  const total100 = score(deal);
  const needsReply = boardDeals.find((d) => !d.overdue && d.replyId && !approved.has(d.replyId) && d.alert);
  const replyLabel = isReminder ? "Send payment reminder" : deal.risks.length ? "Draft reply with fixes" : "Draft reply";
  const replyDone = Boolean(replyId && approved.has(replyId));

  return (
    <>
      <TopBar>
        <button type="button" className={base.btnDark} onClick={() => setUploading("")}>＋ Upload contract</button>
      </TopBar>
      {uploading !== null && (
        <ContractUpload onClose={() => setUploading(null)} onAdd={add} />
      )}

      <PageHead
        eyebrow="deals"
        title="Brand deals"
        lead={`${boardDeals.length} active ${boardDeals.length === 1 ? "deal" : "deals"} worth ${money(total)}.${needsReply ? ` ${needsReply.brand} needs a reply.` : ""}${
          reminder ? (reminderSaved ? ` ${reminder.brand}'s reminder is in your drafts.` : ` ${reminder.brand}'s payment is overdue.`) : ""
        }`}
        badge={reminder ? (reminderSaved ? "reminder approved" : `${reminder.overdue!.amount} overdue · reminder ready`) : undefined}
      />
      <ReconnectBanner accounts={["gmail"]} />

      <div className={styles.layout}>
        <div className={styles.stageTabs} role="group" aria-label="Pipeline stage">
          {dealStages.map(({ stage, color }) => (
            <button
              key={stage}
              type="button"
              className={cx(styles.stageTab, stage === shownStage && styles.stageTabOn)}
              onClick={() => setPhoneStage(stage)}
              aria-pressed={stage === shownStage}
            >
              <span className={styles.stageDot} style={{ background: color }} />
              {stage}
              <span>{boardDeals.filter((d) => d.stage === stage).length}</span>
            </button>
          ))}
        </div>
        <div className={styles.board} role="list" aria-label="Deal pipeline">
          {dealStages.map(({ stage, color }) => {
            const inStage = boardDeals.filter((d) => d.stage === stage);
            return (
              <section key={stage} className={cx(styles.column, stage !== shownStage && styles.columnAway)} role="listitem" aria-label={stage}>
                <div className={styles.columnHead}>
                  <span className={styles.stageDot} style={{ background: color }} />
                  <strong>{stage}</strong>
                  <span>{inStage.length}</span>
                </div>
                {inStage.length === 0 && <EmptyState compact title="No deals here" color={color} />}
                {inStage.map((d) => {
                  const s = score(d);
                  const reminderNote = d.slug === reminder?.slug && reminderSaved;
                  return (
                    <button
                      key={d.slug}
                      type="button"
                      className={cx(styles.dealCard, d.slug === slug && styles.dealOn)}
                      onClick={() => select(d.slug, true)}
                      aria-pressed={d.slug === slug}
                    >
                      <span className={styles.brand}>
                        <span className={styles.brandMark} style={{ background: d.color }}>{d.initial}</span>
                        {d.brand}
                      </span>
                      <small className={styles.dealNote}>{d.note}</small>
                      {d.alert && (
                        <small className={d.alert.tone === "bad" && !reminderNote ? styles.alertBad : styles.alertWarn}>
                          {reminderNote ? "6 days overdue · reminder saved" : d.alert.text}
                        </small>
                      )}
                      <span className={styles.dealFoot}>
                        <span className={base.mono}>{s}</span>
                        <span className={styles.miniBar}><i style={{ width: `${s}%`, background: healthColor(s) }} /></span>
                        <strong>{d.value}</strong>
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>

        <aside className={styles.panel} aria-labelledby="deal-title" ref={panel}>
          <div className={styles.panelHead}>
            <div className={styles.chips}>
              <span className={cx(base.tag, styles.stageTag)} style={{ background: `${dealStages.find((s) => s.stage === deal.stage)!.color}33` }}>{deal.stage}</span>
              <span className={base.tag}>{deal.source}</span>
            </div>
            <h2 id="deal-title" className={styles.title}>{deal.brand} · {deal.campaign}</h2>
            <p className={styles.sub}>{deal.summary}</p>
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <h3>Deal health</h3>
              <span className={base.tag}>rule-based score</span>
            </div>
            <div className={styles.health}>
              <div className={styles.dial} role="img" aria-label={`Deal Health ${total100} out of 100`}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#f0f0f0" strokeWidth="7" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="#181818"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${(total100 / 100) * 276.46} 276.46`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span><strong>{total100}</strong><small>/100</small></span>
              </div>
              <ul className={styles.rows}>
                {HEALTH_ROWS.map(({ key, label }) => {
                  const value = deal.health[key];
                  const max = HEALTH_MAX[key];
                  return (
                    <li key={key}>
                      <span>{label}</span>
                      <span className={styles.rowBar}><i style={{ width: `${(value / max) * 100}%`, background: healthColor(value, max) }} /></span>
                      <span className={base.mono}>{value}/{max}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Extracted terms</h3>
            <dl className={styles.terms}>
              {deal.terms.map((t) => (
                <div key={t.label}>
                  <dt>{t.label}</dt>
                  <dd>
                    <span className={t.missing ? styles.missing : undefined}>{t.value}</span>
                    {t.clause && <small className={base.mono}>{t.clause}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>
              {deal.risks.length === 0 ? "No risks found" : `${deal.risks.length} ${deal.risks.length === 1 ? "risk" : "risks"} to fix${deal.stage === "New offer" || deal.stage === "Negotiating" ? " before signing" : ""}`}
            </h3>
            {deal.risks.length === 0 ? (
              <p className={styles.clean}>✓ Payment terms, revisions and usage rights all look standard.</p>
            ) : (
              <ul className={styles.risks}>
                {deal.risks.map((r) => (
                  <li key={r.title}>
                    <strong>{r.title}</strong>
                    <span>{r.fix}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Deliverables</h3>
            <ul className={styles.deliverables}>
              {deal.deliverables.map((d) => {
                const checked = d.done;
                return (
                  <li key={d.id}>
                    <label>
                      <input type="checkbox" checked={checked} onChange={() => setDeliverable(deal.slug, d.id, !checked)} />
                      <span className={checked ? styles.doneText : undefined}>{d.title}</span>
                    </label>
                    <span className={base.mono}>{d.date}{checked ? " ✓" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.actions}>
            {inCalendar.has(deal.slug) ? (
              <Link className={cx(base.savedTag, styles.actionTag)} href={`/dashboard/calendar?date=${deal.deliverables.find((d) => !d.done)?.dueDate ?? deal.deliverables[0]?.dueDate ?? deal.dueDate}`}>✓ In your calendar →</Link>
            ) : (
              <button type="button" className={base.btnGhost} onClick={addToCalendar}>Add to calendar</button>
            )}
            {!replyId ? null : replyDone ? (
              <span className={cx(base.savedTag, styles.actionTag)}>✓ {threads.find((t) => t.id === replyId)?.delivery === "gmail_draft" ? "Saved to Gmail drafts" : "Reply approved"}</span>
            ) : (
              <button type="button" className={base.btnDark} onClick={draftReply}>{replyLabel}</button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
