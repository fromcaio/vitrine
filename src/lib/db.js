// Único ponto de criação do PrismaClient na aplicação (DESENVOLVEDORES.md §6).
// O seed (prisma/seed.js) é a única exceção, pois roda fora do Next.js.
// Aqui ficam a instância do cliente e as funções nomeadas de acesso a dados; lógica HTTP, validação
// de formato (slug, handle, URL, cor) e revalidação de cache são do Core e não entram neste módulo.
//
// Com vários usuários (M15; ADR-023 a ADR-028), toda árvore tem um só dono (`authorId`), imposto pelo
// banco, e as funções de conteúdo trabalham "por dono". Quem decide QUEM pode fazer o quê é o Core
// (autorização, RN19): este módulo só recebe o dono como argumento e garante as invariantes de dados.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { buildTree, collectPublicPaths, resolvePath, wouldCreateCycle } from "@/lib/content-tree";
import { bodyBytes, resolveLimits } from "@/lib/limits";

// --------------------------------------------------------
// Conexão
// --------------------------------------------------------

/** Tempo de espera por um bloqueio de escrita de outro processo, em ms (`busy_timeout`; ADR-028). */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Modo do banco (ADR-002, ADR-028): WAL com `synchronous=NORMAL` (em queda de energia podem se
 * perder as últimas escritas confirmadas, sem corromper o banco) e chaves estrangeiras ligadas
 * (o dono único por árvore e o `Restrict` do autor dependem delas). `journal_mode` fica gravado no
 * arquivo; as demais são por conexão, por isso são reaplicadas a cada conexão aberta.
 */
const CONNECTION_PRAGMAS = "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;";

/** Adaptador do better-sqlite3 que aplica o modo do banco ao abrir cada conexão. */
class VitrineSqliteAdapter extends PrismaBetterSqlite3 {
  async connect() {
    const adapter = await super.connect();
    await adapter.executeScript(CONNECTION_PRAGMAS);
    return adapter;
  }
}

/**
 * Cria o cliente com o driver adapter do better-sqlite3 (Prisma 7).
 * Atenção: um caminho relativo em DATABASE_URL é resolvido a partir do diretório de trabalho
 * do processo; em produção use caminho absoluto (ex.: file:/data/vitrine.db). O WAL exige volume
 * local (nunca de rede) e cria os arquivos `-wal` e `-shm` ao lado do banco.
 * @returns {PrismaClient}
 */
function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não definida (veja .env.example).");
  }
  return new PrismaClient({ adapter: new VitrineSqliteAdapter({ url, timeout: BUSY_TIMEOUT_MS }) });
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
 * - `NOT_FOUND`: conteúdo ou usuário inexistente (404)
 * - `SLUG_CONFLICT`: slug já usado entre irmãos, ou na raiz do mesmo dono (RN03; 409)
 * - `PARENT_NOT_FOUND`: pai inexistente (422)
 * - `PARENT_NOT_COLLECTION`: apenas COLLECTION pode ter filhos (RN02; 422)
 * - `OWNER_MISMATCH`: o pai (ou o destino) pertence a outro dono (RN13; 422 `INVALID_PARENT`)
 * - `CYCLE`: o destino é o próprio nó ou um descendente (RN06; 422)
 * - `TYPE_HAS_CHILDREN`: uma COLLECTION com filhos não pode virar DOCUMENT (RN02; 422)
 * - `AUTHOR_NOT_FOUND`: autor, ou usuário de destino, inexistente (422)
 * - `INVALID_INPUT`: valor fora do domínio (tipo, estado, ordem negativa, lote inválido) (422)
 * - `QUOTA_EXCEEDED`: contagem de conteúdos ou bytes do corpo acima da cota do dono (RN25; 422)
 * - `VERSION_CONFLICT`: o conteúdo mudou depois da versão em que o autor se baseou (RN18; 409);
 *   `details.currentVersion` traz o `updatedAt` atual, em ISO 8601
 * - `USER_HAS_CONTENT`: o usuário tem conteúdo e a exclusão não disse o que fazer com ele (RN24; 409)
 * - `USER_CONFLICT`: e-mail ou handle já usado (409); `details.field` é `email` ou `handle`
 * - `LAST_ADMIN`: removeria, rebaixaria ou suspenderia o último administrador ativo (RN22; 409)
 * - `BUSY`: o banco está bloqueado por outra escrita (`P1008`/`SQLITE_BUSY`); repetir é seguro (503)
 * @typedef {"NOT_FOUND" | "SLUG_CONFLICT" | "PARENT_NOT_FOUND" | "PARENT_NOT_COLLECTION" | "OWNER_MISMATCH" | "CYCLE" | "TYPE_HAS_CHILDREN" | "AUTHOR_NOT_FOUND" | "INVALID_INPUT" | "QUOTA_EXCEEDED" | "VERSION_CONFLICT" | "USER_HAS_CONTENT" | "USER_CONFLICT" | "LAST_ADMIN" | "BUSY"} DataErrorCode
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
 * Colunas da violação de unicidade (`P2002`) informadas pelo adaptador do Prisma.
 * @param {any} error
 * @returns {string[]}
 */
function uniqueFields(error) {
  const meta = error?.meta;
  const fields =
    meta?.driverAdapterError?.cause?.constraint?.fields ?? meta?.driverAdapterError?.constraint?.fields ?? meta?.target;
  if (Array.isArray(fields)) return fields.map(String);
  return typeof fields === "string" ? [fields] : [];
}

/**
 * Converte erros conhecidos do Prisma em DataError; o restante é repassado sem alteração.
 * @param {unknown} error
 * @returns {unknown}
 */
function translateError(error) {
  if (error instanceof DataError) return error;
  const code = /** @type {{ code?: string }} */ (error)?.code;
  const message = String(/** @type {{ message?: string }} */ (error)?.message ?? "");
  if (code === "P2002") {
    const fields = uniqueFields(error);
    const field = ["handle", "email"].find((name) => fields.includes(name));
    if (field) {
      return new DataError("USER_CONFLICT", `Já existe um usuário com este ${field}.`, { field });
    }
    return new DataError("SLUG_CONFLICT", "Já existe um conteúdo com este slug no mesmo nível.");
  }
  if (code === "P2003") {
    return new DataError("AUTHOR_NOT_FOUND", "Autor ou pai inexistente.");
  }
  if (code === "P2025") {
    return new DataError("NOT_FOUND", "Registro não encontrado.");
  }
  if (code === "P1008" || /SQLITE_BUSY|database is locked/i.test(message)) {
    return new DataError("BUSY", "O banco está ocupado; tente novamente.");
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

/**
 * Cliente de consulta ou cliente de transação interativa.
 * @typedef {Pick<PrismaClient, "content" | "configuration" | "user" | "appearance" | "notification" | "verification">} Db
 */

/** @param {unknown} value @param {string} field */
function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DataError("INVALID_INPUT", `O campo "${field}" é obrigatório.`, { field });
  }
}

/** Mensagem de "usuário não encontrado" com o identificador em `details`. @param {string} id */
function userNotFound(id) {
  return new DataError("NOT_FOUND", "Usuário não encontrado.", { userId: id });
}

// --------------------------------------------------------
// Conteúdo (por dono)
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

/** O corpo é texto ou nulo. @param {unknown} body */
function assertBody(body) {
  if (body !== null && typeof body !== "string") {
    throw new DataError("INVALID_INPUT", 'O campo "body" deve ser texto ou nulo.', { field: "body" });
  }
}

/**
 * RN25: o corpo cabe na cota, medida em bytes UTF-8 (e não em caracteres).
 * @param {string | null | undefined} body
 * @param {import("@/lib/limits").Limits} limits
 */
function assertBodyWithinQuota(body, limits) {
  const bytes = bodyBytes(body);
  if (bytes > limits.maxBodyBytes) {
    throw new DataError("QUOTA_EXCEEDED", "O corpo excede o tamanho máximo.", {
      quota: "body",
      bytes,
      max: limits.maxBodyBytes,
    });
  }
}

/**
 * RN02, RN13: o pai deve existir, ser do mesmo dono e ser COLLECTION.
 * @param {Db} db
 * @param {string} parentId
 * @param {string | null} ownerId dono que o filho terá; `null` não verifica o dono
 */
async function assertParentUsable(db, parentId, ownerId) {
  const parent = await db.content.findUnique({ where: { id: parentId }, select: { type: true, authorId: true } });
  if (!parent) {
    throw new DataError("PARENT_NOT_FOUND", "O conteúdo pai não existe.", { parentId });
  }
  if (ownerId !== null && parent.authorId !== ownerId) {
    throw new DataError("OWNER_MISMATCH", "O pai pertence a outro dono.", { parentId });
  }
  if (parent.type !== "COLLECTION") {
    throw new DataError("PARENT_NOT_COLLECTION", "Apenas uma COLLECTION pode ter filhos.", { parentId });
  }
}

/**
 * Próxima ordem livre entre os filhos de `parentId` do dono (RN05): máximo atual + 1, ou 0 se vazio.
 * @param {Db} db
 * @param {string} ownerId
 * @param {string | null} parentId
 * @returns {Promise<number>}
 */
async function nextOrder(db, ownerId, parentId) {
  const { _max } = await db.content.aggregate({ where: { authorId: ownerId, parentId }, _max: { order: true } });
  return (_max.order ?? -1) + 1;
}

/**
 * O dono, quando informado, é um texto não vazio.
 * @param {unknown} ownerId
 */
function assertOptionalOwner(ownerId) {
  if (ownerId !== undefined) assertNonEmptyString(ownerId, "ownerId");
}

/**
 * Árvore de conteúdos de **um dono**, sem o corpo (uma única consulta; índice
 * `(authorId, parentId, order)`).
 * - `onlyPublished: true` (leitura pública, RN15): remove todo nó DRAFT e a sua subárvore.
 * - `onlyPublished: false` (painel): devolve tudo, com o `status` de cada nó (RF26).
 *
 * Transitório (M15 → A-014): sem `ownerId`, devolve as árvores de todos os donos, como antes do
 * M15, porque as rotas do Core ainda não passam o dono. A A-014 passa o dono em toda chamada e o
 * parâmetro passa a ser obrigatório; enquanto isso, a trava da ADR-023 (nenhuma conta além do
 * administrador) impede que haja dois donos.
 * @param {{ ownerId?: string, onlyPublished?: boolean }} [options]
 * @returns {Promise<import("@/lib/content-tree").ContentNode[]>}
 */
export async function getContentTree({ ownerId, onlyPublished = false } = {}) {
  assertOptionalOwner(ownerId);
  // Filtrar no banco é equivalente à poda: um publicado cujo ancestral é rascunho fica órfão
  // e buildTree descarta órfãos.
  const rows = await prisma.content.findMany({
    where: {
      ...(ownerId === undefined ? {} : { authorId: ownerId }),
      ...(onlyPublished ? { status: "PUBLISHED" } : {}),
    },
    select: TREE_SELECT,
  });
  return buildTree(/** @type {any} */ (rows), { onlyPublished });
}

/**
 * Conteúdo (com o corpo) a partir da cadeia de slugs da raiz ao nó, **na árvore do dono** (RN04).
 * Com `onlyPublished: true`, devolve `null` se o nó ou qualquer ancestral não estiver
 * PUBLISHED (RN15; a página responde 404). A suspensão do dono não é verificada aqui: quem resolve
 * o handle (`getUserByHandle`) já a trata.
 * @param {string} ownerId
 * @param {string[]} slugs
 * @param {{ onlyPublished?: boolean }} [options]
 * @returns {Promise<import("@/generated/prisma/client").Content | null>}
 */
export async function getContentByPath(ownerId, slugs, { onlyPublished = false } = {}) {
  assertNonEmptyString(ownerId, "ownerId");
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.some((s) => typeof s !== "string")) {
    return null;
  }
  const node = resolvePath(await getContentTree({ ownerId, onlyPublished }), slugs);
  if (!node) return null;
  return prisma.content.findFirst({ where: { id: node.id, authorId: ownerId } });
}

/**
 * Caminhos públicos de um nó e de todos os seus descendentes (RN04, RN15): cada caminho é a
 * cadeia de slugs da raiz ao nó, sem o handle (o Core o antepõe). Serve ao Core para calcular, antes
 * e depois de uma escrita, as páginas a revalidar (ADR-030). Sem `nodeId`, devolve os caminhos de
 * todo o espaço do dono. Devolve `[]` se o nó não existe, é de outro dono, é rascunho ou está sob
 * um rascunho. Ignora a suspensão do dono (ver `collectPublicPaths`).
 * @param {string} ownerId
 * @param {string | null} [nodeId]
 * @returns {Promise<string[][]>}
 */
export async function getPublicPaths(ownerId, nodeId = null) {
  assertNonEmptyString(ownerId, "ownerId");
  return collectPublicPaths(await getContentTree({ ownerId, onlyPublished: true }), nodeId);
}

/**
 * Detalhe de um conteúdo, com o corpo e o estado, em qualquer estado (uso do painel). O `authorId`
 * vem na linha: quem autoriza a operação (Core) compara com o dono da sessão (RN19).
 * @param {string} id
 * @returns {Promise<import("@/generated/prisma/client").Content | null>}
 */
export async function getContentById(id) {
  if (typeof id !== "string" || id === "") return null;
  return prisma.content.findUnique({ where: { id } });
}

/**
 * Uso do dono, para a tela de cotas: quantidade de conteúdos e total de bytes dos corpos (RN25).
 * A soma lê todos os corpos do dono: só deve ser pedida sob demanda, nunca a cada escrita.
 * @param {string} ownerId
 * @returns {Promise<{ contents: number, bodyBytes: number }>}
 */
export async function getContentUsage(ownerId) {
  assertNonEmptyString(ownerId, "ownerId");
  const [row] = await prisma.$queryRaw`
    SELECT count(*) AS contents, coalesce(sum(length(CAST(body AS BLOB))), 0) AS bodyBytes
    FROM contents WHERE authorId = ${ownerId}`;
  return { contents: Number(row.contents), bodyBytes: Number(row.bodyBytes) };
}

/**
 * Cria um conteúdo para o dono `authorId` (RN13). Garante RN02 (tipo válido e pai COLLECTION), RN03
 * (unicidade do slug entre irmãos e, na raiz, por dono, vira `SLUG_CONFLICT`), RN05 (ordem não
 * negativa; se omitida, entra no fim do nível), RN13 (o pai é do mesmo dono, senão `OWNER_MISMATCH`)
 * e RN25 (cotas, verificadas **dentro da transação**: `QUOTA_EXCEEDED`). O estado padrão é
 * PUBLISHED (RN16). O formato do slug e os nomes reservados são validados pelo Core antes de
 * chamar esta função.
 * @param {{
 *   title: string, slug: string, type: "DOCUMENT" | "COLLECTION", authorId: string,
 *   parentId?: string | null, body?: string | null, order?: number,
 *   status?: "DRAFT" | "PUBLISHED"
 * }} input
 * @param {{ limits?: Partial<import("@/lib/limits").Limits> }} [options] cotas; padrão: RN25
 * @returns {Promise<import("@/generated/prisma/client").Content>}
 * @throws {DataError}
 */
export async function createContent(input, { limits } = {}) {
  const { title, slug, type, authorId, parentId = null, body = null, status = "PUBLISHED" } = input;
  assertNonEmptyString(title, "title");
  assertNonEmptyString(slug, "slug");
  assertNonEmptyString(authorId, "authorId");
  assertType(type);
  assertStatus(status);
  assertBody(body);
  if (input.order !== undefined) assertOrder(input.order);
  const quota = resolveLimits(limits);
  assertBodyWithinQuota(body, quota);

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const total = await tx.content.count({ where: { authorId } });
      if (total >= quota.maxContentsPerUser) {
        throw new DataError("QUOTA_EXCEEDED", "O limite de conteúdos do usuário foi atingido.", {
          quota: "contents",
          total,
          max: quota.maxContentsPerUser,
        });
      }
      if (parentId !== null) await assertParentUsable(tx, parentId, authorId);
      const order = input.order ?? (await nextOrder(tx, authorId, parentId));
      return tx.content.create({
        data: { title, slug, type, status, body, order, parentId, authorId },
      });
    }),
  );
}

/** Campos que `updateContent` aceita; `authorId` e datas nunca mudam aqui (RN13). */
const UPDATABLE_FIELDS = ["title", "slug", "body", "type", "status", "parentId", "order"];

/**
 * Converte a versão esperada (RN18) em `Date`: aceita `Date` ou texto ISO 8601.
 * @param {unknown} value
 * @returns {Date}
 */
function parseVersion(value) {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new DataError("INVALID_INPUT", "A versão esperada é inválida.", { field: "expectedVersion" });
  }
  return date;
}

/**
 * Atualização parcial (inclusive `status` e mudança de pai). Garante RN02, RN03, RN05, RN06 (mover
 * não cria ciclo), RN13 (o novo pai é do mesmo dono: `OWNER_MISMATCH`) e RN25 (o corpo cabe na cota
 * em bytes). Ao mudar de pai sem informar `order`, o nó vai para o fim do novo nível.
 *
 * `expectedVersion` (RN18): o `updatedAt` do conteúdo que o autor abriu (`Date` ou ISO 8601). Se o
 * conteúdo mudou depois, a transação lança `VERSION_CONFLICT` com a versão atual em
 * `details.currentVersion`, sem alterar nada. Sem `expectedVersion`, a função não verifica: quem o
 * exige é a rota do Core.
 * @param {string} id
 * @param {{
 *   title?: string, slug?: string, body?: string | null, type?: "DOCUMENT" | "COLLECTION",
 *   status?: "DRAFT" | "PUBLISHED", parentId?: string | null, order?: number
 * }} patch
 * @param {{ limits?: Partial<import("@/lib/limits").Limits>, expectedVersion?: Date | string }} [options]
 * @returns {Promise<import("@/generated/prisma/client").Content>}
 * @throws {DataError}
 */
export async function updateContent(id, patch, { limits, expectedVersion } = {}) {
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
  if ("body" in data) {
    assertBody(data.body);
    assertBodyWithinQuota(data.body, resolveLimits(limits));
  }
  const version = expectedVersion === undefined ? null : parseVersion(expectedVersion);

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const current = await tx.content.findUnique({
        where: { id },
        select: { id: true, type: true, parentId: true, authorId: true, updatedAt: true },
      });
      if (!current) throw new DataError("NOT_FOUND", "Conteúdo não encontrado.", { id });

      if (version !== null && current.updatedAt.getTime() !== version.getTime()) {
        throw new DataError("VERSION_CONFLICT", "O conteúdo foi alterado depois da versão aberta.", {
          id,
          currentVersion: current.updatedAt.toISOString(),
        });
      }

      if (data.type === "DOCUMENT" && current.type === "COLLECTION") {
        const children = await tx.content.count({ where: { parentId: id } });
        if (children > 0) {
          throw new DataError("TYPE_HAS_CHILDREN", "Uma COLLECTION com filhos não pode virar DOCUMENT.", { id });
        }
      }

      if ("parentId" in data && data.parentId !== current.parentId) {
        if (data.parentId !== null) {
          await assertParentUsable(tx, data.parentId, current.authorId);
          const rows = await tx.content.findMany({
            where: { authorId: current.authorId },
            select: { id: true, parentId: true },
          });
          const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
          if (wouldCreateCycle(parentOf, id, data.parentId)) {
            throw new DataError("CYCLE", "O destino não pode ser o próprio conteúdo nem um descendente.", {
              id,
              parentId: data.parentId,
            });
          }
        }
        if (!("order" in data)) data.order = await nextOrder(tx, current.authorId, data.parentId);
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
 * pai existente, do mesmo dono e COLLECTION (RN02, RN13), sem ciclo (RN06), ordem inteira não
 * negativa (RN05) e slug único no destino (RN03). `parentId` omitido mantém o pai atual.
 *
 * Com `ownerId`, só os conteúdos desse dono são visíveis ao lote: um item que não é dele responde
 * `NOT_FOUND`, como se não existisse. Sem `ownerId` (transitório, como em `getContentTree`), o lote
 * não é restrito a um dono, mas um pai de dono diferente do item continua recusado.
 * @param {Array<{ id: string, parentId?: string | null, order: number }>} items
 * @param {{ ownerId?: string }} [options]
 * @returns {Promise<Array<{ id: string, parentId: string | null, order: number }>>}
 * @throws {DataError}
 */
export async function reorderContents(items, { ownerId } = {}) {
  if (!Array.isArray(items)) {
    throw new DataError("INVALID_INPUT", "O lote deve ser uma lista.", { field: "items" });
  }
  assertOptionalOwner(ownerId);
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
      const rows = await tx.content.findMany({
        where: ownerId === undefined ? undefined : { authorId: ownerId },
        select: { id: true, type: true, parentId: true, authorId: true },
      });
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
          if (!parent) {
            // Fora do dono do lote: existe, mas é de outro dono, ou não existe.
            const outside = await tx.content.findUnique({ where: { id: parentId }, select: { id: true } });
            throw outside
              ? new DataError("OWNER_MISMATCH", "O pai pertence a outro dono.", { parentId })
              : new DataError("PARENT_NOT_FOUND", "O conteúdo pai não existe.", { parentId });
          }
          if (parent.authorId !== node.authorId) {
            throw new DataError("OWNER_MISMATCH", "O pai pertence a outro dono.", { parentId });
          }
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
// Transferência de conteúdo entre donos (RN24, ADR-027, ADR-028)
// --------------------------------------------------------

/** Sufixo máximo de slug (RN03): 80 caracteres. */
const SLUG_MAX_LENGTH = 80;

/**
 * Raízes de `fromUserId` cujo slug já existe na raiz de `toUserId`.
 * @param {Db} db
 * @param {string} fromUserId
 * @param {string} toUserId
 * @returns {Promise<Array<{ id: string, slug: string }>>}
 */
async function rootSlugConflicts(db, fromUserId, toUserId) {
  const roots = await db.content.findMany({
    where: { authorId: fromUserId, parentId: null },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });
  if (roots.length === 0) return [];
  const taken = new Set(
    (await db.content.findMany({ where: { authorId: toUserId, parentId: null }, select: { slug: true } })).map(
      (row) => row.slug,
    ),
  );
  return roots.filter((root) => taken.has(root.slug));
}

/**
 * Raízes do usuário `fromUserId` que não poderiam ser transferidas a `toUserId` por já existir um
 * slug igual na raiz dele (RN24). Lista vazia = a transferência não tem conflito.
 * @param {string} fromUserId
 * @param {string} toUserId
 * @returns {Promise<Array<{ id: string, slug: string }>>}
 */
export async function findTransferConflicts(fromUserId, toUserId) {
  assertNonEmptyString(fromUserId, "fromUserId");
  assertNonEmptyString(toUserId, "toUserId");
  return rootSlugConflicts(prisma, fromUserId, toUserId);
}

/**
 * Transfere todo o conteúdo de um dono a outro, dentro da transação `tx`. Um único `UPDATE` do
 * `authorId` nas raízes leva os descendentes pela cascata da chave estrangeira composta; se o slug
 * de alguma raiz já existir no destino, o índice parcial por dono faz o `UPDATE` falhar inteiro.
 * @param {Db} tx
 * @param {string} fromUserId
 * @param {string} toUserId
 * @param {"fail" | "rename"} onConflict
 * @returns {Promise<{ roots: number, renamed: Array<{ id: string, from: string, to: string }> }>}
 */
async function transferInTransaction(tx, fromUserId, toUserId, onConflict) {
  if (fromUserId === toUserId) {
    throw new DataError("INVALID_INPUT", "A origem e o destino da transferência são o mesmo usuário.", {
      field: "to",
    });
  }
  if (onConflict !== "fail" && onConflict !== "rename") {
    throw new DataError("INVALID_INPUT", 'onConflict deve ser "fail" ou "rename".', { field: "onConflict" });
  }
  const destination = await tx.user.findUnique({ where: { id: toUserId }, select: { id: true } });
  if (!destination) {
    throw new DataError("AUTHOR_NOT_FOUND", "O usuário de destino não existe.", { to: toUserId });
  }

  const conflicts = await rootSlugConflicts(tx, fromUserId, toUserId);
  /** @type {Array<{ id: string, from: string, to: string }>} */
  const renamed = [];
  if (conflicts.length > 0) {
    if (onConflict === "fail") {
      throw new DataError("SLUG_CONFLICT", "Há raízes com slug já usado na raiz do destino.", {
        conflicts: conflicts.map((conflict) => conflict.slug),
      });
    }
    const taken = new Set(
      (await tx.content.findMany({ where: { authorId: toUserId, parentId: null }, select: { slug: true } })).map(
        (row) => row.slug,
      ),
    );
    for (const conflict of conflicts) {
      let attempt = 2;
      /** @type {string} */
      let candidate;
      do {
        const suffix = `-${attempt}`;
        candidate = `${conflict.slug.slice(0, SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
        attempt += 1;
      } while (taken.has(candidate));
      taken.add(candidate);
      await tx.content.update({ where: { id: conflict.id }, data: { slug: candidate } });
      renamed.push({ id: conflict.id, from: conflict.slug, to: candidate });
    }
  }

  const { count } = await tx.content.updateMany({
    where: { authorId: fromUserId, parentId: null },
    data: { authorId: toUserId },
  });
  return { roots: count, renamed };
}

/**
 * Transfere **todo** o conteúdo de `fromUserId` a `toUserId` (RN24; ADR-027), em uma transação:
 * ou a árvore inteira muda de dono, ou nada muda. `onConflict` decide o que fazer com uma raiz cujo
 * slug já existe no destino: `"fail"` (padrão) recusa tudo com `SLUG_CONFLICT` (`details.conflicts`
 * lista os slugs); `"rename"` renomeia a raiz conflitante com o sufixo `-2`, `-3`... e move tudo.
 * @param {string} fromUserId
 * @param {string} toUserId
 * @param {{ onConflict?: "fail" | "rename" }} [options]
 * @returns {Promise<{ roots: number, renamed: Array<{ id: string, from: string, to: string }> }>}
 * @throws {DataError} `SLUG_CONFLICT`, `AUTHOR_NOT_FOUND` (destino), `INVALID_INPUT`
 */
export async function transferContents(fromUserId, toUserId, { onConflict = "fail" } = {}) {
  assertNonEmptyString(fromUserId, "fromUserId");
  assertNonEmptyString(toUserId, "toUserId");
  return guarded(() => prisma.$transaction((tx) => transferInTransaction(tx, fromUserId, toUserId, onConflict)));
}

// --------------------------------------------------------
// Usuários, papéis e espaços (RN19 a RN24, RN28)
// --------------------------------------------------------

/** Papéis do plugin admin do better-auth (RN19). */
export const USER_ROLES = /** @type {const} */ (["admin", "user"]);

/**
 * Usuário que o público pode ver (RN23): sem suspensão, ou com a suspensão já vencida. A coluna
 * `banned` só é limpa pelo better-auth no próximo login, por isso o prazo é conferido aqui.
 * @param {Date} now
 */
function notSuspended(now) {
  return { OR: [{ banned: false }, { banExpires: { lt: now } }] };
}

/**
 * @param {{ banned: boolean, banExpires: Date | null }} user
 * @param {Date} now
 */
function isSuspended(user, now) {
  return user.banned && !(user.banExpires !== null && user.banExpires < now);
}

/**
 * Usuário do espaço `/{handle}` (RN20). Devolve `null` para handle vazio ou inexistente e para
 * usuário suspenso, sem prazo ou com prazo vigente (RN23; o espaço responde 404). O handle deve
 * vir já normalizado pelo Core.
 * `includeSuspended` serve à pré-verificação de unicidade do handle, que vale também para a conta
 * suspensa (a conta suspensa volta a usá-lo).
 * @param {string} handle
 * @param {{ now?: Date, includeSuspended?: boolean }} [options]
 * @returns {Promise<{ id: string, name: string, handle: string | null, role: string, image: string | null } | null>}
 */
export async function getUserByHandle(handle, { now = new Date(), includeSuspended = false } = {}) {
  if (typeof handle !== "string" || handle === "") return null;
  return prisma.user.findFirst({
    where: { handle, ...(includeSuspended ? {} : notSuspended(now)) },
    select: { id: true, name: true, handle: true, role: true, image: true },
  });
}

/**
 * Quantos administradores ativos existem: `role = "admin"` e não suspensos, considerando a
 * suspensão vencida (`banExpires`) como inexistente (RN22, RN23).
 * @param {{ now?: Date }} [options]
 * @returns {Promise<number>}
 */
export async function countActiveAdmins({ now = new Date() } = {}) {
  return prisma.user.count({ where: { role: "admin", ...notSuspended(now) } });
}

/**
 * RN22: o último administrador ativo não pode deixar de sê-lo. Lança `LAST_ADMIN` se `user` é um
 * administrador ativo e não há outro.
 * @param {Db} tx
 * @param {{ id: string, role: string, banned: boolean, banExpires: Date | null }} user estado ATUAL
 * @param {Date} now
 */
async function assertAnotherActiveAdmin(tx, user, now) {
  if (user.role !== "admin" || isSuspended(user, now)) return;
  const others = await tx.user.count({ where: { id: { not: user.id }, role: "admin", ...notSuspended(now) } });
  if (others === 0) {
    throw new DataError("LAST_ADMIN", "Não é possível remover, rebaixar nem suspender o último administrador ativo.", {
      userId: user.id,
    });
  }
}

/** Campos que `updateUserProfile` aceita. */
const UPDATABLE_USER_FIELDS = ["name", "handle", "image", "role", "banned", "banReason", "banExpires"];

/**
 * Edita a conta de um usuário (UC13): nome, handle, imagem, papel e suspensão (`banned`,
 * `banReason`, `banExpires`). A regra do último administrador ativo é verificada **na mesma
 * transação** da escrita (RN22): rebaixar ou suspender o último administrador ativo lança
 * `LAST_ADMIN`. Handle repetido lança `USER_CONFLICT` (`details.field = "handle"`). O formato do
 * handle (RN20) e o motivo da suspensão são validados pelo Core; aqui `handle` e `image` vazios
 * viram `null`. A revogação das sessões na suspensão é do Core (better-auth).
 * @param {string} userId
 * @param {Partial<{
 *   name: string, handle: string | null, image: string | null, role: "admin" | "user",
 *   banned: boolean, banReason: string | null, banExpires: Date | string | null
 * }>} patch
 * @param {{ now?: Date }} [options]
 * @returns {Promise<import("@/generated/prisma/client").User>}
 * @throws {DataError}
 */
export async function updateUserProfile(userId, patch, { now = new Date() } = {}) {
  assertNonEmptyString(userId, "userId");
  /** @type {Record<string, any>} */
  const data = {};
  for (const field of UPDATABLE_USER_FIELDS) {
    if (/** @type {any} */ (patch)?.[field] !== undefined) data[field] = /** @type {any} */ (patch)[field];
  }
  if ("name" in data) assertNonEmptyString(data.name, "name");
  for (const field of ["handle", "image", "banReason"]) {
    if (field in data) {
      if (data[field] !== null && typeof data[field] !== "string") {
        throw new DataError("INVALID_INPUT", `O campo "${field}" deve ser texto ou nulo.`, { field });
      }
      if (data[field] !== null && data[field].trim() === "" && field !== "banReason") data[field] = null;
    }
  }
  if ("role" in data && !USER_ROLES.includes(data.role)) {
    throw new DataError("INVALID_INPUT", "O papel deve ser admin ou user.", { field: "role" });
  }
  if ("banned" in data && typeof data.banned !== "boolean") {
    throw new DataError("INVALID_INPUT", 'O campo "banned" deve ser verdadeiro ou falso.', { field: "banned" });
  }
  if ("banExpires" in data && data.banExpires !== null) {
    const date = data.banExpires instanceof Date ? data.banExpires : new Date(data.banExpires);
    if (Number.isNaN(date.getTime())) {
      throw new DataError("INVALID_INPUT", 'O campo "banExpires" é uma data inválida.', { field: "banExpires" });
    }
    data.banExpires = date;
  }

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (!current) throw userNotFound(userId);
      if (Object.keys(data).length === 0) return current;

      const next = { ...current, ...data };
      const loses = !isSuspended(current, now) && current.role === "admin";
      if (loses && (next.role !== "admin" || isSuspended(next, now))) {
        await assertAnotherActiveAdmin(tx, current, now);
      }
      return tx.user.update({ where: { id: userId }, data });
    }),
  );
}

/**
 * Muda o papel de um usuário (RN19, RN22): atalho de `updateUserProfile({ role })`, com a regra do
 * último administrador ativo na mesma transação.
 * @param {string} userId
 * @param {"admin" | "user"} role
 * @param {{ now?: Date }} [options]
 * @returns {Promise<import("@/generated/prisma/client").User>}
 * @throws {DataError} `LAST_ADMIN`, `NOT_FOUND`, `INVALID_INPUT`
 */
export async function changeUserRole(userId, role, options) {
  return updateUserProfile(userId, { role }, options);
}

/**
 * Liga ou desliga o marcador de senha provisória (RN21): ligado, a conta só troca a própria senha e
 * lê o perfil. O Core liga ao criar a conta e ao redefinir a senha, e desliga depois da troca.
 * @param {string} userId
 * @param {boolean} value
 * @returns {Promise<{ id: string, mustChangePassword: boolean }>}
 * @throws {DataError} `NOT_FOUND`
 */
export async function setMustChangePassword(userId, value) {
  assertNonEmptyString(userId, "userId");
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data: { mustChangePassword: value } });
  if (count === 0) throw userNotFound(userId);
  return { id: userId, mustChangePassword: value };
}

/**
 * Desliga o marcador de senha provisória depois da troca de senha (RN21).
 * @param {string} userId
 * @returns {Promise<{ id: string, mustChangePassword: boolean }>}
 * @throws {DataError} `NOT_FOUND`
 */
export async function clearMustChangePassword(userId) {
  return setMustChangePassword(userId, false);
}

/**
 * Exclui um usuário, **atomicamente** (RN24, ADR-027): em uma transação, resolve o conteúdo, apaga
 * as sessões, as contas, a aparência, as notificações e a verificação pendente e, por último, o
 * usuário. Se algo falhar, nada muda: o usuário não fica sem credencial, como ocorria ao chamar o
 * `remove-user` bruto do better-auth.
 *
 * - Sem conteúdo, `content` é dispensado.
 * - Com conteúdo e sem `content`: `USER_HAS_CONTENT`.
 * - `{ content: "transfer", to, onConflict }`: transfere a árvore inteira a `to` (ver
 *   `transferContents`); com conflito de slug na raiz do destino e `onConflict` `"fail"` (padrão),
 *   recusa tudo.
 * - `{ content: "delete" }`: exclui o conteúdo junto (a confirmação explícita é do painel).
 *
 * O último administrador ativo não pode ser excluído (`LAST_ADMIN`; RN22). Que o administrador não
 * exclua a si mesmo é regra do Core, que conhece quem pede.
 * @param {string} userId
 * @param {{ content?: "transfer", to: string, onConflict?: "fail" | "rename", now?: Date }
 *   | { content?: "delete", now?: Date }
 *   | { now?: Date }} [options]
 * @returns {Promise<{ id: string, content: "none" | "transferred" | "deleted", roots: number, renamed: Array<{ id: string, from: string, to: string }> }>}
 * @throws {DataError}
 */
export async function deleteUser(userId, options = {}) {
  assertNonEmptyString(userId, "userId");
  const { content, now = new Date() } = /** @type {any} */ (options);
  if (content !== undefined && content !== "transfer" && content !== "delete") {
    throw new DataError("INVALID_INPUT", 'O campo "content" deve ser "transfer" ou "delete".', { field: "content" });
  }
  if (content === "transfer") assertNonEmptyString(/** @type {any} */ (options).to, "to");

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw userNotFound(userId);
      await assertAnotherActiveAdmin(tx, user, now);

      const owned = await tx.content.count({ where: { authorId: userId } });
      /** @type {"none" | "transferred" | "deleted"} */
      let outcome = "none";
      let roots = 0;
      /** @type {Array<{ id: string, from: string, to: string }>} */
      let renamed = [];
      if (owned > 0) {
        if (content === undefined) {
          throw new DataError("USER_HAS_CONTENT", "O usuário possui conteúdo; escolha transferir ou excluir.", {
            owned,
          });
        }
        if (content === "transfer") {
          const { to, onConflict = "fail" } = /** @type {any} */ (options);
          ({ roots, renamed } = await transferInTransaction(tx, userId, to, onConflict));
          outcome = "transferred";
        } else {
          // Apagar as raízes leva os descendentes pela cascata (RN07).
          ({ count: roots } = await tx.content.deleteMany({ where: { authorId: userId, parentId: null } }));
          outcome = "deleted";
        }
      }

      await tx.verification.deleteMany({ where: { identifier: user.email } });
      // Sessões, contas, aparência e notificações saem pela cascata das chaves estrangeiras.
      await tx.user.delete({ where: { id: userId } });
      return { id: userId, content: outcome, roots, renamed };
    }),
  );
}

/**
 * Comparador alfabético pelo nome de exibição (RN28), sem distinguir caixa nem acentos.
 * @param {string} a
 * @param {string} b
 */
function compareDisplayNames(a, b) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Diretório de espaços do portal (RN28): usuários com handle, não suspensos e com ao menos uma
 * **raiz** publicada (um nó publicado sem ancestrais já é visível; RN15). Em ordem alfabética pelo
 * nome de exibição do espaço: o `siteName` da aparência do usuário ou, sem ela, o nome dele. Quem
 * decide mostrar o diretório (`Configuration.directoryEnabled`) é a página.
 * @param {{ now?: Date }} [options]
 * @returns {Promise<Array<{ id: string, handle: string, name: string, description: string | null }>>}
 */
export async function listPublicSpaces({ now = new Date() } = {}) {
  const users = await prisma.user.findMany({
    where: {
      handle: { not: null },
      ...notSuspended(now),
      contents: { some: { parentId: null, status: "PUBLISHED" } },
    },
    select: { id: true, name: true, handle: true, appearance: { select: { siteName: true, siteDescription: true } } },
  });
  return users
    .map((user) => ({
      id: user.id,
      handle: /** @type {string} */ (user.handle),
      name: user.appearance?.siteName ?? user.name,
      description: user.appearance?.siteDescription ?? null,
    }))
    .sort((a, b) => compareDisplayNames(a.name, b.name) || compareDisplayNames(a.handle, b.handle));
}

// --------------------------------------------------------
// Configuração do site (registro único, RN08) e aparência por dono (RF31)
// --------------------------------------------------------

/** Identificador fixo do único registro de Configuration (mesmo @default do schema). */
export const CONFIGURATION_ID = "default";

/**
 * Paletas padrão (Cap. 5 §5.9, Tabela de paletas padrão; ADR-031). São as mesmas do schema
 * (`Configuration` e `Appearance`) e do seed; um teste confere que não divergem.
 */
export const DEFAULT_COLORS = Object.freeze({
  primaryColor: "#2563eb",
  secondaryColor: "#1e293b",
  accentColor: "#b45309",
  darkPrimaryColor: "#60a5fa",
  darkSecondaryColor: "#cbd5e1",
  darkAccentColor: "#fbbf24",
});

/** Campos de cor (as duas paletas): obrigatórios, com padrão no schema. */
const COLOR_FIELDS = Object.keys(DEFAULT_COLORS);

/** Campos opcionais comuns ao site e à aparência: cadeia vazia equivale a ausente (RN17). */
const NULLABLE_IDENTITY_FIELDS = [
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

/** Campos obrigatórios do site e da aparência (têm valor padrão no schema). */
const REQUIRED_IDENTITY_FIELDS = ["siteName", ...COLOR_FIELDS];

/**
 * Monta o objeto de escrita a partir do pedido: campos ausentes não mudam, chaves desconhecidas são
 * ignoradas, os obrigatórios não podem ser vazios e, nos opcionais, cadeia vazia vira `null`.
 * @param {unknown} patch
 * @param {string[]} required
 * @param {string[]} nullable
 * @returns {Record<string, string | null>}
 */
function buildTextData(patch, required, nullable) {
  /** @type {Record<string, string | null>} */
  const data = {};
  for (const field of required) {
    const value = /** @type {any} */ (patch)?.[field];
    if (value === undefined) continue;
    assertNonEmptyString(value, field);
    data[field] = value;
  }
  for (const field of nullable) {
    const value = /** @type {any} */ (patch)?.[field];
    if (value === undefined) continue;
    data[field] = value === null || String(value).trim() === "" ? null : String(value);
  }
  return data;
}

/**
 * Configuração do site vigente. Se o registro não existir, é criado com os valores padrão (RN08).
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
 * Atualiza a configuração do site (*upsert* no registro único). Aceita identidade, as duas paletas,
 * os seis links sociais, o texto do portal (`homeBody`) e o `directoryEnabled`; campos ausentes não
 * mudam e chaves desconhecidas são ignoradas. Nos campos opcionais, cadeia vazia vira `null` (RN17).
 * O formato de URL e de cor é validado pelo Core.
 * @param {Partial<{
 *   siteName: string, siteDescription: string | null, primaryColor: string, secondaryColor: string,
 *   accentColor: string, darkPrimaryColor: string, darkSecondaryColor: string, darkAccentColor: string,
 *   logoUrl: string | null, faviconUrl: string | null,
 *   discordUrl: string | null, githubUrl: string | null, youtubeUrl: string | null,
 *   instagramUrl: string | null, linkedinUrl: string | null, twitchUrl: string | null,
 *   homeBody: string | null, directoryEnabled: boolean
 * }>} patch
 * @returns {Promise<import("@/generated/prisma/client").Configuration>}
 * @throws {DataError} `INVALID_INPUT` para campo obrigatório vazio ou de tipo errado
 */
export async function updateConfiguration(patch) {
  /** @type {Record<string, string | boolean | null>} */
  const data = buildTextData(patch, REQUIRED_IDENTITY_FIELDS, [...NULLABLE_IDENTITY_FIELDS, "homeBody"]);
  const directoryEnabled = /** @type {any} */ (patch)?.directoryEnabled;
  if (directoryEnabled !== undefined) {
    if (typeof directoryEnabled !== "boolean") {
      throw new DataError("INVALID_INPUT", 'O campo "directoryEnabled" deve ser verdadeiro ou falso.', {
        field: "directoryEnabled",
      });
    }
    data.directoryEnabled = directoryEnabled;
  }
  return prisma.configuration.upsert({
    where: { id: CONFIGURATION_ID },
    update: data,
    create: { id: CONFIGURATION_ID, ...data },
  });
}

/**
 * Aparência do espaço de um usuário (RF31, RN08). Sem linha, devolve os **padrões**, com
 * `persisted: false`, **sem escrever** no banco (a leitura pública nunca escreve); o nome padrão é o
 * do usuário. Devolve `null` se o usuário não existe.
 * @param {string} ownerId
 * @returns {Promise<(import("@/generated/prisma/client").Appearance & { persisted: boolean }) | null>}
 */
export async function getAppearance(ownerId) {
  assertNonEmptyString(ownerId, "ownerId");
  const row = await prisma.appearance.findUnique({ where: { ownerId } });
  if (row) return { ...row, persisted: true };
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } });
  if (!user) return null;
  return /** @type {any} */ ({
    ownerId,
    siteName: user.name,
    siteDescription: null,
    ...DEFAULT_COLORS,
    logoUrl: null,
    faviconUrl: null,
    discordUrl: null,
    githubUrl: null,
    youtubeUrl: null,
    instagramUrl: null,
    linkedinUrl: null,
    twitchUrl: null,
    createdAt: null,
    updatedAt: null,
    persisted: false,
  });
}

/**
 * Grava a aparência do usuário (*upsert* por dono): a linha nasce no primeiro salvamento, com o nome
 * do usuário como `siteName` se o pedido não o traz. Mesmas regras de `updateConfiguration`, sem os
 * campos do portal.
 * @param {string} ownerId
 * @param {Partial<{
 *   siteName: string, siteDescription: string | null, primaryColor: string, secondaryColor: string,
 *   accentColor: string, darkPrimaryColor: string, darkSecondaryColor: string, darkAccentColor: string,
 *   logoUrl: string | null, faviconUrl: string | null,
 *   discordUrl: string | null, githubUrl: string | null, youtubeUrl: string | null,
 *   instagramUrl: string | null, linkedinUrl: string | null, twitchUrl: string | null
 * }>} patch
 * @returns {Promise<import("@/generated/prisma/client").Appearance & { persisted: true }>}
 * @throws {DataError} `NOT_FOUND` (usuário), `INVALID_INPUT`
 */
export async function updateAppearance(ownerId, patch) {
  assertNonEmptyString(ownerId, "ownerId");
  const data = buildTextData(patch, REQUIRED_IDENTITY_FIELDS, NULLABLE_IDENTITY_FIELDS);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: ownerId }, select: { name: true } });
      if (!user) throw userNotFound(ownerId);
      const row = await tx.appearance.upsert({
        where: { ownerId },
        update: data,
        create: { ownerId, siteName: user.name, ...data },
      });
      return { ...row, persisted: /** @type {const} */ (true) };
    }),
  );
}

// --------------------------------------------------------
// Notificações internas (RF33, RN26, ADR-026, ADR-028)
// --------------------------------------------------------

/** Tipos de notificação (RN26); o SQLite não os impõe, a camada de dados sim. */
export const NOTIFICATION_TYPES = /** @type {const} */ (["CONTRAST", "MODERATION", "ACCOUNT"]);
/** Gravidades de notificação. */
export const NOTIFICATION_SEVERITIES = /** @type {const} */ (["INFO", "WARNING", "CRITICAL"]);

/** Teto absoluto de notificações por usuário (RN26; constante de módulo, não variável de ambiente). */
export const MAX_NOTIFICATIONS_PER_USER = 1000;
/** Idade, em dias, a partir da qual uma notificação de contraste lida ou resolvida é podada (RN26). */
export const CONTRAST_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Instante da última poda preguiçosa deste processo (RN26: no máximo uma vez por dia).
 * @type {number}
 */
let lastLazyPrune = 0;

/**
 * Zera o relógio da poda preguiçosa. Existe para os testes; a aplicação não o usa.
 * @internal
 */
export function resetNotificationPruneClock() {
  lastLazyPrune = 0;
}

/**
 * Notificação com o `data` já desserializado.
 * @typedef {Omit<import("@/generated/prisma/client").Notification, "data"> & { data: Record<string, unknown> }} NotificationView
 */

/**
 * @param {import("@/generated/prisma/client").Notification} row
 * @returns {NotificationView}
 */
function toNotificationView(row) {
  /** @type {Record<string, unknown>} */
  let data = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed !== null && typeof parsed === "object") data = parsed;
  } catch {
    // `data` corrompido não derruba a listagem: o texto é montado só de `type` e do que houver.
  }
  return { ...row, data };
}

/**
 * Poda por idade (RN26): só as notificações de **contraste** lidas ou resolvidas há mais de 90 dias.
 * As de moderação e de conta nunca são podadas por idade, lidas ou não; as não lidas também ficam.
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ count: number }>}
 */
export async function pruneNotifications({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - CONTRAST_RETENTION_DAYS * DAY_MS);
  return prisma.notification.deleteMany({
    where: { type: "CONTRAST", OR: [{ readAt: { lt: cutoff } }, { resolvedAt: { lt: cutoff } }] },
  });
}

/**
 * Poda preguiçosa: roda `pruneNotifications` no máximo uma vez por dia por processo, ao criar uma
 * notificação (a instância não tem agendador). Uma falha da poda nunca falha a criação.
 * @param {Date} now
 */
async function pruneNotificationsLazily(now) {
  if (now.getTime() - lastLazyPrune < DAY_MS) return;
  lastLazyPrune = now.getTime();
  try {
    await pruneNotifications({ now });
  } catch {
    lastLazyPrune = 0; // tenta de novo na próxima criação
  }
}

/**
 * Teto absoluto por usuário (RN26). Passando de `MAX_NOTIFICATIONS_PER_USER`, saem, nesta ordem e
 * sempre as mais antigas primeiro (por `updatedAt`): (1) as de contraste lidas ou resolvidas;
 * (2) as de moderação e de conta já lidas; (3) só se todas as demais forem não lidas, a mais
 * antiga. A notificação recém-criada nunca é removida (a criação nunca é bloqueada).
 * @param {Db} tx
 * @param {string} userId
 * @param {string} keepId
 */
async function enforceNotificationCap(tx, userId, keepId) {
  const total = await tx.notification.count({ where: { userId } });
  let excess = total - MAX_NOTIFICATIONS_PER_USER;
  if (excess <= 0) return;

  const stages = [
    { type: "CONTRAST", OR: [{ readAt: { not: null } }, { resolvedAt: { not: null } }] },
    { type: { in: ["MODERATION", "ACCOUNT"] }, readAt: { not: null } },
    {},
  ];
  for (const stage of stages) {
    if (excess <= 0) break;
    const victims = await tx.notification.findMany({
      where: { userId, id: { not: keepId }, ...stage },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: excess,
      select: { id: true },
    });
    if (victims.length === 0) continue;
    await tx.notification.deleteMany({ where: { id: { in: victims.map((victim) => victim.id) } } });
    excess -= victims.length;
  }
}

/**
 * Cria uma notificação para `userId`, ou **reabre** a existente com a mesma `dedupeKey` (RN26): a
 * reabertura zera `readAt` e `resolvedAt`, troca `severity` e `data` e avança `updatedAt`. Sem
 * `dedupeKey`, cada chamada cria uma notificação nova (moderação e conta). O texto exibido não é
 * guardado: o Core o monta a partir de `type` e `data`. Aplica o teto por usuário na mesma
 * transação e dispara a poda preguiçosa (ver `pruneNotifications`).
 * @param {{
 *   userId: string, type: "CONTRAST" | "MODERATION" | "ACCOUNT",
 *   severity?: "INFO" | "WARNING" | "CRITICAL", data?: Record<string, unknown>, dedupeKey?: string | null
 * }} input
 * @param {{ now?: Date }} [options]
 * @returns {Promise<NotificationView>}
 * @throws {DataError} `INVALID_INPUT`, `AUTHOR_NOT_FOUND` (usuário inexistente)
 */
export async function notify(input, { now = new Date() } = {}) {
  const { userId, type, severity = "INFO", data = {}, dedupeKey = null } = input;
  assertNonEmptyString(userId, "userId");
  if (!NOTIFICATION_TYPES.includes(/** @type {any} */ (type))) {
    throw new DataError("INVALID_INPUT", "O tipo deve ser CONTRAST, MODERATION ou ACCOUNT.", { field: "type" });
  }
  if (!NOTIFICATION_SEVERITIES.includes(/** @type {any} */ (severity))) {
    throw new DataError("INVALID_INPUT", "A gravidade deve ser INFO, WARNING ou CRITICAL.", { field: "severity" });
  }
  if (dedupeKey !== null) assertNonEmptyString(dedupeKey, "dedupeKey");
  /** @type {string} */
  let serialized;
  try {
    serialized = JSON.stringify(data ?? {});
  } catch {
    throw new DataError("INVALID_INPUT", 'O campo "data" não é serializável em JSON.', { field: "data" });
  }

  const row = await guarded(() =>
    prisma.$transaction(async (tx) => {
      const fields = { type, severity, data: serialized, readAt: null, resolvedAt: null };
      // `now` é a única fonte de tempo: a criação e a reabertura marcam `updatedAt` com o mesmo instante.
      const stamps = { createdAt: now, updatedAt: now };
      const saved =
        dedupeKey === null
          ? await tx.notification.create({ data: { userId, ...fields, ...stamps } })
          : await tx.notification.upsert({
              where: { userId_dedupeKey: { userId, dedupeKey } },
              update: { ...fields, updatedAt: now },
              create: { userId, dedupeKey, ...fields, ...stamps },
            });
      await enforceNotificationCap(tx, userId, saved.id);
      return saved;
    }),
  );
  await pruneNotificationsLazily(now);
  return toNotificationView(row);
}

/**
 * Marca como resolvida (a causa deixou de existir) a notificação de `userId` com a `dedupeKey`
 * (RN26; ex.: a paleta passou a atender o contraste). Não faz nada se não houver ou se já estiver
 * resolvida; reabrir (`notify` com a mesma chave) a volta a contar como não lida.
 * @param {string} userId
 * @param {string} dedupeKey
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ count: number }>}
 */
export async function resolveNotification(userId, dedupeKey, { now = new Date() } = {}) {
  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(dedupeKey, "dedupeKey");
  return prisma.notification.updateMany({
    where: { userId, dedupeKey, resolvedAt: null },
    data: { resolvedAt: now },
  });
}

/**
 * Quantas notificações não lidas e não resolvidas o usuário tem (o contador do painel).
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countUnread(userId) {
  assertNonEmptyString(userId, "userId");
  return prisma.notification.count({ where: { userId, readAt: null, resolvedAt: null } });
}

/**
 * Notificações do usuário, das mais recentes (`updatedAt`) para as mais antigas, com paginação por
 * cursor (o `id` da última linha recebida). `unreadOnly` traz só as não lidas e não resolvidas.
 * Só o dono vê as suas: a função sempre filtra por `userId` (RN19, RN26).
 * @param {string} userId
 * @param {{ unreadOnly?: boolean, take?: number, cursor?: string }} [options]
 * @returns {Promise<NotificationView[]>}
 */
export async function listNotifications(userId, { unreadOnly = false, take = 20, cursor } = {}) {
  assertNonEmptyString(userId, "userId");
  if (!Number.isInteger(take) || take < 1 || take > MAX_NOTIFICATIONS_PER_USER) {
    throw new DataError("INVALID_INPUT", `O campo "take" deve ser um inteiro de 1 a ${MAX_NOTIFICATIONS_PER_USER}.`, {
      field: "take",
    });
  }
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null, resolvedAt: null } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return rows.map(toNotificationView);
}

/**
 * Marca como lidas as notificações do usuário: as de `ids` ou, se omitido, todas. Ids de outro
 * usuário são ignorados (só o dono altera as suas).
 * @param {string} userId
 * @param {string[]} [ids]
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ count: number }>}
 */
export async function markRead(userId, ids, { now = new Date() } = {}) {
  assertNonEmptyString(userId, "userId");
  return prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === undefined ? {} : { id: { in: ids } }) },
    data: { readAt: now },
  });
}

/**
 * Dispensa (exclui) uma notificação do usuário. Uma de outro usuário não é afetada.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ count: number }>}
 */
export async function dismiss(userId, id) {
  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(id, "id");
  return prisma.notification.deleteMany({ where: { userId, id } });
}
