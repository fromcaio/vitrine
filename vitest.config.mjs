import path from "node:path";
import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

/**
 * O projeto escreve JSX em arquivos .js (ADR-008), que o Vite só transforma em .jsx: sem este
 * plugin, importar um arquivo de rota ou um componente em um teste falha na análise dos imports.
 * Vale só para os .js de src/ e de tests/; o cliente gerado do Prisma (.ts) não é afetado.
 * @type {import("vite").Plugin}
 */
const jsxInJsFiles = {
  name: "vitrine:jsx-in-js",
  enforce: "pre",
  async transform(code, id) {
    const file = id.split("?")[0];
    if (!/[\\/](src|tests)[\\/].*\.js$/.test(file) || file.includes("node_modules")) return null;
    const result = await transformWithOxc(code, file, { lang: "jsx", jsx: { runtime: "automatic" } });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  plugins: [jsxInJsFiles],
  resolve: {
    // Mesmo alias do jsconfig.json
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // Cria um SQLite temporário com as migrações reais; os testes nunca usam o dev.db.
    globalSetup: ["./tests/setup/global-setup.js"],
    setupFiles: ["./tests/setup/per-file.js"],
    // O CLI do Prisma (migrate deploy, db seed) leva alguns segundos
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
