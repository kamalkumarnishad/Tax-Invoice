import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
      "server-only": path.join(import.meta.dirname, "tests", "server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 },
});
