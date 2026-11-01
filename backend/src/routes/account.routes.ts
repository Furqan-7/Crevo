import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import * as account from "../controllers/account.controller";
import { aiLimit, uploadLimit } from "../middleware/limits";
import { validate } from "../middleware/validate";
import { briefingSection } from "../schemas/common";
import { AppError } from "../utils/AppError";

export const accountRouter = Router();
accountRouter.delete("/", account.removeAccount);

export const briefingRouter = Router();
briefingRouter.get(
  "/preview",
  validate({
    query: z.object({
      time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      name: z.string().trim().max(40).optional(),
      sections: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(",") : []))
        .pipe(z.array(briefingSection)),
      format: z.enum(["html", "text", "json"]).default("json"),
    }),
  }),
  account.briefingPreview,
);

// Contracts are read in memory (never written to disk), 15 MB at most.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

export const contractsRouter = Router();
contractsRouter.post(
  "/read",
  uploadLimit,
  aiLimit,
  (req, res, next) =>
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return next(new AppError(err.code === "LIMIT_FILE_SIZE" ? 413 : 400, err.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "BAD_UPLOAD", err.code === "LIMIT_FILE_SIZE" ? "Contracts can be up to 15 MB." : err.message));
      next(err as Error | undefined);
    }),
  account.readContractUpload,
);
