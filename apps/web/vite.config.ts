import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Router tests load code-split routes on first render. Alone that takes well under 5s, but
    // `bun run check` runs every workspace's suites at once, and under that load the default 5s
    // timed out spuriously. The assertions are unchanged; only the time allowed grows.
    testTimeout: 20_000,
  },
});
