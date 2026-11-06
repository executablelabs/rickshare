import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { RICKSHAW_PATHS } from "./RickshawMark";

// happy-dom replaces the global URL, so resolve the folder through node:url instead.
const brandDir = join(dirname(fileURLToPath(import.meta.url)), "../../../public/brand");
const files = ["rickshare-mark.svg", "rickshare-mark-on-dark.svg", "rickshare-icon.svg"];

test.each(files)("public/brand/%s draws the same mark as RickshawMark", (file) => {
  const svg = readFileSync(join(brandDir, file), "utf8");
  const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
  expect(paths).toEqual(Object.values(RICKSHAW_PATHS));
});
