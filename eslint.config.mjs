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
  // O `<a href="/login">` do aviso de sessão expirada, em `PasswordChangeForm` (UI), é uma navegação
  // COMPLETA de propósito (descarta o estado do cliente depois de um 401). A regra só passou a acusá-lo
  // com a rota dinâmica `/[handle]` (A-014 3b), que também casa com `/login`. Exceção só deste arquivo,
  // até a UI trocar por `<Link>`.
  {
    files: ["src/components/admin/PasswordChangeForm.js"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
]);

export default eslintConfig;
