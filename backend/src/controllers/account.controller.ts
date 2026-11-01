import type { Request, Response } from "express";
import type { BriefingSection } from "../email/briefing";
import { deleteAccount } from "../services/account.service";
import { previewBriefing } from "../services/briefing.service";
import { readContract } from "../services/contracts.service";
import { badRequest } from "../utils/AppError";
import { sendSuccess } from "../utils/response";

export async function removeAccount(req: Request, res: Response) {
  const result = await deleteAccount(res.locals.userId);
  sendSuccess(res, result, result.loginDeleted ? "Account deleted" : "Workspace deleted");
}

export async function briefingPreview(req: Request, res: Response) {
  const q = res.locals.query as { time?: string; name?: string; sections?: BriefingSection[]; format: "html" | "text" | "json" };
  const email = await previewBriefing(res.locals.userId, q);
  if (q.format === "html") return res.type("html").send(email.html);
  if (q.format === "text") return res.type("text").send(`Subject: ${email.subject}\n\n${email.text}`);
  return sendSuccess(res, email, "Preview built");
}

export async function readContractUpload(req: Request, res: Response) {
  if (!req.file) throw badRequest("Attach the contract as a file named \"file\".", "FILE_REQUIRED");
  sendSuccess(res, await readContract(res.locals.userId, req.file), "Contract read");
}
