import { prisma } from "db";
import type { CreateEventInput, ListEventsQuery, UpdateEventInput } from "../schemas/events";
import type { EventDto } from "../types/api";
import { fromIsoDate } from "../utils/dates";
import { enqueue } from "../jobs/queue";
import { toEventDto } from "./mappers";

// When Google Calendar is connected, changes here are copied to it.
export async function pushCalendar(userId: string) {
  const account = await prisma.connectedAccount.findUnique({ where: { profileId_provider: { profileId: userId, provider: "calendar" } }, select: { status: true } });
  if (account?.status === "connected") await enqueue("sync.calendar", {}, { profileId: userId, key: `sync.calendar:${userId}` });
}

export async function listEvents(userId: string, query: ListEventsQuery): Promise<EventDto[]> {
  const rows = await prisma.calendarEvent.findMany({
    where: {
      profileId: userId,
      date: { gte: query.from ? fromIsoDate(query.from) : undefined, lte: query.to ? fromIsoDate(query.to) : undefined },
    },
    orderBy: [{ date: "asc" }, { startMinutes: { sort: "asc", nulls: "first" } }],
  });
  return rows.map(toEventDto);
}

export async function createEvent(userId: string, input: CreateEventInput): Promise<EventDto> {
  const event = await prisma.calendarEvent.create({
    data: {
      profileId: userId,
      title: input.title,
      type: input.type,
      date: fromIsoDate(input.date),
      startMinutes: input.startMinutes,
      endMinutes: input.endMinutes,
      detail: input.detail,
      tentative: input.tentative,
    },
  });
  await pushCalendar(userId);
  return toEventDto(event);
}

export async function updateEvent(userId: string, id: string, input: UpdateEventInput): Promise<EventDto> {
  const event = await prisma.calendarEvent.update({ where: { id, profileId: userId }, data: input });
  return toEventDto(event);
}

export async function deleteEvent(userId: string, id: string) {
  const event = await prisma.calendarEvent.delete({ where: { id, profileId: userId } });
  if (event.googleEventId) await enqueue("calendar.delete", { googleEventId: event.googleEventId }, { profileId: userId });
}
