import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const defaultDatabaseUrl = "file:./prisma/dev.db";
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: databaseUrl,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
