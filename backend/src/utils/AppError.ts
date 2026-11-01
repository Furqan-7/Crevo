// An error whose message is safe to show the client, with the HTTP status
// and a stable machine-readable code.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`);
export const badRequest = (message: string, code = "BAD_REQUEST") => new AppError(400, code, message);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
