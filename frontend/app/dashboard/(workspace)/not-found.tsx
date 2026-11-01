import Link from "next/link";
import base from "../dashboard.module.css";
import styles from "../_shell/states.module.css";
import { TopBar } from "../_shell/AppShell";

export default function WorkspaceNotFound() {
  return (
    <>
      <TopBar />
      <section className={styles.problem}>
      <div className={base.eyebrow}><span>[</span>404<span>]</span></div>
      <h2>There’s no screen here</h2>
      <p>The link may be old or mistyped. Everything in Crevo is in the sidebar: Today, Inbox, Publish, Deals, Calendar and Settings.</p>
      <div className={styles.problemActions}>
        <Link className={base.btnDark} href="/dashboard">Go to Today</Link>
        <Link className={base.btnGhost} href="/dashboard/inbox">Open Inbox</Link>
        </div>
      </section>
    </>
  );
}
