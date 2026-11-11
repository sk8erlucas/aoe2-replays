import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Names and chat come from replays and external APIs: always render them as text.
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: "Render untrusted text with textContent or JSX, never as HTML.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "Render untrusted text with textContent or JSX, never as HTML.",
        },
      ],
    },
  },
  {
    // eslint-plugin-react-hooks 7 adds rules for the React Compiler, which this app
    // doesn't use. The viewer reads and writes refs during render on purpose (the
    // animation loop lives outside React). Revisit when adopting the compiler:
    // tasks/12-next-16.md. rules-of-hooks and exhaustive-deps stay on, as before.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
]);
