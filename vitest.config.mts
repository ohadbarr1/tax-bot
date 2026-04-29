import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      exclude: ["lib/__tests__/**", "lib/initialState.ts"],
      // Phase 0 floor — current coverage with the wider include scope is
      // ~47/36/36. Phase 1 §1.J ramp target: lines 70 / functions 70 /
      // branches 60 (after multi-doc parsers + scenario-test expansion).
      // Phase 3 target: 80 / 80 / 70 (the original bar with full breadth).
      thresholds: {
        lines: 45,
        functions: 35,
        branches: 35,
      },
    },
  },
});
