import type { AppType } from "@rickshare/api";
import { hc } from "hono/client";
import { config } from "../config";

const baseUrl = new URL(config.VITE_API_URL, window.location.origin).toString();

export const api = hc<AppType>(baseUrl, {
  init: { credentials: "include" },
});
