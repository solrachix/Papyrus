import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["examples/mobile/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: [
      "packages/**/*.ts",
      "packages/**/*.tsx",
      "examples/web/**/*.ts",
      "examples/web/**/*.tsx",
      "examples/mobile/**/*.ts",
      "examples/mobile/**/*.tsx",
    ],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
  },
];
