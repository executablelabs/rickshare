import { createApp } from "./app";
import { config } from "./config";
import { createMerchantRuntime } from "./runtime";

const runtime = createMerchantRuntime();
if (config.TRIP_FACTORY_ADDRESS) runtime.service().start(config.MERCHANT_POLL_INTERVAL_MS);
process.once("SIGTERM", () => {
  runtime.close();
  process.exit(0);
});
export default { port: config.PORT, fetch: createApp({ service: runtime.service() }).fetch };
