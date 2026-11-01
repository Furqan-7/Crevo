import rateLimit from "express-rate-limit";

const limited = (message: string) => ({ success: false, message, error: "RATE_LIMITED" });

// AI calls cost money and take seconds, so each user gets a tighter budget
// (keyed by their id, set by requireAuth, rather than by IP).
export const aiLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req, res) => res.locals.userId,
  message: limited("That's a lot of AI requests at once. Wait a minute and try again."),
});

export const uploadLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req, res) => res.locals.userId,
  message: limited("Too many uploads this hour. Try again later."),
});
