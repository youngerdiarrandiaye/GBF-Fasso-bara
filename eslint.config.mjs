import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Edge Functions Deno (dev-backend-edge) : runtime et conventions de
    // lint distincts du projet Next.js, hors périmètre de cet agent.
    "supabase/functions/**",
    // Généré automatiquement par `supabase start` (bootstrap du runtime Edge
    // Functions local) — jamais du code source du projet, jamais commité.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
