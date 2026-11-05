import { Hono } from "hono";
import catalogData from "./catalog.json";
import { Catalog } from "./schemas";

const catalog = Catalog.parse(catalogData);

export const app = new Hono()
  .get("/health", (context) => context.json({ status: "ok" } as const))
  .get("/catalog", (context) => context.json(catalog));
