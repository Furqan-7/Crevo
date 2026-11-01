"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import base from "../dashboard.module.css";
import styles from "./notifications.module.css";
import { useShell } from "./AppShell";
import { EmptyState } from "./states";
import { cx } from "./ui";
import type { Alert, AlertKind } from "../data";

const KIND: Record<AlertKind, { label: string; color: string; icon: string }> = {
  overdue: { label: "Payment", color: "#d03b3b", icon: "$" },
  newDeal: { label: "Brand offer", color: "#7b77e8", icon: "★" },
  deadline: { label: "Deadline", color: "#c99a00", icon: "◷" },
  weekly: { label: "Summary", color: "#2a78d6", icon: "∑" },
};

// The bell in the top bar and its dropdown. Which kinds show follows
// Settings › Notifications; read state lives in the shell.
export default function Notifications() {
  const router = useRouter();
  const { settings, alerts, readAlerts, markRead, approved, allDeals, threads } = useShell();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // An overdue-payment alert updates once its reminder is approved.
  const reminderSaved = (a: Alert) => {
    const deal = a.kind === "overdue" ? allDeals.find((d) => d.slug === a.dealSlug) : undefined;
    return deal?.overdue && deal.replyId && approved.has(deal.replyId) ? deal : undefined;
  };
  const list: Alert[] = alerts
    .filter((a) => settings.notifications[a.kind])
    .map((a) => {
      const deal = reminderSaved(a);
      if (!deal) return a;
      const toGmail = threads.find((t) => t.id === deal.replyId)?.delivery === "gmail_draft";
      return { ...a, title: `${deal.brand} reminder ${toGmail ? "saved to drafts" : "approved"}`, detail: `${deal.overdue!.amount} · invoice ${deal.overdue!.invoice}${toGmail ? " · send it from Gmail" : ""}` };
    });
  const unread = list.filter((a) => !readAlerts.has(a.id));
  const groups = [
    { label: "Today", items: list.filter((a) => a.today) },
    { label: "Earlier", items: list.filter((a) => !a.today) },
  ].filter((g) => g.items.length);

  function openAlert(a: Alert) {
    markRead([a.id]);
    setOpen(false);
    router.push(a.href);
  }

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={base.bell}
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" /></svg>
        {unread.length > 0 && <b />}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.head}>
            <strong>Notifications</strong>
            {unread.length > 0 && <span className={styles.count}>{unread.length} new</span>}
            <button type="button" className={styles.markAll} onClick={() => markRead(list.map((a) => a.id))} disabled={unread.length === 0}>
              Mark all as read
            </button>
          </div>

          {list.length === 0 ? (
            <EmptyState compact title="No alerts turned on">
              Choose what to hear about in Settings.
            </EmptyState>
          ) : (
            <div className={styles.list}>
              {groups.map((g) => (
                <div key={g.label}>
                  <div className={styles.group}>{g.label}</div>
                  <ul>
                    {g.items.map((a) => (
                      <li key={a.id}>
                        <button type="button" className={cx(styles.item, !readAlerts.has(a.id) && styles.unread)} onClick={() => openAlert(a)}>
                          <span className={styles.icon} style={{ color: KIND[a.kind].color, borderColor: `${KIND[a.kind].color}55` }} aria-hidden="true">{KIND[a.kind].icon}</span>
                          <span className={styles.text}>
                            <strong>{a.title}</strong>
                            <small>{a.detail}</small>
                            <small className={styles.meta}>{KIND[a.kind].label} · {a.when}</small>
                          </span>
                          {!readAlerts.has(a.id) && <span className={styles.dot} aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <Link className={styles.foot} href="/dashboard/settings?tab=notifications" onClick={() => setOpen(false)}>
            Notification settings →
          </Link>
        </div>
      )}
    </div>
  );
}
