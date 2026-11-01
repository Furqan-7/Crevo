import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

// Gives every request an id (returned as X-Request-Id, and on error logs)
// and logs one line when it finishes. Paths only; never query strings,
// headers or bodies, which can hold tokens.
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/health") return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info("request", { id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms), user: res.locals.userId });
  });
  next();
}
