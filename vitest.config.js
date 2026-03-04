import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.{js,mjs,cjs,ts,mts,cts}"],
    exclude: ["node_modules", "dist", "src/tests/smoke.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{js,mjs}"],
      exclude: [
        "src/tests/**",
        "src/main.js",
      ],
    },
  },
});
