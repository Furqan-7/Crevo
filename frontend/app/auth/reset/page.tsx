import type { Metadata } from "next";
import { updatePassword } from "@/src/auth/actions";
import { AuthShell, Eyebrow, NavLink, Notice, param, styles as s, type SearchParams } from "@/src/auth/ui";

export const metadata: Metadata = {
  title: "New password — Crevo",
  description: "Choose a new Crevo password.",
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  password: "Use a password with at least 8 characters, mixing letters and numbers.",
  same: "That's your current password. Pick a new one.",
  failed: "We couldn't save it just now. Try again in a minute.",
};

/** The reset email's link signs the visitor in (see /auth/confirm) and lands here. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const error = param(await searchParams, "error");

  return (
    <AuthShell nav={<NavLink href="/auth/signout" label="Sign out" />}>
      <form className={s.card} action={updatePassword}>
        <Eyebrow>new password</Eyebrow>
        <h1 className={s.title}>Choose a new password</h1>
        <p className={s.sub}>You&apos;ll stay signed in on this device.</p>

        <label className={s.label} htmlFor="password">
          New password <span className={s.hint}>8+ characters</span>
        </label>
        <input className={s.input} id="password" name="password" type="password" placeholder="••••••••" autoComplete="new-password" minLength={8} required />

        <button className={s.primary} type="submit">
          Save password
        </button>
        {ERRORS[error] && <Notice error>{ERRORS[error]}</Notice>}
        <p className={s.foot}>
          Changed your mind? <a href="/dashboard">Back to your workspace</a>
        </p>
      </form>
    </AuthShell>
  );
}
