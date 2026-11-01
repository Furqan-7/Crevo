import type { Metadata } from "next";
import { requestPasswordReset } from "@/src/auth/actions";
import { AuthShell, Eyebrow, NavLink, Notice, param, styles as s, type SearchParams } from "@/src/auth/ui";

export const metadata: Metadata = {
  title: "Reset password — Crevo",
  description: "Reset your Crevo password.",
  robots: { index: false },
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = param(params, "error");
  const notice = param(params, "notice");

  return (
    <AuthShell nav={<NavLink href="/auth/signin" lead="Remembered it?" label="Sign in" />}>
      <form className={s.card} action={requestPasswordReset}>
        <Eyebrow>reset password</Eyebrow>
        <h1 className={s.title}>Forgot your password?</h1>
        <p className={s.sub}>Enter your email and we&apos;ll send you a link to choose a new one.</p>

        <label className={s.label} htmlFor="email">
          Email
        </label>
        <input className={s.input} id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required defaultValue={param(params, "email")} />

        <button className={s.primary} type="submit">
          Send reset link
        </button>
        {notice === "sent" && <Notice>If there&apos;s an account for that email, a reset link is on its way. It works for one hour.</Notice>}
        {error === "email" && <Notice error>That email doesn&apos;t look right.</Notice>}
        {notice === "auth-unavailable" && <Notice error>Password reset isn&apos;t set up on this server yet. Try again later.</Notice>}
        <p className={s.foot}>
          Remembered it? <a href="/auth/signin">Sign in</a>
        </p>
      </form>
    </AuthShell>
  );
}
