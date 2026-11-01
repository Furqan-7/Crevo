import type { ReactNode } from "react";
import { CrevoMark, GoogleIcon } from "./icons";
import s from "./auth.module.css";

export { s as styles };

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads one query value; the footer newsletter's no-JS form sends "Email". */
export function param(params: Record<string, string | string[] | undefined>, ...keys: string[]): string {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

/** A 4x4 pixel cluster like the landing page's; "1" cells are filled. */
function Pixels({ color, pattern, style }: { color: string; pattern: string; style: React.CSSProperties }) {
  return (
    <div className={s.pixels} style={style} aria-hidden="true">
      {[...pattern].map((cell, i) => (
        <i key={i} style={cell === "1" ? { background: color } : undefined} />
      ))}
    </div>
  );
}

/** Background, nav bar and centred content shared by every auth page. */
export function AuthShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className={s.page}>
      <div className={s.grid} aria-hidden="true" />
      <Pixels color="#a2e198" pattern="1010011011010010" style={{ left: "12%", top: 170 }} />
      <Pixels color="#aeabff" pattern="1001011001101001" style={{ right: "12%", top: 150 }} />
      <Pixels color="#ffcc40" pattern="1000011101000100" style={{ left: "30%", top: 96 }} />
      <div className={s.clouds} aria-hidden="true" />
      <nav className={s.nav}>
        <a className={s.logo} href="/" aria-label="Crevo home">
          <CrevoMark /> CREVO
        </a>
        {nav}
      </nav>
      <main className={s.main}>{children}</main>
    </div>
  );
}

export function NavLink({ href, lead, label }: { href: string; lead?: string; label: string }) {
  return (
    <a className={s.navLink} href={href}>
      {lead && <span className={s.long}>{lead} </span>}
      <b>{label}</b>
    </a>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className={s.eyebrow}>
      <span>[</span>
      {children}
      <span>]</span>
    </div>
  );
}

export function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p className={error ? `${s.notice} ${s.error}` : s.notice} role={error ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function GoogleButton({ href }: { href: string }) {
  return (
    <a className={s.google} href={href}>
      <GoogleIcon /> Continue with Google
    </a>
  );
}

const GOOGLE_NOTICES: Record<string, string> = {
  "google-cancelled": "Google sign-in was cancelled.",
  "google-failed": "Google sign-in didn't work. Try again, or use your email.",
  "auth-unavailable": "Sign-in isn't set up on this server yet. Try again later.",
};

export function GoogleNotice({ notice }: { notice: string }) {
  return GOOGLE_NOTICES[notice] ? <Notice error>{GOOGLE_NOTICES[notice]}</Notice> : null;
}
