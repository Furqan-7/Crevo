import { Router } from "express";
import * as misc from "../controllers/misc.controller";
import { summary } from "../controllers/today.controller";
import { aiLimit } from "../middleware/limits";
import { validate } from "../middleware/validate";
import { analyticsQuery, copilotBody, markAlertsReadBody } from "../schemas/misc";

export const alertsRouter = Router();

alertsRouter.get("/", misc.alerts);
alertsRouter.post("/read", validate({ body: markAlertsReadBody }), misc.readAlerts);

export const analyticsRouter = Router();

analyticsRouter.get("/", validate({ query: analyticsQuery }), misc.analytics);

export const summaryRouter = Router();

summaryRouter.get("/", summary);

// Copilot runs a model and several queries per question: a per-user limit.
export const copilotRouter = Router();

copilotRouter.post("/", aiLimit, validate({ body: copilotBody }), misc.copilot);
