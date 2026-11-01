import { addDays, daysBetween, fromIsoDate } from "../utils/dates";
import { SAMPLE_TODAY } from "./sample.data";

// Moves the sample workspace from SAMPLE_TODAY to the creator's today:
// every YYYY-MM-DD (alone, in a timestamp or inside a link) shifts by the
// same number of days, and {{YYYY-MM-DD:format}} tokens in the text are
// written out for the shifted date.

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const LONG_MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function format(iso: string, f: string) {
  const d = fromIsoDate(iso);
  const n = d.getUTCDate();
  switch (f) {
    case "F": return `${LONG_DAY.format(d)} ${n} ${LONG_MONTH.format(d)}`; // Friday 30 October
    case "f": return `${SHORT_DAY.format(d)} ${n} ${SHORT_MONTH.format(d)}`; // Fri 30 Oct
    case "g": return `${SHORT_DAY.format(d)} ${n} ${LONG_MONTH.format(d)}`; // Thu 12 November
    case "h": return `${SHORT_DAY.format(d)} ${n}`; // Tue 10
    case "d": return `${n} ${LONG_MONTH.format(d)}`; // 22 October
    case "D": return `${n} ${SHORT_MONTH.format(d)}`; // 22 Oct
    default: throw new Error(`unknown date format ${f}`);
  }
}

export function localizer(today: string) {
  const offset = daysBetween(SAMPLE_TODAY, today);
  const shift = (iso: string) => addDays(iso, offset);
  const text = (s: string) =>
    s
      .replace(/\{\{(\d{4}-\d{2}-\d{2}):([A-Za-z])\}\}/g, (_, iso: string, f: string) => format(shift(iso), f))
      .replace(/\d{4}-\d{2}-\d{2}/g, (iso) => shift(iso));
  const walk = <T,>(value: T): T => {
    if (typeof value === "string") return text(value) as T;
    if (Array.isArray(value)) return value.map(walk) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)])) as T;
    return value;
  };
  return { offset, shift, walk };
}
