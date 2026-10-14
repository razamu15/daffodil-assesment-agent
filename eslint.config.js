import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/cdk.out/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // House rule: keep files short (aim ≤ 400 lines).
      "max-lines": ["error", { max: 450, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Shared code is imported through a package's public entry, never its internals.
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@helper-assistant/*/src/*"], message: "Import from the package entry point." }] },
      ],
    },
  },
);
