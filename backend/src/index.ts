import { env } from "./config/env";
import { app } from "./app";
import { startBackground } from "./jobs/scheduler";
import { logger } from "./utils/logger";

const server = app.listen(env.PORT, () => {
  logger.info("Crevo API listening", { port: env.PORT, env: env.NODE_ENV });
});

const background = env.RUN_WORKER === "true" ? startBackground() : null;

// Finish in-flight requests and jobs before exiting when the host stops the process.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await background?.stop();
      process.exit(0);
    });
  });
}
