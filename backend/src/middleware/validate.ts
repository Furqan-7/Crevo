import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

// Parses the body, query and route params with Zod. Parsed values replace
// the raw ones (coerced numbers, defaults, stripped unknown keys), so
// controllers read validated data only. Failures reach the error handler
// as a ZodError and become a 400 VALIDATION_ERROR.
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as Request["params"];
    if (schemas.body) req.body = schemas.body.parse(req.body);
    // Express 5 makes req.query a getter, so the parsed copy goes on res.locals.
    if (schemas.query) res.locals.query = schemas.query.parse(req.query);
    next();
  };
}
