import type { AppType } from "@kitty/api";
import { hc } from "hono/client";
import { config } from "../config";

export const api = hc<AppType>(config.VITE_API_URL, {
  init: { credentials: "include" },
});
