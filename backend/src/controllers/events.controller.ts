import type { Request, Response } from "express";
import type { CreateEventInput, ListEventsQuery, UpdateEventInput } from "../schemas/events";
import * as eventsService from "../services/events.service";
import { sendSuccess } from "../utils/response";

export async function listEvents(req: Request, res: Response) {
  sendSuccess(res, await eventsService.listEvents(res.locals.userId, res.locals.query as ListEventsQuery), "Events fetched");
}

export async function createEvent(req: Request, res: Response) {
  sendSuccess(res, await eventsService.createEvent(res.locals.userId, req.body as CreateEventInput), "Event added", 201);
}

export async function updateEvent(req: Request, res: Response) {
  sendSuccess(res, await eventsService.updateEvent(res.locals.userId, req.params.id as string, req.body as UpdateEventInput), "Event updated");
}

export async function deleteEvent(req: Request, res: Response) {
  await eventsService.deleteEvent(res.locals.userId, req.params.id as string);
  res.status(204).end();
}
