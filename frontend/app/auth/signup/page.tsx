import type { Metadata } from "next";
import { signUp } from "@/src/auth/actions";
import { AuthShell, Eyebrow, GoogleButton, GoogleNotice, NavLink, Notice, param, styles as s, type SearchParams } from "@/src/auth/ui";

export const metadata: Metadata = {
  title: "Sign up — Crevo",
  description: "Create your Crevo account and get your first daily briefing.",
  robots: { index: false },
};

const ERRORS: Record<string, React.ReactNode> = {
  name: "Add your name so your briefing can greet you.",
  email: "That email doesn't look right.",
  password: "Use a password with at least 8 characters, mixing letters and numbers.",
  exists: (
    <>
      There&apos;s already an account for that email. <a href="/auth/signin">Sign in</a> instead.
    </>
  ),
  failed: "We couldn't create your account just now. Try again in a minute.",
};

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = param(params, "error");
  const notice = param(params, "notice");

  return (
    <AuthShell nav={<NavLink href="/auth/signin" lead="Already have an account?" label="Sign in" />}>
      <section className={s.pitch}>
        <Eyebrow>start free</Eyebrow>
        <h2 className={s.pitchTitle}>
          Your first briefing
          <br />
          is one sign-up away
        </h2>
        <p>Connect your inbox and channels, and tomorrow morning Crevo tells you what needs you.</p>
        <ul>
          <li>
            <div>
              Daily briefing <span>– to-dos, deals and ideas at 7am</span>
            </div>
          </li>
          <li>
            <div>
              Unified inbox <span>– messages sorted, replies drafted</span>
            </div>
          </li>
          <li>
            <div>
              Publish everywhere <span>– one video, every platform</span>
            </div>
          </li>
        </ul>
        <div className={s.saved}>◷ Creators save hours every week</div>
      </section>

      <form className={s.card} action={signUp}>
        <Eyebrow>sign up</Eyebrow>
        <h1 className={s.title}>Create your account</h1>
        <p className={s.sub}>Free to start. No credit card needed.</p>
        <GoogleButton href="/auth/google?from=signup" />
        <GoogleNotice notice={notice} />
        <div className={s.or}>or sign up with email</div>

        <label className={s.label} htmlFor="name">
          Name
        </label>
        <input className={s.input} id="name" name="name" placeholder="Maya Lopez" autoComplete="name" required maxLength={60} defaultValue={param(params, "name")} />
        <label className={s.label} htmlFor="email">
          Email
        </label>
        <input className={s.input} id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required defaultValue={param(params, "email", "Email")} />
        <label className={s.label} htmlFor="password">
          Password <span className={s.hint}>8+ characters</span>
        </label>
        <input className={s.input} id="password" name="password" type="password" placeholder="••••••••" autoComplete="new-password" minLength={8} required />

        <button className={s.primary} type="submit">
          Create account
        </button>
        {ERRORS[error] && <Notice error>{ERRORS[error]}</Notice>}
        <p className={s.legal}>
          By creating an account you agree to our <a href="/terms-of-service">Terms</a> and <a href="/privacy-policy">Privacy Policy</a>.
        </p>
      </form>
    </AuthShell>
  );
}
