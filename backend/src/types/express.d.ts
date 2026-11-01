// What the auth middleware puts on res.locals for the handlers after it.
declare global {
  namespace Express {
    interface Locals {
      userId: string;
      email: string;
      // The name on the Supabase account, if any.
      name: string;
      // Parsed query string, set by validate({ query }).
      query?: unknown;
      requestId?: string;
    }
  }
}

export {};
