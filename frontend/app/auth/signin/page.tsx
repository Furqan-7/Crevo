import type { Metadata } from "next";
import { signIn } from "@/src/auth/actions";
import { AuthShell, Eyebrow, GoogleButton, GoogleNotice, NavLink, Notice, param, styles as s, type SearchParams } from "@/src/auth/ui";

export const metadata: Metadata = {
  title: "Sign in — Crevo",
  description: "Sign in to Crevo.",
  robots: { index: false },
};

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = param(params, "error");
  const notice = param(params, "notice");

  return (
    <AuthShell nav={<NavLink href="/auth/signup" lead="New here?" label="Sign up free" />}>
      <form className={s.card} action={signIn}>
        <Eyebrow>welcome back</Eyebrow>
        <h1 className={s.title}>Sign in to Crevo</h1>
        <p className={s.sub}>Your briefing is waiting.</p>
        <GoogleButton href="/auth/google" />
        <GoogleNotice notice={notice} />
        <div className={s.or}>or sign in with email</div>

        <label className={s.label} htmlFor="email">
          Email
        </label>
        <input className={s.input} id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required defaultValue={param(params, "email")} />
        <label className={s.label} htmlFor="password">
          Password{" "}
          <a className={s.hint} href="/auth/forgot">
            Forgot password?
          </a>
        </label>
        <input className={s.input} id="password" name="password" type="password" placeholder="••••••••" autoComplete="current-password" required />

        <button className={s.primary} type="submit">
          Sign in
        </button>
        {error === "credentials" && <Notice error>That email and password don&apos;t match an account.</Notice>}
        {notice === "confirm" && <Notice>Check your inbox: click the link we sent to confirm your email, then sign in.</Notice>}
        {notice === "link-expired" && <Notice error>That link has expired or was already used. Sign in, or ask for a new reset link.</Notice>}
        <p className={s.foot}>
          Don&apos;t have an account? <a href="/auth/signup">Sign up free</a>
        </p>
      </form>
    </AuthShell>
  );
}
