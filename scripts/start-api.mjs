// Starts the API (pnpm start:api). First applies any pending database
// migrations, so a deploy that adds columns can't leave the API reading a
// database without them ("Your workspace didn't load"). Render's
// preDeployCommand does the same, but only for services made from
// render.yaml; this covers services set up by hand too. If migrating fails,
// the API still starts and the error is in the logs.
import { spawnSync } from "node:child_process";

const started = Date.now();
const migrate = spawnSync("pnpm", ["--filter", "db", "db:deploy"], { stdio: "inherit", timeout: 120_000, env: process.env });
if (migrate.status === 0) {
  console.log(`[start] database migrations are up to date (${Math.round((Date.now() - started) / 1000)}s)`);
} else {
  console.error(`[start] database migration failed (exit ${migrate.status ?? migrate.signal ?? migrate.error?.message}). ` +
    "Check DIRECT_URL (Neon's direct, non-pooled connection string) on this service, or run `pnpm db:deploy`.");
}

await import("../backend/dist/index.js");
