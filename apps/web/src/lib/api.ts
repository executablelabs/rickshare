import type { AppType } from "@rickshare/api";
import { hc } from "hono/client";
import { config } from "../config";

export const api = hc<AppType>(config.VITE_API_URL, {
  init: { credentials: "include" },
});
