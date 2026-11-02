import styles from "./googleNotice.module.css";

// Until Google verifies Crevo's OAuth app, Google shows a "Google hasn't
// verified this app" screen before the consent screen. This tells people
// what to click so the warning doesn't read as something broken. Set
// NEXT_PUBLIC_GOOGLE_APP_VERIFIED=true once verification is through.
export const GOOGLE_APP_VERIFIED = process.env.NEXT_PUBLIC_GOOGLE_APP_VERIFIED === "true";

// Shown when Google sends someone back without a grant: they cancelled,
// or Google blocked the account (an app still in Testing mode only lets
// listed test users in).
export const GOOGLE_NOT_GRANTED =
  "Google didn't finish connecting. If Google said “Access blocked”, this Google account can't connect yet: carry on with the sample workspace, which shows every feature.";

export function GoogleNotice() {
  if (GOOGLE_APP_VERIFIED) return null;
  return (
    <div className={styles.notice} role="note">
      <strong>Heads up: Crevo is waiting on Google&apos;s app review.</strong>
      <span>
        When you connect, Google may show <em>“Google hasn&apos;t verified this app”</em>. Click <b>Advanced</b>, then{" "}
        <b>Go to Crevo</b> to continue. Crevo only reads your data and saves replies as drafts; it never sends or posts on its own.
      </span>
      <span>Rather not connect? The sample workspace has every feature to explore.</span>
    </div>
  );
}
