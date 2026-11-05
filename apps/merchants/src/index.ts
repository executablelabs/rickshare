import { app } from "./app";
import { config } from "./config";

export default { port: config.PORT, fetch: app.fetch };
