// Utilitários dos testes de dados. Importar SOMENTE depois do setup (per-file.js já definiu
// DATABASE_URL para o banco temporário deste arquivo).
import { prisma } from "@/lib/db";

/**
 * Remove todos os conteúdos e usuários, mantendo o schema (isolamento entre testes). Sessões, contas,
 * aparências e notificações saem pela cascata do usuário; a verificação não tem chave estrangeira.
 */
export async function resetDatabase() {
  await prisma.content.deleteMany();
  await prisma.configuration.deleteMany();
  await prisma.verification.deleteMany();
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

/**
 * Índices e restrições que o banco migrado precisa ter, por nome (A-013; Apêndice A, Tabela de
 * índices do modelo-alvo). O índice parcial da raiz por dono é SQL escrito à mão que o Prisma não
 * enxerga e que uma migração que redefine "contents" descarta sem avisar (risco R16): este é o teste
 * que o detecta.
 * @type {Record<string, { table: string, unique: boolean, columns: string[], partial?: boolean }>}
 */
export const REQUIRED_INDEXES = {
  contents_parentId_slug_key: { table: "contents", unique: true, columns: ["parentId", "slug"] },
  contents_root_owner_slug_key: { table: "contents", unique: true, columns: ["authorId", "slug"], partial: true },
  contents_id_authorId_key: { table: "contents", unique: true, columns: ["id", "authorId"] },
  contents_authorId_parentId_order_idx: { table: "contents", unique: false, columns: ["authorId", "parentId", "order"] },
  user_email_key: { table: "user", unique: true, columns: ["email"] },
  user_handle_key: { table: "user", unique: true, columns: ["handle"] },
  session_token_key: { table: "session", unique: true, columns: ["token"] },
  notifications_userId_dedupeKey_key: { table: "notifications", unique: true, columns: ["userId", "dedupeKey"] },
  notifications_userId_readAt_updatedAt_idx: { table: "notifications", unique: false, columns: ["userId", "readAt", "updatedAt"] },
};

/** Índices do modelo anterior ao M15, que a migração multiusuário substitui. */
export const OBSOLETE_INDEXES = ["contents_root_slug_key", "contents_parentId_order_idx"];

/**
 * Compara os índices de um banco (better-sqlite3) com `REQUIRED_INDEXES`.
 * @param {import("better-sqlite3").Database} db
 * @returns {string[]} descrição de cada divergência; vazio = tudo certo
 */
export function indexProblems(db) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Array<{ name: string, tbl_name: string, sql: string | null }>} */
  const found = /** @type {any} */ (db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'").all());
  for (const [name, spec] of Object.entries(REQUIRED_INDEXES)) {
    const index = found.find((candidate) => candidate.name === name);
    if (!index) {
      problems.push(`índice ausente: ${name}`);
      continue;
    }
    if (index.tbl_name !== spec.table) problems.push(`${name}: tabela ${index.tbl_name}, esperada ${spec.table}`);
    const listed = /** @type {any[]} */ (db.prepare(`PRAGMA index_list("${spec.table}")`).all()).find((i) => i.name === name);
    if (Boolean(listed?.unique) !== spec.unique) problems.push(`${name}: unique=${Boolean(listed?.unique)}, esperado ${spec.unique}`);
    const columns = /** @type {any[]} */ (db.prepare(`PRAGMA index_info("${name}")`).all()).map((column) => column.name);
    if (columns.join(",") !== spec.columns.join(",")) problems.push(`${name}: colunas ${columns.join(",")}, esperadas ${spec.columns.join(",")}`);
    const isPartial = /\bWHERE\b\s+"parentId"\s+IS\s+NULL/i.test(index.sql ?? "");
    if (Boolean(spec.partial) !== isPartial) problems.push(`${name}: parcial=${isPartial}, esperado ${Boolean(spec.partial)}`);
  }
  for (const name of OBSOLETE_INDEXES) {
    if (found.some((candidate) => candidate.name === name)) problems.push(`índice obsoleto ainda presente: ${name}`);
  }
  return problems;
}
