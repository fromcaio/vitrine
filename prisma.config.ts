// Configuração da CLI do Prisma 7 (nome padrão: prisma.config.ts).
// Requer: prisma e dotenv em dependencies (o `prisma migrate deploy` roda na imagem de produção).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7: o seed é declarado aqui (não mais no package.json) e roda só por `prisma db seed`.
    seed: "tsx prisma/seed.js",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
