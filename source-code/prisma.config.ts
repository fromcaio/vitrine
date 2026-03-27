// prisma.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Trocamos ts-node por tsx, que é "plug-and-play" para ESM
    seed: "npx tsx ./prisma/seed.ts", 
  },
  datasource: {
    url: process.env.DATABASE_URL || "file:./prisma/dev.db",
  },
});