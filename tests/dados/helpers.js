// Utilitários dos testes de dados. Importar SOMENTE depois do setup (per-file.js já definiu
// DATABASE_URL para o banco temporário deste arquivo).
import { createHash } from "node:crypto";
import { vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Remove todos os conteúdos e usuários, mantendo o schema (isolamento entre testes). Sessões, contas,
 * aparências, notificações, rodapés e imagens do usuário saem pela cascata do usuário; a verificação
 * não tem chave estrangeira, e as imagens e os links do site (dono nulo) são apagados à parte.
 */
export async function resetDatabase() {
  await prisma.content.deleteMany();
  await prisma.configuration.deleteMany();
  await prisma.verification.deleteMany();
  // As imagens e os links do SITE (dono nulo) não saem pela cascata do usuário.
  await prisma.footerLink.deleteMany();
  await prisma.image.deleteMany();
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
 * Conteúdo de uma imagem fictícia (não é uma imagem decodificável: a camada de dados não decodifica
 * nada; o Core entrega o que o `sharp` reencodou). Os bytes variam com o rótulo e incluem os valores
 * 0x00 e 0xFF, para que a ida e a volta do BLOB sejam conferidas byte a byte.
 * @param {string} [label]
 * @param {{ mime?: string, size?: number }} [options]
 */
export function sampleImage(label = "imagem", { mime = "image/webp", size = 64 } = {}) {
  const seed = [...label].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 251, 7);
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (seed + i * 37) % 256;
  bytes[0] = 0x00;
  bytes[size - 1] = 0xff;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { mime, bytes, width: 256, height: 256, sha256 };
}

/**
 * Faz a PRÓXIMA transação interativa de db.js falhar no meio: a chamada `modelo.metodo` de número
 * `after + 1` dentro da transação lança. Serve a provar atomicidade (tudo ou nada): o que a função
 * gravou antes da falha precisa ter sido desfeito. Quem a usa restaura com `spy.mockRestore()`.
 * Uma função que NÃO usa transação (a mutação "não atômico") não passa por aqui, e o teste, que
 * espera a falha, a detecta.
 * @param {string} model delegado do cliente (ex.: "footerLink", "image", "notification")
 * @param {string} method método do delegado (ex.: "create", "deleteMany")
 * @param {{ after?: number }} [options] quantas chamadas deixa passar antes de falhar
 */
export function failTransactionAt(model, method, { after = 0 } = {}) {
  const original = prisma.$transaction.bind(prisma);
  let calls = 0;
  return vi.spyOn(prisma, "$transaction").mockImplementation(
    /** @type {any} */ (
      (/** @type {any} */ fn, /** @type {any[]} */ ...rest) => {
        if (typeof fn !== "function") return original(fn, ...rest);
        return original(
          (/** @type {any} */ tx) =>
            fn(
              new Proxy(tx, {
                get(target, prop) {
                  const value = target[prop];
                  if (prop !== model) return value;
                  return new Proxy(value, {
                    get(delegate, name) {
                      const member = delegate[name];
                      if (name !== method || typeof member !== "function") return member;
                      return (/** @type {any[]} */ ...args) => {
                        calls += 1;
                        if (calls > after) throw new Error("falha injetada na transação");
                        return member.apply(delegate, args);
                      };
                    },
                  });
                },
              }),
            ),
          ...rest,
        );
      }
    ),
  );
}

/**
 * Conta as imagens e as referências não nulas a elas (avatar, logo e favicon do site e das
 * aparências). A invariante do épico v1: NÃO HÁ IMAGEM ÓRFÃ, isto é, as duas contagens são iguais.
 */
export async function imageAccounting() {
  const [images, avatars, siteLogos, siteFavicons, pageLogos, pageFavicons] = await Promise.all([
    prisma.image.count(),
    prisma.user.count({ where: { avatarImageId: { not: null } } }),
    prisma.configuration.count({ where: { logoImageId: { not: null } } }),
    prisma.configuration.count({ where: { faviconImageId: { not: null } } }),
    prisma.appearance.count({ where: { logoImageId: { not: null } } }),
    prisma.appearance.count({ where: { faviconImageId: { not: null } } }),
  ]);
  return { images, references: avatars + siteLogos + siteFavicons + pageLogos + pageFavicons };
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
 * @typedef {Record<string, { table: string, unique: boolean, columns: string[], partialOn?: string }>} IndexSpecs
 * `partialOn` é a coluna do filtro `WHERE "coluna" IS NULL` do índice parcial; ausente, o índice não
 * pode ser parcial.
 */

/**
 * Os índices do modelo multiusuário (migrações `init` e `multiusuario`).
 * @type {IndexSpecs}
 */
export const REQUIRED_INDEXES = {
  contents_parentId_slug_key: { table: "contents", unique: true, columns: ["parentId", "slug"] },
  contents_root_owner_slug_key: { table: "contents", unique: true, columns: ["authorId", "slug"], partialOn: "parentId" },
  contents_id_authorId_key: { table: "contents", unique: true, columns: ["id", "authorId"] },
  contents_authorId_parentId_order_idx: { table: "contents", unique: false, columns: ["authorId", "parentId", "order"] },
  user_email_key: { table: "user", unique: true, columns: ["email"] },
  user_handle_key: { table: "user", unique: true, columns: ["handle"] },
  session_token_key: { table: "session", unique: true, columns: ["token"] },
  notifications_userId_dedupeKey_key: { table: "notifications", unique: true, columns: ["userId", "dedupeKey"] },
  notifications_userId_readAt_updatedAt_idx: { table: "notifications", unique: false, columns: ["userId", "readAt", "updatedAt"] },
};

/**
 * Os índices acrescentados pelo épico v1 (migração `epico_v1_midia_rodape`; Apêndice A, Tabela de
 * índices do épico v1). O parcial de `footer_links` cobre o rodapé do SITE (dono nulo), que o
 * `@@unique([ownerId, icon])` não cobre: no SQLite, NULL é distinto de NULL.
 * @type {IndexSpecs}
 */
export const REQUIRED_INDEXES_V1 = {
  images_ownerId_idx: { table: "images", unique: false, columns: ["ownerId"] },
  user_avatarImageId_key: { table: "user", unique: true, columns: ["avatarImageId"] },
  footer_links_ownerId_icon_key: { table: "footer_links", unique: true, columns: ["ownerId", "icon"] },
  footer_links_site_icon_key: { table: "footer_links", unique: true, columns: ["icon"], partialOn: "ownerId" },
  footer_links_ownerId_order_idx: { table: "footer_links", unique: false, columns: ["ownerId", "order"] },
};

/** Todos os índices do banco com todas as migrações aplicadas. @type {IndexSpecs} */
export const ALL_REQUIRED_INDEXES = { ...REQUIRED_INDEXES, ...REQUIRED_INDEXES_V1 };

/** Índices do modelo anterior ao M15, que a migração multiusuário substitui. */
export const OBSOLETE_INDEXES = ["contents_root_slug_key", "contents_parentId_order_idx"];

/**
 * Compara os índices de um banco (better-sqlite3) com os esperados: por padrão, os do modelo
 * multiusuário (`REQUIRED_INDEXES`, que é o que um banco só com `init` e `multiusuario` tem); com
 * todas as migrações, `ALL_REQUIRED_INDEXES`.
 * @param {import("better-sqlite3").Database} db
 * @param {IndexSpecs} [specs]
 * @returns {string[]} descrição de cada divergência; vazio = tudo certo
 */
export function indexProblems(db, specs = REQUIRED_INDEXES) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Array<{ name: string, tbl_name: string, sql: string | null }>} */
  const found = /** @type {any} */ (db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'").all());
  for (const [name, spec] of Object.entries(specs)) {
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
    // Parcial = tem filtro WHERE; o esperado deve ser exatamente `WHERE "<partialOn>" IS NULL`.
    const isPartial = /\bWHERE\b/i.test(index.sql ?? "");
    const expectedFilter = spec.partialOn ? new RegExp(`\\bWHERE\\b\\s+"${spec.partialOn}"\\s+IS\\s+NULL`, "i") : null;
    const asExpected = expectedFilter ? expectedFilter.test(index.sql ?? "") : !isPartial;
    if (!asExpected) problems.push(`${name}: parcial=${isPartial}, esperado ${Boolean(spec.partialOn)}`);
  }
  for (const name of OBSOLETE_INDEXES) {
    if (found.some((candidate) => candidate.name === name)) problems.push(`índice obsoleto ainda presente: ${name}`);
  }
  return problems;
}
