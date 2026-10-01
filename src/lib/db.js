// Único ponto de criação do PrismaClient na aplicação (DESENVOLVEDORES.md §6).
// O seed (prisma/seed.js) é a única exceção, pois roda fora do Next.js.
// Lógica HTTP não entra aqui; as funções nomeadas de acesso a dados serão exportadas deste módulo.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cria o cliente com o driver adapter do better-sqlite3 (Prisma 7).
 * Atenção: um caminho relativo em DATABASE_URL é resolvido a partir do diretório de trabalho
 * do processo; em produção use caminho absoluto (ex.: file:/data/vitrine.db).
 * @returns {PrismaClient}
 */
function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não definida (veja .env.example).");
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

// Em desenvolvimento o Hot Module Replacement reavalia este módulo a cada edição; guardar o
// cliente em globalThis evita abrir uma nova conexão a cada recarga (padrão recomendado pelo Next.js).
const globalForPrisma = /** @type {{ prisma?: PrismaClient }} */ (globalThis);

/** Instância única do cliente do Prisma por processo. */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
