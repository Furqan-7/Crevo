import { prisma, type EventType } from "db";
import { googleFetch, GoogleApiError } from "../../lib/google";
import { addDays, minutesNowIn, todayIn, toIsoDate, zonedToUtc } from "../../utils/dates";

// Google Calendar, both ways. Pull: events from the creator's primary
// calendar (a week back, two months ahead) show in Crevo. Push:
// events made in Crevo, deal deadlines the creator added and scheduled
// posts go to Google, tagged so the pull doesn't bring them back twice.

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export function guessType(e: Pick<GEvent, "summary" | "hangoutLink" | "location">): EventType {
  const t = (e.summary ?? "").toLowerCase();
  if (/\b(film|shoot|record|edit|b-?roll|vlog)\b/.test(t)) return "film";
  if (/\b(due|deadline|deliver)\b/.test(t)) return "deadline";
  if (/\b(post|publish|upload|live)\b/.test(t)) return "post";
  return "call";
}

async function listAll(userId: string, params: Record<string, string>) {
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const page = await googleFetch<{ items?: GEvent[]; nextPageToken?: string }>(userId, `${API}?${new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) })}`);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && events.length < 1000);
  return events;
}

const allDay = (date: string, title: string, description: string) => ({
  summary: title,
  description,
  start: { date },
  end: { date: addDays(date, 1) },
  extendedProperties: { private: { crevo: "1" } },
});

export async function syncCalendar(userId: string) {
  const { timezone: tz } = await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = todayIn(tz);
  const from = addDays(today, -7);
  const to = addDays(today, 60);
  const window = { timeMin: zonedToUtc(from, 0, tz).toISOString(), timeMax: zonedToUtc(to, 0, tz).toISOString(), singleEvents: "true", maxResults: "250" };

  // ── Pull ──
  const remote = (await listAll(userId, window)).filter((e) => e.extendedProperties?.private?.crevo !== "1");
  const seen = new Set<string>();
  for (const e of remote) {
    if (e.status === "cancelled" || !e.start) continue;
    const startAt = e.start.dateTime ? new Date(e.start.dateTime) : null;
    const endAt = e.end?.dateTime ? new Date(e.end.dateTime) : null;
    const date = e.start.date ?? todayIn(tz, startAt!);
    const data = {
      title: (e.summary ?? "(no title)").slice(0, 160),
      type: guessType(e),
      date: new Date(`${date}T00:00:00.000Z`),
      startMinutes: startAt ? minutesNowIn(tz, startAt) : null,
      // Events that run past midnight end at the end of the first day here.
      endMinutes: startAt && endAt ? (todayIn(tz, endAt) === date ? minutesNowIn(tz, endAt) : 24 * 60) : null,
      detail: (e.location ?? e.description?.split("\n")[0] ?? null)?.slice(0, 300) ?? null,
      linkHref: e.htmlLink ?? null,
      linkLabel: e.htmlLink ? "Open in Google Calendar" : null,
      tentative: e.status === "tentative",
      source: "google" as const,
    };
    seen.add(e.id);
    await prisma.calendarEvent.upsert({
      where: { profileId_googleEventId: { profileId: userId, googleEventId: e.id } },
      create: { profileId: userId, googleEventId: e.id, ...data },
      update: data,
    });
  }
  // Google events in the window that are gone (deleted or cancelled there).
  await prisma.calendarEvent.deleteMany({
    where: { profileId: userId, source: "google", date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, googleEventId: { notIn: [...seen] } },
  });

  // ── Push ──
  const local = await prisma.calendarEvent.findMany({ where: { profileId: userId, source: "crevo", googleEventId: null, date: { gte: new Date(`${today}T00:00:00Z`) } } });
  for (const e of local) {
    const date = toIsoDate(e.date);
    const body =
      e.startMinutes === null
        ? allDay(date, e.title, e.detail ?? "Added in Crevo")
        : {
            summary: e.title,
            description: e.detail ?? "Added in Crevo",
            start: { dateTime: zonedToUtc(date, e.startMinutes, tz).toISOString(), timeZone: tz },
            end: { dateTime: zonedToUtc(date, e.endMinutes ?? e.startMinutes + 30, tz).toISOString(), timeZone: tz },
            extendedProperties: { private: { crevo: "1" } },
          };
    const created = await googleFetch<GEvent>(userId, API, { method: "POST", body });
    await prisma.calendarEvent.update({ where: { id: e.id }, data: { googleEventId: created.id } });
  }

  const deliverables = await prisma.deliverable.findMany({
    where: { done: false, googleEventId: null, dueDate: { gte: new Date(`${today}T00:00:00Z`) }, deal: { profileId: userId, inCalendar: true } },
    include: { deal: { select: { brand: true, campaign: true } } },
  });
  for (const d of deliverables) {
    const created = await googleFetch<GEvent>(userId, API, { method: "POST", body: allDay(toIsoDate(d.dueDate), `${d.deal.brand}: ${d.title}`, `${d.deal.campaign} · from Crevo`) });
    await prisma.deliverable.update({ where: { id: d.id }, data: { googleEventId: created.id } });
  }

  const posts = await prisma.scheduledPost.findMany({
    where: { googleEventId: null, status: "scheduled", scheduledAt: { gte: new Date() }, clip: { video: { profileId: userId } } },
    include: { clip: { select: { short: true } } },
  });
  for (const p of posts) {
    const created = await googleFetch<GEvent>(userId, API, {
      method: "POST",
      body: {
        summary: `Post: ${p.clip.short} (${p.platform})`,
        description: p.caption,
        start: { dateTime: p.scheduledAt.toISOString(), timeZone: tz },
        end: { dateTime: new Date(p.scheduledAt.getTime() + 30 * 60_000).toISOString(), timeZone: tz },
        extendedProperties: { private: { crevo: "1" } },
      },
    });
    await prisma.scheduledPost.update({ where: { id: p.id }, data: { googleEventId: created.id } });
  }

  await prisma.connectedAccount.update({ where: { profileId_provider: { profileId: userId, provider: "calendar" } }, data: { syncedAt: new Date(), lastError: null } });
}

export async function deleteGoogleEvent(userId: string, googleEventId: string) {
  try {
    await googleFetch(userId, `${API}/${encodeURIComponent(googleEventId)}`, { method: "DELETE" });
  } catch (err) {
    // Already gone on Google's side.
    if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410))) throw err;
  }
}
