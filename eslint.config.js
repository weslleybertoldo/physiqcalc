import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // hml-13: dist = build; .next = sobras de um build do Next versionadas por engano em 31/03/2026 (o app é Vite)
  { ignores: ["dist", ".next"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // hml-13: as funções antigas do Banco do Treino (Deno) têm 272 `any` herdados; as do principal seguem com a regra inteira
  {
    files: ["supabase/functions/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
