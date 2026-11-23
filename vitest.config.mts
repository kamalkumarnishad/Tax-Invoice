import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next keeps JSX for its own compiler, so tests need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
      "server-only": path.join(import.meta.dirname, "tests", "server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 },
});
