// Dates in the API are ISO strings: "2026-10-28" for calendar days (stored
// as Postgres DATE) and full ISO timestamps for moments.

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime()) / 86_400_000);
}

// ── Time zones ──────────────────────────────────────────────────────────────
// Profiles store an IANA zone; "today" and local times are worked out in it.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zoneParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// The calendar date in `tz` right now (or at `at`), as "YYYY-MM-DD".
export function todayIn(tz: string, at = new Date()): string {
  const p = zoneParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Minutes since local midnight in `tz`.
export function minutesNowIn(tz: string, at = new Date()): number {
  const p = zoneParts(at, tz);
  return p.hour * 60 + p.minute;
}

// The UTC instant of a local date and time in `tz` (handles DST: the offset
// is read at that moment, then corrected once).
export function zonedToUtc(dateIso: string, minutes: number, tz: string): Date {
  const wall = fromIsoDate(dateIso).getTime() + minutes * 60_000;
  const offsetAt = (instant: number) => {
    const p = zoneParts(new Date(instant), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return new Date(guess);
}

// Monday of the week containing `dateIso`.
export function weekStartIso(dateIso: string): string {
  const day = fromIsoDate(dateIso).getUTCDay();
  return addDays(dateIso, -((day + 6) % 7));
}
