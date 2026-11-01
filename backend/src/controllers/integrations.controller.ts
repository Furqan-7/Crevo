import type { Request, Response } from "express";
import type { Provider } from "db";
import { getOrCreateProfile } from "../services/profile.service";
import { importInstagramCsv } from "../services/integrations/instagram.service";
import * as integrations from "../services/integrations/integrations.service";
import { sendSuccess } from "../utils/response";

export async function connectGoogle(req: Request, res: Response) {
  const { provider } = req.params as { provider: Provider };
  const { returnTo } = res.locals.query as { returnTo?: string };
  sendSuccess(res, integrations.startGoogleConnect(res.locals.userId, provider, returnTo), "Continue at Google");
}

// Public: Google redirects the browser here (no bearer token; the signed
// state says who started it).
export async function googleCallback(req: Request, res: Response) {
  const { state, code, error } = req.query as Record<string, string | undefined>;
  res.redirect(303, await integrations.finishGoogleConnect({ state, code, error }));
}

export async function disconnect(req: Request, res: Response) {
  const { provider } = req.params as { provider: Provider };
  await integrations.disconnect(res.locals.userId, provider);
  sendSuccess(res, await getOrCreateProfile(res.locals.userId, res.locals.email), "Disconnected");
}

export async function sync(req: Request, res: Response) {
  const { provider } = req.params as { provider: Provider };
  await integrations.syncNow(res.locals.userId, provider);
  sendSuccess(res, null, "Sync started", 202);
}

export async function importInstagram(req: Request, res: Response) {
  const { csv, fileName } = req.body as { csv: string; fileName: string };
  const result = await importInstagramCsv(res.locals.userId, csv, fileName);
  sendSuccess(res, { ...result, profile: await getOrCreateProfile(res.locals.userId, res.locals.email) }, `Imported ${result.imported} days`);
}
