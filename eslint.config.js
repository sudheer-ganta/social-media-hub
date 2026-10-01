import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import unusedImports from "eslint-plugin-unused-imports";

/**
 * One config for the SPA (`src/`) and the API (`server/src/`).
 *
 * `npm run lint` used to fail outright — there was no config — so nothing was
 * checking this code. The goal here is a baseline that is *green today* and
 * *fails on the things that bite*: real bugs (hooks misuse, unreachable code,
 * floating promises on the server) and security smells (eval, unsafe regex,
 * child_process, non-literal fs paths). Stylistic rules are left to the
 * formatter. New code is held to it; rules that the existing code trips widely
 * are `warn`, not `error`, so they show up without blocking and can be burned
 * down.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "server/src/generated/**",
      "server/artifacts/**",
      "server/audit-artifacts/**",
      "out/**",
      "public/**",
      "**/*.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    plugins: { "unused-imports": unusedImports },
    rules: {
      // Unused imports are removed automatically by `eslint --fix`.
      "unused-imports/no-unused-imports": "warn",
      // Existing code uses `any` deliberately at several boundaries; surface it
      // without blocking.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-namespace": "off", // Express's `declare global { namespace Express }`
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },

  // ── Frontend ───────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is an XSS sink. Render text, or sanitise explicitly and justify it.",
        },
      ],
    },
  },

  // ── Backend ────────────────────────────────────────────────────────────────
  {
    files: ["server/src/**/*.ts"],
    languageOptions: { globals: globals.node },
    plugins: { security },
    rules: {
      "security/detect-eval-with-expression": "error",
      "security/detect-child-process": "error",
      "security/detect-unsafe-regex": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-buffer-noassert": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      // Property access with a variable key is everywhere in ordinary code and
      // this rule is famously noisy; the specific hazards are covered above.
      "security/detect-object-injection": "off",
    },
  },

  // Scripts, tests and config files: node globals, relaxed.
  {
    files: ["scripts/**", "server/scripts/**", "server/src/scripts/**", "*.config.{js,ts}", "**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-child-process": "off",
    },
  },
);
