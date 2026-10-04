import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código gerado pelo Prisma (não versionado)
    "src/generated/**",
    // Ferramentas do Arquiteto (doc/revisao: ensaio HTTP e mutações), não fazem parte do produto
    "doc/**",
  ]),
]);

export default eslintConfig;
