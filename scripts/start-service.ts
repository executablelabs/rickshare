import { z } from "zod";
import { startWebServer } from "./serve-web";

const service = z.enum(["web", "api", "merchants"]).parse(process.env.RICKSHARE_SERVICE);
if (service === "web") {
  startWebServer();
} else if (service === "api") {
  const { default: options } = await import("../apps/api/src/index");
  Bun.serve({ ...options, hostname: "::" });
} else {
  const { default: options } = await import("../apps/merchants/src/index");
  Bun.serve({ ...options, hostname: "::" });
}
