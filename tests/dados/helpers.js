// Utilitários dos testes de dados. Importar SOMENTE depois do setup (per-file.js já definiu
// DATABASE_URL para o banco temporário deste arquivo).
import { prisma } from "@/lib/db";

/** Remove todos os conteúdos e usuários, mantendo o schema (isolamento entre testes). */
export async function resetDatabase() {
  await prisma.content.deleteMany();
  await prisma.configuration.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Cria um usuário fictício (sem dados reais).
 * @param {string} [name]
 */
export function createUser(name = "autor") {
  return prisma.user.create({
    data: { name, email: `${name}-${Math.random().toString(36).slice(2)}@exemplo.test`, emailVerified: true },
  });
}

/**
 * Insere um conteúdo direto pelo Prisma, **sem** passar pelas regras de db.js; usado para
 * testar as constraints do próprio banco.
 * @param {Record<string, unknown>} data
 */
export function rawContent(data) {
  return prisma.content.create({ data: /** @type {any} */ ({ type: "COLLECTION", ...data }) });
}
