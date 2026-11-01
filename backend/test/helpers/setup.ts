// Shared test setup. Imported first by every test file: it sets the
// environment the app reads at import time and swaps in a fake network for
// every host except localhost, so tests never reach Supabase, Gemini,
// Groq, Google or Resend.
import { generateKeyPairSync, randomBytes, randomUUID, sign as signData } from "crypto";

export const TEST_DB = process.env.TEST_DATABASE_URL;
export const SUPABASE_URL = "https://test-project.supabase.co";

Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "4999",
  CORS_ORIGIN: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  API_URL: "http://localhost:4000",
  DATABASE_URL: TEST_DB ?? "postgresql://missing/test",
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon-key",
  RUN_WORKER: "false",
  GEMINI_API_KEY: process.env.TEST_NO_AI ? "" : "test-gemini-key",
  GROQ_API_KEY: process.env.TEST_NO_AI ? "" : "test-groq-key",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "Crevo <briefing@example.com>",
});

// ── Fake network ────────────────────────────────────────────────────────────

export interface FakeRequest {
  url: URL;
  method: string;
  headers: Headers;
  text: string;
  json: <T = Record<string, unknown>>() => T;
}
type Handler = (req: FakeRequest) => Response | Promise<Response>;

const routes: { method: string; match: (u: URL) => boolean; handle: Handler; once: boolean }[] = [];
export const calls: FakeRequest[] = [];

// Register a fake response. Later registrations win over earlier ones.
export function on(method: string, pattern: string | RegExp, handle: Handler, opts: { once?: boolean } = {}) {
  const match = (u: URL) => {
    const target = `${u.origin}${u.pathname}`;
    return typeof pattern === "string" ? target === pattern || target.startsWith(pattern) : pattern.test(target);
  };
  routes.unshift({ method, match, handle, once: Boolean(opts.once) });
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const body = init?.body;
  const text = typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : body instanceof Uint8Array ? Buffer.from(body).toString("utf8") : "";
  const req: FakeRequest = { url, method, headers: new Headers(init?.headers), text, json: () => JSON.parse(text) };
  calls.push(req);
  const index = routes.findIndex((r) => r.method === method && r.match(url));
  if (index < 0) throw new Error(`unexpected request in test: ${method} ${url.href}`);
  const route = routes[index]!;
  if (route.once) routes.splice(index, 1);
  return route.handle(req);
}) as typeof fetch;

// ── Supabase tokens ─────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "test-kid";
on("GET", `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, () =>
  json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] }),
);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

// A signed access token like Supabase issues, for a new or given user.
export function token(opts: { sub?: string; email?: string; ttl?: number; name?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const sub = opts.sub ?? randomUUID();
  const head = b64({ alg: "ES256", typ: "JWT", kid: KID });
  const body = b64({
    iss: `${SUPABASE_URL}/auth/v1`,
    sub,
    aud: "authenticated",
    role: "authenticated",
    email: opts.email ?? `${sub.slice(0, 8)}@test.dev`,
    exp: now + (opts.ttl ?? 3600),
    iat: now,
    user_metadata: opts.name ? { full_name: opts.name } : {},
  });
  const signature = signData("sha256", Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return { sub, token: `${head}.${body}.${signature.toString("base64url")}` };
}

// ── The API, in-process ─────────────────────────────────────────────────────

export async function startApi() {
  const { app } = await import("../../src/app");
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const call = async (t: string | null, method: string, path: string, body?: unknown) => {
    const res = await realFetch(`http://127.0.0.1:${port}${path}`, {
      method,
      redirect: "manual",
      headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body !== undefined && typeof body !== "string" && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : typeof body === "string" || body instanceof FormData ? body : JSON.stringify(body),
    });
    const text = await res.text();
    // Response bodies are checked field by field in the tests.
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  return { call, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// A Gemini generateContent response with the given text (or function calls).
export const geminiText = (text: string) => json({ candidates: [{ content: { role: "model", parts: [{ text }] } }] });
export const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
