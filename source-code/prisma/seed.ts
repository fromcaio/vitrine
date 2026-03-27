import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";

const defaultDatabaseUrl = "file:./prisma/dev.db";
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: databaseUrl,
  }),
});

async function main() {
  await prisma.configuration.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      siteName: "Vitrine CMS",
      primaryColor: "#3b82f6",
      secondaryColor: "#1e293b",
    },
  });
  console.log("✅ Seed executado com sucesso!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
