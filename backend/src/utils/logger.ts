// Structured logs: one JSON object per line in production (what Render,
// Railway and Fly index), a readable line in development. Never pass tokens,
// passwords or full request bodies here.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const production = process.env.NODE_ENV === "production";
const quiet = process.env.NODE_ENV === "test";

function write(level: Level, message: string, fields: Fields = {}) {
  if (quiet && level !== "error") return;
  if (production) {
    const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
    return;
  }
  const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(`[${level}] ${message}${extra}`);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
