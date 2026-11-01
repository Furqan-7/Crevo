import styles from "../dashboard.module.css";
import type { Category } from "../data";

// Brand colours shared with the landing page's pixel icons.
export const BLUE = "#2a6df4";
export const GREEN = "#56c25a";
export const YELLOW = "#f4c430";
export const PURPLE = "#7b77e8";
export const RED = "#e5574a";

export const PATTERNS = {
  briefing: "1010010110100101",
  inbox: "1101011010111101",
  publish: "0110111101100100",
  deals: "1001011001101001",
};

export const CATEGORY_STYLE: Record<Category, string> = {
  "Brand deal": styles.catDeal,
  Collab: styles.catCollab,
  "Fan question": styles.catFan,
  Spam: styles.catSpam,
};

// Green from 80%, yellow from 65%, red below.
export function healthColor(score: number, max = 100) {
  const share = score / max;
  return share >= 0.8 ? GREEN : share >= 0.65 ? YELLOW : RED;
}

export function hours(minutes: number) {
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

export function Pixels({ color, pattern, size = 3 }: { color: string; pattern: string; size?: number }) {
  return (
    <span className={styles.px} style={{ gridTemplateColumns: `repeat(4, ${size}px)` }} aria-hidden="true">
      {[...pattern].map((cell, i) => (
        <i key={i} style={{ width: size, height: size, background: cell === "1" ? color : "transparent" }} />
      ))}
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26.722 26.733" fill="currentColor" aria-hidden="true" className={className ?? styles.logoMark}>
      <path d="M9.454 0L3.214 6.357C3.928 7.371 6.778 8.149 8.865 8.559 9.715 8.732 10.586 8.775 11.449 8.688 17.454 8.045 20.051 4.778 20.609 3.12 14.368 6.449 10.572 2.426 9.455 0Z" />
      <path d="M17.581 26.733L23.823 20.376C23.108 19.36 20.258 18.584 18.172 18.172 17.322 18 16.451 17.957 15.588 18.044 9.584 18.688 6.987 21.955 6.429 23.612 12.669 20.284 16.464 24.307 17.581 26.733Z" />
      <path d="M0 17.609L6.411 23.793C7.42 23.071 8.172 20.214 8.564 18.123 8.729 17.272 8.765 16.401 8.671 15.539 7.974 9.54 4.684 6.972 3.021 6.429 6.405 12.64 2.417 16.47 0 17.609Z" />
      <path d="M26.722 9.399L20.312 3.214C19.302 3.937 18.55 6.794 18.158 8.884 17.993 9.735 17.957 10.607 18.051 11.469 18.748 17.468 22.038 20.035 23.701 20.579 20.317 14.368 24.305 10.538 26.722 9.399Z" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  );
}
