import { createApp } from "./app";
import { config } from "./config";
import { createRuntime } from "./runtime";

const runtime = createRuntime();
if (config.TRIP_FACTORY_ADDRESS) runtime.indexer().start(config.INDEXER_POLL_INTERVAL_MS);
process.once("SIGTERM", () => {
  runtime.close();
  process.exit(0);
});

export default { port: config.PORT, fetch: createApp({ runtime }).fetch };
