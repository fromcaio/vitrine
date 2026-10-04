// Seed idempotente do Vitrine (RF23, RN08). Executar com: npx prisma db seed
//
// Roda pela CLI, fora do Next.js, e por isso instancia o próprio cliente: é a única exceção
// à regra de que src/lib/db.js é o único ponto de criação do PrismaClient.
// O cliente gerado é TypeScript (src/generated/prisma/*.ts); o tsx o executa (ver prisma.config.ts).
//
// O administrador inicial (RF22, D-03) ainda não é criado aqui: o mecanismo é do Core.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

/** Identificador fixo do registro único de Configuration (mesmo @default do schema). */
const CONFIGURATION_ID = "default";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // update vazio: reexecutar o seed nunca sobrescreve personalizações do administrador.
  // Os demais campos (siteName "Vitrine", as duas paletas padrão da ADR-031, directoryEnabled e os
  // links nulos) vêm dos @default do schema. A Appearance de cada usuário não é criada aqui: nasce
  // sob demanda, e sem linha valem os mesmos padrões (RN08).
  const configuration = await prisma.configuration.upsert({
    where: { id: CONFIGURATION_ID },
    update: {},
    create: { id: CONFIGURATION_ID },
  });
  console.log(`Configuração padrão garantida: "${configuration.siteName}" (${configuration.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
