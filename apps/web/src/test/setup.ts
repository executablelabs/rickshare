import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// `bun run check` runs every workspace's suites at once. Under that load a page can take more
// than Testing Library's default second to settle, which failed findBy queries spuriously.
// Assertions are unchanged; only the time allowed to find an element grows.
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);
