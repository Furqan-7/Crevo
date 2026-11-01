import "./config/env";
import { startBackground } from "./jobs/scheduler";
import { logger } from "./utils/logger";

// The background worker on its own, for hosts where it runs as a separate
// process (set RUN_WORKER=false on the API then).
const background = startBackground();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info("worker stopping", { signal });
    background.stop().then(() => process.exit(0));
  });
}
