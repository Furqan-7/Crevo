import { Router } from "express";
import * as events from "../controllers/events.controller";
import { validate } from "../middleware/validate";
import { idParam } from "../schemas/common";
import { createEventBody, listEventsQuery, updateEventBody } from "../schemas/events";

export const eventsRouter = Router();

eventsRouter.get("/", validate({ query: listEventsQuery }), events.listEvents);
eventsRouter.post("/", validate({ body: createEventBody }), events.createEvent);
eventsRouter.patch("/:id", validate({ params: idParam, body: updateEventBody }), events.updateEvent);
eventsRouter.delete("/:id", validate({ params: idParam }), events.deleteEvent);
