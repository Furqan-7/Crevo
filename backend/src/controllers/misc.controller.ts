import type { Request, Response } from "express";
import type { AnalyticsQuery, CopilotInput } from "../schemas/misc";
import { listAlerts, markAlertsRead } from "../services/alerts.service";
import { getAnalytics } from "../services/analytics.service";
import { askCopilot } from "../services/copilot.service";
import { sendSuccess } from "../utils/response";

export async function alerts(req: Request, res: Response) {
  sendSuccess(res, await listAlerts(res.locals.userId), "Alerts fetched");
}

export async function readAlerts(req: Request, res: Response) {
  sendSuccess(res, await markAlertsRead(res.locals.userId, (req.body as { ids: string[] }).ids), "Alerts marked read");
}

export async function analytics(req: Request, res: Response) {
  const { range } = res.locals.query as AnalyticsQuery;
  sendSuccess(res, await getAnalytics(res.locals.userId, range), "Analytics fetched");
}

export async function copilot(req: Request, res: Response) {
  const { question, history } = req.body as CopilotInput;
  sendSuccess(res, await askCopilot(res.locals.userId, question, history), "Answered");
}
