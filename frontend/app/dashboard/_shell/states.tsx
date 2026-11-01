"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import base from "../dashboard.module.css";
import styles from "./states.module.css";
import { useShell } from "./AppShell";
import { ACCOUNT_META, type AccountId } from "./settings";
import { Pixels, cx } from "./ui";

// "Nothing here" with a pixel icon, one line of help and an optional action.
export function EmptyState({
  title,
  children,
  action,
  color = "#b5b5b5",
  pattern = "1001011001101001",
  compact,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  color?: string;
  pattern?: string;
  compact?: boolean;
}) {
  return (
    <div className={cx(styles.empty, compact && styles.compact)}>
      <span className={styles.emptyIcon}><Pixels color={color} pattern={pattern} size={compact ? 3 : 4} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

const IMPACT: Record<AccountId, string> = {
  gmail: "New emails aren't being sorted, and replies can't be saved to your drafts.",
  calendar: "Deadlines and posts you add stay in Crevo and won't reach Google Calendar.",
  youtube: "Comments, views and ideas from your audience have stopped updating.",
  instagram: "Instagram metrics aren't imported.",
  tiktok: "",
};

// One banner per account the current screen depends on that stopped
// working: Google access was removed, or its last sync failed.
export function ReconnectBanner({ accounts }: { accounts: AccountId[] }) {
  const { integrations } = useShell();
  const missing = accounts.filter((id) => integrations.sync[id]?.lastError);
  if (missing.length === 0) return null;
  return (
    <>
      {missing.map((id) => (
        <div key={id} className={styles.banner} role="status">
          <span className={styles.bannerMark} style={{ background: ACCOUNT_META[id].color }}>{ACCOUNT_META[id].mark}</span>
          <span>
            <strong>{ACCOUNT_META[id].name} needs attention:</strong> {integrations.sync[id]?.lastError} {IMPACT[id]}
          </span>
          <Link className={base.miniDark} href="/dashboard/settings?tab=accounts">Reconnect</Link>
        </div>
      ))}
    </>
  );
}

// Renders a page's dialog at the top of the app (inside .app, so it keeps the
// tokens and zoom) rather than inside the content column, where the phone
// bar would cover it.
export function AppLayer({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.querySelector("[data-app-root]")), []);
  return root ? createPortal(children, root) : null;
}
