"use client";

import Link from "next/link";
import { useEffect } from "react";
import base from "../dashboard.module.css";
import styles from "../_shell/states.module.css";
import { TopBar } from "../_shell/AppShell";

// Catches a crash in any workspace screen. The sidebar keeps working, so the
// creator can retry or move to another screen.
export default function WorkspaceError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <>
      <TopBar />
      <section className={styles.problem} role="alert">
        <div className={base.eyebrow}><span>[</span>error<span>]</span></div>
        <h2>This screen didn’t load</h2>
        <p>Something went wrong on our side. Your drafts and approvals are safe; nothing was sent. Try again, or open another screen from the sidebar.</p>
        <div className={styles.problemActions}>
          <button type="button" className={base.btnDark} onClick={() => retry()}>Try again</button>
          <Link className={base.btnGhost} href="/dashboard">Back to Today</Link>
        </div>
        {digest && <p className={styles.code}>Error reference: {digest}</p>}
      </section>
    </>
  );
}
