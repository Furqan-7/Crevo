import type { NextFunction, Request, Response } from "express";
import { Prisma } from "db";
import { ZodError } from "zod";
import { env } from "../config/env";
import type { ApiFailure } from "../types/api";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiFailure = { success: false, message: `No route for ${req.method} ${req.path}`, error: "ROUTE_NOT_FOUND" };
  res.status(404).json(body);
}

// The one place errors become responses. Known errors keep their message;
// anything else is logged and answered with a generic 500, so connection
// strings, SQL and stack traces never reach the client.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let body: ApiFailure = { success: false, message: "Something went wrong on our side", error: "INTERNAL_ERROR" };

  if (err instanceof AppError) {
    status = err.status;
    body = { success: false, message: err.message, error: err.code };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      success: false,
      message: "Some fields are missing or invalid",
      error: "VALIDATION_ERROR",
      details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      status = 404;
      body = { success: false, message: "That item no longer exists", error: "NOT_FOUND" };
    } else if (err.code === "P2002") {
      status = 409;
      body = { success: false, message: "That already exists", error: "CONFLICT" };
    } else if (err.code === "P2003") {
      status = 400;
      body = { success: false, message: "A linked item does not exist", error: "INVALID_REFERENCE" };
    }
  } else if (isBodyParserError(err)) {
    status = err.status;
    body = {
      success: false,
      message: err.type === "entity.too.large" ? "Request body is too large" : "Request body is not valid JSON",
      error: err.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
    };
  }

  // Known 5xx answers (a feature not set up, AI down) are expected: a
  // warning, no stack. Anything unexpected is an error with its stack.
  if (status >= 500 && err instanceof AppError) {
    logger.warn("request refused", { id: res.locals.requestId, method: req.method, path: req.path, code: body.error });
  } else if (status >= 500) {
    logger.error("request failed", {
      id: res.locals.requestId,
      method: req.method,
      path: req.path,
      code: body.error,
      error: err instanceof Error ? err.message : String(err),
      ...(env.isProduction || !(err instanceof Error) ? {} : { stack: err.stack }),
    });
  }
  res.status(status).json(body);
}

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return typeof err === "object" && err !== null && "type" in err && "status" in err && typeof (err as { status: unknown }).status === "number";
}
