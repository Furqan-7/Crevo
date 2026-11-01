import { Router } from "express";
import * as integrations from "../controllers/integrations.controller";
import { validate } from "../middleware/validate";
import { connectQuery, googleProviderParams, instagramImportBody, providerParams } from "../schemas/integrations";

export const integrationsRouter = Router();

integrationsRouter.get("/google/:provider/connect", validate({ params: googleProviderParams, query: connectQuery }), integrations.connectGoogle);
integrationsRouter.post("/instagram/import", validate({ body: instagramImportBody }), integrations.importInstagram);
integrationsRouter.post("/:provider/sync", validate({ params: providerParams }), integrations.sync);
integrationsRouter.delete("/:provider", validate({ params: providerParams }), integrations.disconnect);

// Mounted outside /api: the browser arrives here from Google, without a token.
export const publicIntegrationsRouter = Router();

publicIntegrationsRouter.get("/google/callback", integrations.googleCallback);
