// Tax-Bot ESLint flat config — Phase 0 §0.G.
// Goals (per UPGRADE_PLAN §0.G):
//   1. Next 16 base config (eslint-config-next/core-web-vitals).
//      Note: Next 16 removed `next lint`; we use the ESLint CLI directly.
//   2. Allow Hebrew strings (no quote-style or non-ASCII restrictions).
//   3. no-console under lib/api/** (use the structured logger instead).

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,

  // ---- Project-wide rule tweaks -------------------------------------------
  {
    rules: {
      // Hebrew + RTL: no rule against non-ASCII identifiers/strings is enabled
      // by eslint-config-next; we keep this comment as the explicit allow-list.

      // Phase 0 ergonomic relaxations — to be tightened in Phase 3.
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "warn",
      // React 19 compiler-aware rules that fire on legacy patterns this
      // codebase uses widely (setState-in-effect for hydration; ref-current
      // reads during render in stable-closure setters; impure-function calls
      // in chart helpers). Tracked for Phase 1 cleanup; demoted so Phase 0
      // CI ships.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },

  // ---- API layer: no console.* (must use the structured logger) -----------
  {
    files: ["lib/api/**/*.ts", "lib/api/**/*.tsx"],
    rules: {
      "no-console": "error",
    },
  },

  // ---- Tests + scripts: relax everything ----------------------------------
  {
    files: [
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "scripts/**",
      "vitest.setup.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },

  // ---- Ignores ------------------------------------------------------------
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "templates/maps/**",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo",
    "public/**",
  ]),
]);

export default eslintConfig;
