import { config } from "dotenv";
import { resolve } from "path";
import { z } from "zod";

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

// Every variable the API needs, checked once at start-up so a missing
// value fails loudly instead of on the first request. The core four are
// required; each integration switches on when its keys are present.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of origins allowed to call the API.
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.url("SUPABASE_URL must be a URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),

  // The frontend's public origin: OAuth and email links send people here.
  APP_URL: z.url().optional(),
  // This API's public origin, for the Google OAuth callback.
  API_URL: z.url().optional(),

  // Supabase Storage (uploads) and account deletion. Server-side only.
  SUPABASE_SERVICE_ROLE_KEY: optional,
  STORAGE_BUCKET: z.string().default("uploads"),

  // AI. Gemini first, Groq when Gemini fails or isn't set.
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  GROQ_API_KEY: optional,
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  // Google OAuth for Gmail, Calendar and YouTube.
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  // 32 random bytes, base64 (openssl rand -base64 32). Encrypts stored tokens.
  TOKEN_ENCRYPTION_KEY: optional,

  // Email (the morning briefing) through Resend.
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,

  // Run the background worker inside this process ("true"), or not
  // ("false") when a separate `pnpm --filter backend worker` runs it.
  RUN_WORKER: z.enum(["true", "false"]).default("true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  console.error(`Invalid environment variables:\n${problems}`);
  process.exit(1);
}

const e = parsed.data;

if (e.TOKEN_ENCRYPTION_KEY && Buffer.from(e.TOKEN_ENCRYPTION_KEY, "base64").length !== 32) {
  console.error("Invalid environment variables:\n  - TOKEN_ENCRYPTION_KEY: must be 32 bytes, base64 (openssl rand -base64 32)");
  process.exit(1);
}

export const env = {
  ...e,
  corsOrigins: e.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  isProduction: e.NODE_ENV === "production",
  appUrl: (e.APP_URL ?? e.CORS_ORIGIN.split(",")[0]!.trim()).replace(/\/$/, ""),
  apiUrl: (e.API_URL ?? `http://localhost:${e.PORT}`).replace(/\/$/, ""),
};

// Which optional features are switched on.
export const features = {
  ai: Boolean(e.GEMINI_API_KEY || e.GROQ_API_KEY),
  embeddings: Boolean(e.GEMINI_API_KEY),
  google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.TOKEN_ENCRYPTION_KEY),
  storage: Boolean(e.SUPABASE_SERVICE_ROLE_KEY),
  email: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM),
};
