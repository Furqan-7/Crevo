import type { Request, Response } from "express";
import type { CompleteOnboardingInput, UpdateProfileInput } from "../schemas/profile";
import * as profileService from "../services/profile.service";
import { resetWorkspace } from "../services/workspace.service";
import type { AccountStatus, Provider } from "../types/api";
import { sendSuccess } from "../utils/response";

export async function getProfile(req: Request, res: Response) {
  const profile = await profileService.getOrCreateProfile(res.locals.userId, res.locals.email);
  sendSuccess(res, profile, "Profile fetched");
}

export async function updateProfile(req: Request, res: Response) {
  const profile = await profileService.updateProfile(res.locals.userId, req.body as UpdateProfileInput);
  sendSuccess(res, profile, "Settings saved");
}

export async function setAccount(req: Request, res: Response) {
  const { provider } = req.params as { provider: Provider };
  const { status } = req.body as { status: AccountStatus };
  const profile = await profileService.setAccountStatus(res.locals.userId, provider, status);
  sendSuccess(res, profile, "Account updated");
}

export async function completeOnboarding(req: Request, res: Response) {
  const input = req.body as CompleteOnboardingInput;
  const profile = await profileService.completeOnboarding(res.locals.userId, res.locals.email, { ...input, name: input.name || res.locals.name || undefined });
  sendSuccess(res, profile, "Onboarding complete");
}

export async function loadSampleWorkspace(req: Request, res: Response) {
  await profileService.getOrCreateProfile(res.locals.userId, res.locals.email);
  await profileService.loadSampleWorkspace(res.locals.userId);
  sendSuccess(res, await profileService.getOrCreateProfile(res.locals.userId, res.locals.email), "Sample workspace added", 201);
}

export async function clearWorkspace(req: Request, res: Response) {
  await resetWorkspace(res.locals.userId);
  sendSuccess(res, null, "Workspace cleared");
}
