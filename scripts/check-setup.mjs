#!/usr/bin/env node
// pnpm check:setup — checks the .env files before you run Crevo.
//
// Reads frontend/.env.local, backend/.env and db/.env (never prints a secret),
// then reports:
//   - required keys that are missing or still the example placeholder
//   - whether the frontend and backend point at the same Supabase project
//   - whether Supabase accepts the anon key (one request to its auth API)
//   - whether the Neon URLs look right (pooled for the app, direct for migrations)
//   - which optional features are switched on
// Exits with code 1 if anything required is wrong, so it can gate a deploy.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const offline = process.argv.includes("--offline");

const color = process.stdout.isTTY ? (code, s) => `\x1b[${code}m${s}\x1b[0m` : (_c, s) => s;
const ok = (msg) => console.log(`  ${color(32, "✓")} ${msg}`);
const warn = (msg) => console.log(`  ${color(33, "!")} ${msg}`);
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ${color(31, "✗")} ${msg}`);
};

/** Minimal .env parser: KEY=value, optional quotes, # comments. */
function readEnv(relPath) {
  const file = join(root, relPath);
  if (!existsSync(file)) return null;
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    env[m[1]] = value.trim();
  }
  return env;
}

/** Empty, or still the value from the .env.example file. */
const isPlaceholder = (v) => !v || /YOUR-PROJECT|USER:PASSWORD|ep-xxxx|yourdomain\.com/.test(v);

function requireKeys(label, env, keys) {
  for (const key of keys) {
    if (isPlaceholder(env[key])) fail(`${label}: ${key} is ${env[key] ? "still the example value" : "missing"}`);
    else ok(`${label}: ${key} is set`);
  }
}

function checkFile(relPath, example) {
  const env = readEnv(relPath);
  if (!env) fail(`${relPath} doesn't exist. Create it with: cp ${example} ${relPath}`);
  return env;
}

async function supabaseAccepts(url, key) {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    return { status: res.status };
  } catch (error) {
    return { error: error.cause?.code ?? error.name ?? "network error" };
  }
}

function checkPostgresUrl(label, value, { pooled }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail(`${label} isn't a valid connection string`);
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) return fail(`${label} should start with postgresql://`);
  if (url.hostname.endsWith(".neon.tech")) {
    const isPooler = url.hostname.includes("-pooler");
    if (pooled && !isPooler) warn(`${label} is Neon's direct host; the app should use the pooled one (host contains "-pooler")`);
    if (!pooled && isPooler) warn(`${label} is Neon's pooled host; migrations need the direct one (without "-pooler")`);
    if (url.searchParams.get("sslmode") !== "require") warn(`${label} should end with ?sslmode=require for Neon`);
  }
  ok(`${label} looks like a Postgres URL (${url.hostname})`);
}

console.log("\nCrevo setup check\n");

// ── Frontend ────────────────────────────────────────────────────────────────
console.log("frontend/.env.local");
const fe = checkFile("frontend/.env.local", "frontend/.env.example");
if (fe) {
  requireKeys("frontend", fe, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_API_URL"]);
  if (fe.SUPABASE_SERVICE_ROLE_KEY) fail("frontend: remove SUPABASE_SERVICE_ROLE_KEY — the secret key must never be in the frontend");
}

// ── Database ────────────────────────────────────────────────────────────────
console.log("\ndb/.env");
const db = checkFile("db/.env", "db/.env.example");
if (db) {
  requireKeys("db", db, ["DATABASE_URL", "DIRECT_URL"]);
  if (!isPlaceholder(db.DATABASE_URL)) checkPostgresUrl("db: DATABASE_URL", db.DATABASE_URL, { pooled: true });
  if (!isPlaceholder(db.DIRECT_URL)) checkPostgresUrl("db: DIRECT_URL", db.DIRECT_URL, { pooled: false });
}

// ── Backend ─────────────────────────────────────────────────────────────────
console.log("\nbackend/.env");
const be = checkFile("backend/.env", "backend/.env.example");
if (be) {
  requireKeys("backend", be, ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "CORS_ORIGIN", "APP_URL", "API_URL"]);
  if (db && !isPlaceholder(be.DATABASE_URL) && !isPlaceholder(db.DATABASE_URL) && be.DATABASE_URL !== db.DATABASE_URL) {
    warn("backend and db have different DATABASE_URL values — usually they should match");
  }
}

// ── Frontend ↔ backend ──────────────────────────────────────────────────────
console.log("\nSupabase");
const sbUrl = fe?.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = fe?.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (fe && be && !isPlaceholder(sbUrl) && !isPlaceholder(be.SUPABASE_URL)) {
  if (sbUrl.replace(/\/$/, "") !== be.SUPABASE_URL.replace(/\/$/, "")) {
    fail("frontend and backend point at different Supabase projects (NEXT_PUBLIC_SUPABASE_URL vs SUPABASE_URL)");
  } else ok("frontend and backend use the same Supabase project");
  if (sbKey && be.SUPABASE_ANON_KEY && sbKey !== be.SUPABASE_ANON_KEY) {
    fail("frontend and backend have different anon keys (NEXT_PUBLIC_SUPABASE_ANON_KEY vs SUPABASE_ANON_KEY)");
  }
}
if (fe && be && !isPlaceholder(fe.NEXT_PUBLIC_API_URL) && !isPlaceholder(be.API_URL) && fe.NEXT_PUBLIC_API_URL.replace(/\/$/, "") !== be.API_URL.replace(/\/$/, "")) {
  warn(`frontend calls the API at ${fe.NEXT_PUBLIC_API_URL} but the backend says it runs at ${be.API_URL}`);
}
if (be && !isPlaceholder(be.CORS_ORIGIN) && !isPlaceholder(be.APP_URL)) {
  const origins = be.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, ""));
  if (!origins.includes(be.APP_URL.replace(/\/$/, ""))) warn(`backend CORS_ORIGIN doesn't include APP_URL (${be.APP_URL}); the site's requests would be refused`);
}

if (!isPlaceholder(sbUrl) && !isPlaceholder(sbKey)) {
  if (offline) warn("skipped the Supabase connection test (--offline)");
  else {
    const result = await supabaseAccepts(sbUrl, sbKey);
    if (result.status === 200) ok(`Supabase accepted the anon key (${new URL(sbUrl).hostname})`);
    else if (result.status === 401 || result.status === 403) fail("Supabase rejected the anon key — copy it again from Project settings → API keys");
    else if (result.status) fail(`Supabase answered ${result.status} — check NEXT_PUBLIC_SUPABASE_URL`);
    else fail(`couldn't reach Supabase at ${sbUrl} (${result.error})`);
  }
}

// ── Optional features ───────────────────────────────────────────────────────
if (be) {
  console.log("\nOptional features (backend/.env)");
  const feature = (name, keys) =>
    keys.every((k) => !isPlaceholder(be[k])) ? ok(`${name}: on`) : console.log(`  - ${name}: off (set ${keys.join(", ")})`);
  feature("AI (Gemini)", ["GEMINI_API_KEY"]);
  feature("AI backup (Groq)", ["GROQ_API_KEY"]);
  feature("Gmail, Calendar and YouTube", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]);
  feature("Uploads", ["SUPABASE_SERVICE_ROLE_KEY"]);
  feature("Briefing emails", ["RESEND_API_KEY", "EMAIL_FROM"]);
}

console.log(
  failures
    ? `\n${color(31, `${failures} problem${failures === 1 ? "" : "s"} to fix`)} before running Crevo.\n`
    : `\n${color(32, "Ready.")} Next: pnpm db:migrate, then pnpm dev\n`,
);
process.exit(failures ? 1 : 0);
