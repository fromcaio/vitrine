// Único ponto de criação do PrismaClient na aplicação (DESENVOLVEDORES.md §6).
// O seed (prisma/seed.js) é a única exceção, pois roda fora do Next.js.
// Aqui ficam a instância do cliente e as funções nomeadas de acesso a dados; lógica HTTP, validação
// de formato (slug, URL, cor) e revalidação de cache são do Core e não entram neste módulo.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { buildTree, resolvePath, wouldCreateCycle } from "@/lib/content-tree";

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

// --------------------------------------------------------
// Erros tratáveis
// --------------------------------------------------------

/**
 * Códigos de erro de regra de negócio, para o Core traduzir em respostas HTTP (Cap. 5 §5.10):
 * - `NOT_FOUND`: conteúdo inexistente (404)
 * - `SLUG_CONFLICT`: slug já usado entre irmãos, inclusive na raiz (RN03; 409)
 * - `PARENT_NOT_FOUND`: pai inexistente (422)
 * - `PARENT_NOT_COLLECTION`: apenas COLLECTION pode ter filhos (RN02; 422)
 * - `CYCLE`: o destino é o próprio nó ou um descendente (RN06; 422)
 * - `TYPE_HAS_CHILDREN`: uma COLLECTION com filhos não pode virar DOCUMENT (RN02; 422)
 * - `AUTHOR_NOT_FOUND`: autor inexistente (422)
 * - `INVALID_INPUT`: valor fora do domínio (tipo, estado, ordem negativa, lote inválido) (422)
 * @typedef {"NOT_FOUND" | "SLUG_CONFLICT" | "PARENT_NOT_FOUND" | "PARENT_NOT_COLLECTION" | "CYCLE" | "TYPE_HAS_CHILDREN" | "AUTHOR_NOT_FOUND" | "INVALID_INPUT"} DataErrorCode
 */

/** Erro de regra de negócio levantado pelas funções deste módulo. */
export class DataError extends Error {
  /**
   * @param {DataErrorCode} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Converte erros conhecidos do Prisma em DataError; o restante é repassado sem alteração.
 * @param {unknown} error
 * @returns {unknown}
 */
function translateError(error) {
  if (error instanceof DataError) return error;
  const code = /** @type {{ code?: string }} */ (error)?.code;
  if (code === "P2002") {
    return new DataError("SLUG_CONFLICT", "Já existe um conteúdo com este slug no mesmo nível.");
  }
  if (code === "P2003") {
    return new DataError("AUTHOR_NOT_FOUND", "Autor ou pai inexistente.");
  }
  if (code === "P2025") {
    return new DataError("NOT_FOUND", "Conteúdo não encontrado.");
  }
  return error;
}

/**
 * Executa `fn` repassando erros do Prisma já traduzidos.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function guarded(fn) {
  try {
    return await fn();
  } catch (error) {
    throw translateError(error);
  }
}

// --------------------------------------------------------
// Conteúdo
// --------------------------------------------------------

/** Valores lógicos de `Content.type` (RN02); o SQLite não os impõe, a camada de dados sim. */
export const CONTENT_TYPES = /** @type {const} */ (["DOCUMENT", "COLLECTION"]);
/** Valores de `Content.status` (RN16). */
export const CONTENT_STATUSES = /** @type {const} */ (["DRAFT", "PUBLISHED"]);

/** Colunas da árvore: tudo, menos o corpo (Cap. 5 §5.5.3). */
const TREE_SELECT = {
  id: true,
  title: true,
  slug: true,
  type: true,
  status: true,
  order: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
};

/** @param {unknown} value @param {string} field */
function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DataError("INVALID_INPUT", `O campo "${field}" é obrigatório.`, { field });
  }
}

/** @param {unknown} type */
function assertType(type) {
  if (!CONTENT_TYPES.includes(/** @type {any} */ (type))) {
    throw new DataError("INVALID_INPUT", "O tipo deve ser DOCUMENT ou COLLECTION.", { field: "type" });
  }
}

/** @param {unknown} status */
function assertStatus(status) {
  if (!CONTENT_STATUSES.includes(/** @type {any} */ (status))) {
    throw new DataError("INVALID_INPUT", "O estado deve ser DRAFT ou PUBLISHED.", { field: "status" });
  }
}

/** RN05: a ordem é um inteiro não negativo. @param {unknown} order */
function assertOrder(order) {
  if (!Number.isInteger(order) || /** @type {number} */ (order) < 0) {
    throw new DataError("INVALID_INPUT", "A ordem deve ser um inteiro não negativo.", { field: "order" });
  }
}

/**
 * Cliente de consulta ou cliente de transação interativa.
 * @typedef {Pick<PrismaClient, "content" | "configuration">} Db
 */

/**
 * RN02: o pai deve existir e ser COLLECTION.
 * @param {Db} db
 * @param {string} parentId
 */
async function assertParentIsCollection(db, parentId) {
  const parent = await db.content.findUnique({ where: { id: parentId }, select: { type: true } });
  if (!parent) {
    throw new DataError("PARENT_NOT_FOUND", "O conteúdo pai não existe.", { parentId });
  }
  if (parent.type !== "COLLECTION") {
    throw new DataError("PARENT_NOT_COLLECTION", "Apenas uma COLLECTION pode ter filhos.", { parentId });
  }
}

/**
 * Próxima ordem livre entre os filhos de `parentId` (RN05): máximo atual + 1, ou 0 se vazio.
 * @param {Db} db
 * @param {string | null} parentId
 * @returns {Promise<number>}
 */
async function nextOrder(db, parentId) {
  const { _max } = await db.content.aggregate({ where: { parentId }, _max: { order: true } });
  return (_max.order ?? -1) + 1;
}

/**
 * Árvore de conteúdos, sem o corpo (uma única consulta).
 * - `onlyPublished: true` (leitura pública, RN15): remove todo nó DRAFT e a sua subárvore.
 * - `onlyPublished: false` (painel): devolve tudo, com o `status` de cada nó (RF26).
 * @param {{ onlyPublished?: boolean }} [options]
 * @returns {Promise<import("@/lib/content-tree").ContentNode[]>}
 */
export async function getContentTree({ onlyPublished = false } = {}) {
  // Filtrar no banco é equivalente à poda: um publicado cujo ancestral é rascunho fica órfão
  // e buildTree descarta órfãos.
  const rows = await prisma.content.findMany({
    where: onlyPublished ? { status: "PUBLISHED" } : undefined,
    select: TREE_SELECT,
  });
  return buildTree(/** @type {any} */ (rows), { onlyPublished });
}

/**
 * Conteúdo (com o corpo) a partir da cadeia de slugs da raiz ao nó (RN04).
 * Com `onlyPublished: true`, devolve `null` se o nó ou qualquer ancestral não estiver
 * PUBLISHED (RN15; a página responde 404).
 * @param {string[]} slugs
 * @param {{ onlyPublished?: boolean }} [options]
 * @returns {Promise<import("@/generated/prisma/client").Content | null>}
 */
export async function getContentByPath(slugs, { onlyPublished = false } = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.some((s) => typeof s !== "string")) {
    return null;
  }
  const node = resolvePath(await getContentTree({ onlyPublished }), slugs);
  if (!node) return null;
  return prisma.content.findUnique({ where: { id: node.id } });
}

/**
 * Detalhe de um conteúdo, com o corpo e o estado, em qualquer estado (uso do painel).
 * @param {string} id
 * @returns {Promise<import("@/generated/prisma/client").Content | null>}
 */
export async function getContentById(id) {
  if (typeof id !== "string" || id === "") return null;
  return prisma.content.findUnique({ where: { id } });
}

/**
 * Cria um conteúdo. Garante RN02 (tipo válido e pai COLLECTION), RN03 (unicidade do slug entre
 * irmãos, inclusive na raiz, vira `SLUG_CONFLICT`) e RN05 (ordem não negativa; se omitida,
 * entra no fim do nível). O estado padrão é PUBLISHED (RN16). O formato do slug e os slugs
 * reservados são validados pelo Core antes de chamar esta função.
 * @param {{
 *   title: string, slug: string, type: "DOCUMENT" | "COLLECTION", authorId: string,
 *   parentId?: string | null, body?: string | null, order?: number,
 *   status?: "DRAFT" | "PUBLISHED"
 * }} input
 * @returns {Promise<import("@/generated/prisma/client").Content>}
 * @throws {DataError}
 */
export async function createContent(input) {
  const { title, slug, type, authorId, parentId = null, body = null, status = "PUBLISHED" } = input;
  assertNonEmptyString(title, "title");
  assertNonEmptyString(slug, "slug");
  assertNonEmptyString(authorId, "authorId");
  assertType(type);
  assertStatus(status);
  if (input.order !== undefined) assertOrder(input.order);

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      if (parentId !== null) await assertParentIsCollection(tx, parentId);
      const order = input.order ?? (await nextOrder(tx, parentId));
      return tx.content.create({
        data: { title, slug, type, status, body, order, parentId, authorId },
      });
    }),
  );
}

/** Campos que `updateContent` aceita; `authorId` e datas nunca mudam (RN13). */
const UPDATABLE_FIELDS = ["title", "slug", "body", "type", "status", "parentId", "order"];

/**
 * Atualização parcial (inclusive `status` e mudança de pai). Garante RN02, RN03, RN05 e RN06
 * (mover não cria ciclo). Ao mudar de pai sem informar `order`, o nó vai para o fim do novo nível.
 * @param {string} id
 * @param {{
 *   title?: string, slug?: string, body?: string | null, type?: "DOCUMENT" | "COLLECTION",
 *   status?: "DRAFT" | "PUBLISHED", parentId?: string | null, order?: number
 * }} patch
 * @returns {Promise<import("@/generated/prisma/client").Content>}
 * @throws {DataError}
 */
export async function updateContent(id, patch) {
  /** @type {Record<string, any>} */
  const data = {};
  for (const field of UPDATABLE_FIELDS) {
    if (/** @type {any} */ (patch)?.[field] !== undefined) data[field] = /** @type {any} */ (patch)[field];
  }
  if ("title" in data) assertNonEmptyString(data.title, "title");
  if ("slug" in data) assertNonEmptyString(data.slug, "slug");
  if ("type" in data) assertType(data.type);
  if ("status" in data) assertStatus(data.status);
  if ("order" in data) assertOrder(data.order);

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const current = await tx.content.findUnique({
        where: { id },
        select: { id: true, type: true, parentId: true },
      });
      if (!current) throw new DataError("NOT_FOUND", "Conteúdo não encontrado.", { id });

      if (data.type === "DOCUMENT" && current.type === "COLLECTION") {
        const children = await tx.content.count({ where: { parentId: id } });
        if (children > 0) {
          throw new DataError("TYPE_HAS_CHILDREN", "Uma COLLECTION com filhos não pode virar DOCUMENT.", { id });
        }
      }

      if ("parentId" in data && data.parentId !== current.parentId) {
        if (data.parentId !== null) {
          await assertParentIsCollection(tx, data.parentId);
          const rows = await tx.content.findMany({ select: { id: true, parentId: true } });
          const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
          if (wouldCreateCycle(parentOf, id, data.parentId)) {
            throw new DataError("CYCLE", "O destino não pode ser o próprio conteúdo nem um descendente.", {
              id,
              parentId: data.parentId,
            });
          }
        }
        if (!("order" in data)) data.order = await nextOrder(tx, data.parentId);
      }

      return tx.content.update({ where: { id }, data });
    }),
  );
}

/**
 * Exclui o conteúdo e todos os seus descendentes (RN07), por exclusão em cascata no banco.
 * A confirmação explícita é responsabilidade do painel.
 * @param {string} id
 * @returns {Promise<{ id: string }>}
 * @throws {DataError} `NOT_FOUND`
 */
export async function deleteContent(id) {
  return guarded(async () => {
    await prisma.content.delete({ where: { id } });
    return { id };
  });
}

/**
 * Reordena e/ou move conteúdos em **uma transação** (tudo ou nada; RN05, RN06). Os itens são
 * aplicados em sequência e cada um é validado contra o estado resultante dos anteriores:
 * pai existente e COLLECTION (RN02), sem ciclo (RN06), ordem inteira não negativa (RN05) e slug
 * único no destino (RN03). `parentId` omitido mantém o pai atual.
 * @param {Array<{ id: string, parentId?: string | null, order: number }>} items
 * @returns {Promise<Array<{ id: string, parentId: string | null, order: number }>>}
 * @throws {DataError}
 */
export async function reorderContents(items) {
  if (!Array.isArray(items)) {
    throw new DataError("INVALID_INPUT", "O lote deve ser uma lista.", { field: "items" });
  }
  const ids = items.map((item) => item?.id);
  if (new Set(ids).size !== ids.length) {
    throw new DataError("INVALID_INPUT", "O lote contém ids repetidos.", { field: "items" });
  }
  for (const item of items) {
    assertNonEmptyString(item?.id, "id");
    assertOrder(item.order);
  }
  if (items.length === 0) return [];

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.content.findMany({ select: { id: true, type: true, parentId: true } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));

      /** @type {Array<{ id: string, parentId: string | null, order: number }>} */
      const result = [];
      for (const item of items) {
        const node = byId.get(item.id);
        if (!node) throw new DataError("NOT_FOUND", "Conteúdo não encontrado.", { id: item.id });

        const parentId = item.parentId === undefined ? node.parentId : item.parentId;
        if (parentId !== null) {
          const parent = byId.get(parentId);
          if (!parent) throw new DataError("PARENT_NOT_FOUND", "O conteúdo pai não existe.", { parentId });
          if (parent.type !== "COLLECTION") {
            throw new DataError("PARENT_NOT_COLLECTION", "Apenas uma COLLECTION pode ter filhos.", { parentId });
          }
          if (wouldCreateCycle(parentOf, item.id, parentId)) {
            throw new DataError("CYCLE", "O destino não pode ser o próprio conteúdo nem um descendente.", {
              id: item.id,
              parentId,
            });
          }
        }

        await tx.content.update({ where: { id: item.id }, data: { parentId, order: item.order } });
        parentOf.set(item.id, parentId);
        result.push({ id: item.id, parentId, order: item.order });
      }
      return result;
    }),
  );
}

// --------------------------------------------------------
// Configuração (registro único, RN08)
// --------------------------------------------------------

/** Identificador fixo do único registro de Configuration (mesmo @default do schema). */
export const CONFIGURATION_ID = "default";

/** Campos opcionais: cadeia vazia equivale a ausente (RN17). */
const NULLABLE_CONFIGURATION_FIELDS = [
  "siteDescription",
  "logoUrl",
  "faviconUrl",
  "discordUrl",
  "githubUrl",
  "youtubeUrl",
  "instagramUrl",
  "linkedinUrl",
  "twitchUrl",
];

/** Campos obrigatórios (têm valor padrão no schema). */
const REQUIRED_CONFIGURATION_FIELDS = ["siteName", "primaryColor", "secondaryColor", "accentColor"];

/**
 * Configuração vigente. Se o registro não existir, é criado com os valores padrão (RN08).
 * @returns {Promise<import("@/generated/prisma/client").Configuration>}
 */
export async function getConfiguration() {
  return prisma.configuration.upsert({
    where: { id: CONFIGURATION_ID },
    update: {},
    create: { id: CONFIGURATION_ID },
  });
}

/**
 * Atualiza a configuração (*upsert* no registro único). Aceita identidade, cores e os seis links
 * sociais; campos ausentes não mudam e chaves desconhecidas são ignoradas. Nos campos opcionais,
 * cadeia vazia vira `null` (RN17). O formato de URL e de cor é validado pelo Core.
 * @param {Partial<{
 *   siteName: string, siteDescription: string | null, primaryColor: string, secondaryColor: string,
 *   accentColor: string, logoUrl: string | null, faviconUrl: string | null,
 *   discordUrl: string | null, githubUrl: string | null, youtubeUrl: string | null,
 *   instagramUrl: string | null, linkedinUrl: string | null, twitchUrl: string | null
 * }>} patch
 * @returns {Promise<import("@/generated/prisma/client").Configuration>}
 * @throws {DataError} `INVALID_INPUT` para campo obrigatório vazio
 */
export async function updateConfiguration(patch) {
  /** @type {Record<string, string | null>} */
  const data = {};
  for (const field of REQUIRED_CONFIGURATION_FIELDS) {
    const value = /** @type {any} */ (patch)?.[field];
    if (value === undefined) continue;
    assertNonEmptyString(value, field);
    data[field] = value;
  }
  for (const field of NULLABLE_CONFIGURATION_FIELDS) {
    const value = /** @type {any} */ (patch)?.[field];
    if (value === undefined) continue;
    data[field] = value === null || String(value).trim() === "" ? null : String(value);
  }
  return prisma.configuration.upsert({
    where: { id: CONFIGURATION_ID },
    update: data,
    create: { id: CONFIGURATION_ID, ...data },
  });
}
