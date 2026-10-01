import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
