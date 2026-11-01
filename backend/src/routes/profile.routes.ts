import { Router } from "express";
import * as profile from "../controllers/profile.controller";
import { validate } from "../middleware/validate";
import { accountParams, completeOnboardingBody, updateAccountBody, updateProfileBody } from "../schemas/profile";

export const profileRouter = Router();

profileRouter.get("/", profile.getProfile);
profileRouter.patch("/", validate({ body: updateProfileBody }), profile.updateProfile);
profileRouter.put("/accounts/:provider", validate({ params: accountParams, body: updateAccountBody }), profile.setAccount);
profileRouter.post("/onboarding", validate({ body: completeOnboardingBody }), profile.completeOnboarding);

export const workspaceRouter = Router();

workspaceRouter.post("/sample", profile.loadSampleWorkspace);
workspaceRouter.delete("/", profile.clearWorkspace);
