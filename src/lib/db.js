// Único ponto de criação do PrismaClient na aplicação (DESENVOLVEDORES.md §6).
// O seed (prisma/seed.js) é a única exceção, pois roda fora do Next.js.
// Aqui ficam a instância do cliente e as funções nomeadas de acesso a dados; lógica HTTP, validação
// de formato (slug, handle, URL, cor) e revalidação de cache são do Core e não entram neste módulo.
//
// Com vários usuários (M15; ADR-023 a ADR-028), toda árvore tem um só dono (`authorId`), imposto pelo
// banco, e as funções de conteúdo trabalham "por dono". Quem decide QUEM pode fazer o quê é o Core
// (autorização, RN19): este módulo só recebe o dono como argumento e garante as invariantes de dados.
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { buildTree, collectPublicPaths, resolvePath, wouldCreateCycle } from "@/lib/content-tree";
import { MAX_FOOTER_LINKS, MODE_ICON_PAIRS, isFooterIcon, isModeIconPair } from "@/lib/footer-icons";
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

/**
 * Caminho absoluto do arquivo do banco a partir de `DATABASE_URL` (`file:CAMINHO`), pela mesma regra
 * do adaptador do better-sqlite3 usado em `createPrismaClient`: tira o prefixo `file:` e resolve o
 * resto a partir do diretório de trabalho (ou de `cwd`). Serve a `npm run db:backup`.
 * @param {string | undefined} url normalmente `process.env.DATABASE_URL`
 * @param {{ cwd?: string }} [options]
 * @returns {string}
 * @throws {Error} se a URL falta ou não é do tipo `file:`
 */
export function databaseFileFromUrl(url, { cwd = process.cwd() } = {}) {
  if (!url) throw new Error("DATABASE_URL não definida (veja .env.example).");
  if (!url.startsWith("file:") || url === "file:") throw new Error("DATABASE_URL deve ter o formato file:CAMINHO.");
  return path.resolve(cwd, url.replace(/^file:/, ""));
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
 * @typedef {Pick<PrismaClient, "content" | "configuration" | "user" | "appearance" | "notification" | "verification" | "image" | "footerLink">} Db
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
 * Árvore de conteúdos de **um dono**, sem o corpo (uma única consulta; índice
 * `(authorId, parentId, order)`).
 * - `onlyPublished: true` (leitura pública, RN15): remove todo nó DRAFT e a sua subárvore.
 * - `onlyPublished: false` (painel): devolve tudo, com o `status` de cada nó (RF26).
 *
 * O `ownerId` é obrigatório (`INVALID_INPUT` se faltar ou vier vazio): não há leitura da árvore
 * de todos os donos (A-016).
 * @param {{ ownerId: string, onlyPublished?: boolean }} options
 * @returns {Promise<import("@/lib/content-tree").ContentNode[]>}
 */
export async function getContentTree({ ownerId, onlyPublished = false } = /** @type {any} */ ({})) {
  assertNonEmptyString(ownerId, "ownerId");
  // Filtrar no banco é equivalente à poda: um publicado cujo ancestral é rascunho fica órfão
  // e buildTree descarta órfãos.
  const rows = await prisma.content.findMany({
    where: {
      authorId: ownerId,
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
 *
 * `notification` (moderação, RN26): se informada, é gravada **na mesma transação** da escrita, com as
 * regras e o teto de `notify`. Se a escrita falha, nenhuma notificação nasce; se a notificação
 * falha, a escrita é desfeita. A entrada é validada antes de abrir a transação.
 * @param {string} id
 * @param {{
 *   title?: string, slug?: string, body?: string | null, type?: "DOCUMENT" | "COLLECTION",
 *   status?: "DRAFT" | "PUBLISHED", parentId?: string | null, order?: number
 * }} patch
 * @param {{
 *   limits?: Partial<import("@/lib/limits").Limits>, expectedVersion?: Date | string,
 *   notification?: NotificationInput
 * }} [options]
 * @returns {Promise<import("@/generated/prisma/client").Content>}
 * @throws {DataError}
 */
export async function updateContent(id, patch, { limits, expectedVersion, notification } = {}) {
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
  const parsedNotification = notification === undefined ? null : parseNotificationInput(notification);
  const now = new Date();

  const updated = await guarded(() =>
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

      const saved = await tx.content.update({ where: { id }, data });
      if (parsedNotification) await writeNotification(tx, parsedNotification, now);
      return saved;
    }),
  );
  if (parsedNotification) await pruneNotificationsLazily(now);
  return updated;
}

/**
 * Exclui o conteúdo e todos os seus descendentes (RN07), por exclusão em cascata no banco.
 * A confirmação explícita é responsabilidade do painel.
 *
 * `notification` (moderação, RN26): se informada, é gravada na mesma transação da exclusão, com as
 * regras e o teto de `notify`; se a notificação falha, nada é excluído; se a exclusão falha
 * (`NOT_FOUND`), nenhuma notificação nasce.
 * @param {string} id
 * @param {{ notification?: NotificationInput }} [options]
 * @returns {Promise<{ id: string }>}
 * @throws {DataError} `NOT_FOUND`, `INVALID_INPUT`, `AUTHOR_NOT_FOUND` (dono da notificação inexistente)
 */
export async function deleteContent(id, { notification } = {}) {
  const parsedNotification = notification === undefined ? null : parseNotificationInput(notification);
  const now = new Date();
  await guarded(() =>
    prisma.$transaction(async (tx) => {
      await tx.content.delete({ where: { id } });
      if (parsedNotification) await writeNotification(tx, parsedNotification, now);
    }),
  );
  if (parsedNotification) await pruneNotificationsLazily(now);
  return { id };
}

/**
 * Reordena e/ou move conteúdos em **uma transação** (tudo ou nada; RN05, RN06). Os itens são
 * aplicados em sequência e cada um é validado contra o estado resultante dos anteriores:
 * pai existente, do mesmo dono e COLLECTION (RN02, RN13), sem ciclo (RN06), ordem inteira não
 * negativa (RN05) e slug único no destino (RN03). `parentId` omitido mantém o pai atual.
 *
 * O `ownerId` é obrigatório (`INVALID_INPUT` se faltar): só os conteúdos desse dono são visíveis
 * ao lote, e um item que não é dele responde `NOT_FOUND`, como se não existisse.
 * @param {Array<{ id: string, parentId?: string | null, order: number }>} items
 * @param {{ ownerId: string }} options
 * @returns {Promise<Array<{ id: string, parentId: string | null, order: number }>>}
 * @throws {DataError}
 */
export async function reorderContents(items, { ownerId } = /** @type {any} */ ({})) {
  if (!Array.isArray(items)) {
    throw new DataError("INVALID_INPUT", "O lote deve ser uma lista.", { field: "items" });
  }
  assertNonEmptyString(ownerId, "ownerId");
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
        where: { authorId: ownerId },
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
 * as sessões, as contas, a aparência, o rodapé, as imagens (avatar, logo e favicon dele), as
 * notificações e a verificação pendente e, por último, o usuário. Se algo falhar, nada muda: o usuário não fica sem credencial, como ocorria ao chamar o
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
      // As imagens do usuário (o avatar é dado pessoal, LGPD) saem explicitamente, na mesma
      // transação; a transferência de conteúdo acima não as toca (ADR-034).
      await deleteOwnedImagesIn(tx, userId);
      // Sessões, contas, aparência, rodapé e notificações saem pela cascata das chaves estrangeiras.
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
 * Devolve também o `avatarImageId` (nulo sem avatar), que a interface serve em `/media/<id>`.
 * @returns {Promise<Array<{ id: string, handle: string, name: string, description: string | null, avatarImageId: string | null }>>}
 */
export async function listPublicSpaces({ now = new Date() } = {}) {
  const users = await prisma.user.findMany({
    where: {
      handle: { not: null },
      ...notSuspended(now),
      contents: { some: { parentId: null, status: "PUBLISHED" } },
    },
    select: {
      id: true,
      name: true,
      handle: true,
      avatarImageId: true,
      appearance: { select: { siteName: true, siteDescription: true } },
    },
  });
  return users
    .map((user) => ({
      id: user.id,
      handle: /** @type {string} */ (user.handle),
      // O diretório lista pessoas: sem nome próprio no espaço, vale o nome do usuário (e não o do
      // site, que apareceria como "Vitrine" em todos; ADR-038, item 8).
      name: user.appearance?.siteName ?? user.name,
      description: user.appearance?.siteDescription ?? null,
      avatarImageId: user.avatarImageId,
    }))
    .sort((a, b) => compareDisplayNames(a.name, b.name) || compareDisplayNames(a.handle, b.handle));
}

// --------------------------------------------------------
// Configuração do site (registro único, RN08) e aparência por dono (RF31, ADR-038)
// --------------------------------------------------------

/** Identificador fixo do único registro de Configuration (mesmo @default do schema). */
export const CONFIGURATION_ID = "default";

/**
 * Paletas padrão (Cap. 5 §5.9, Tabela de paletas padrão; ADR-031). São as mesmas do schema
 * (`Configuration`) e do seed; um teste confere que não divergem. Só o SITE tem padrão: em
 * `Appearance` as cores são anuláveis e nulo significa "herda o site" (ADR-038).
 */
export const DEFAULT_COLORS = Object.freeze({
  primaryColor: "#2563eb",
  secondaryColor: "#1e293b",
  accentColor: "#b45309",
  darkPrimaryColor: "#60a5fa",
  darkSecondaryColor: "#cbd5e1",
  darkAccentColor: "#fbbf24",
});

/** Nome padrão do site (o mesmo `@default` de `Configuration.siteName`). */
export const DEFAULT_SITE_NAME = "Vitrine";

/** As três cores de cada modo: a unidade de herança (ADR-038); vale tudo ou nada. */
const LIGHT_PALETTE = ["primaryColor", "secondaryColor", "accentColor"];
const DARK_PALETTE = ["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"];

/** Campos de cor (as duas paletas). */
const COLOR_FIELDS = [...LIGHT_PALETTE, ...DARK_PALETTE];

/** Campos opcionais comuns ao site e à aparência: cadeia vazia equivale a ausente (RN17). */
const NULLABLE_IDENTITY_FIELDS = ["siteDescription"];

/** Campos obrigatórios do site (têm valor padrão no schema). */
const REQUIRED_SITE_FIELDS = ["siteName", ...COLOR_FIELDS];

/** Campos da aparência que herdam do site quando nulos: o nome e as seis cores (ADR-038). */
const INHERITABLE_FIELDS = ["siteName", ...COLOR_FIELDS];

/** Tamanho máximo do título do diretório (D-38). */
export const DIRECTORY_TITLE_MAX_LENGTH = 40;

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
 * Campos booleanos do pedido: ausente não muda; presente deve ser `true` ou `false`.
 * @param {unknown} patch
 * @param {string[]} fields
 * @returns {Record<string, boolean>}
 */
function buildBooleanData(patch, fields) {
  /** @type {Record<string, boolean>} */
  const data = {};
  for (const field of fields) {
    const value = /** @type {any} */ (patch)?.[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new DataError("INVALID_INPUT", `O campo "${field}" deve ser verdadeiro ou falso.`, { field });
    }
    data[field] = value;
  }
  return data;
}

/**
 * D-34: a barra superior mostra o logo e/ou o nome; os dois desligados é inválido. Avalia o estado
 * RESULTANTE do pedido (o valor gravado mais o `patch`), por isso roda dentro da transação.
 * @param {boolean} showLogo
 * @param {boolean} showName
 */
function assertTopBarVisible(showLogo, showName) {
  if (!showLogo && !showName) {
    throw new DataError("INVALID_INPUT", "Ao menos um entre o logo e o nome deve ficar visível.", { field: "showName" });
  }
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
 * Atualiza a configuração do site (*upsert* no registro único). Aceita identidade, as duas paletas
 * (obrigatórias quando enviadas: o site é a base da herança), `showLogo` e `showName`,
 * `modeIconPair`, `directoryTitle`, o texto do portal (`homeBody`) e o `directoryEnabled`; campos
 * ausentes não mudam e chaves desconhecidas são ignoradas. Nos campos opcionais, cadeia vazia vira
 * `null` (RN17). O logo e o favicon NÃO passam por aqui: são `replaceImage` e `removeImage`. O
 * formato de cor é validado pelo Core.
 *
 * `showLogo` e `showName` não podem ficar ambos falsos: o estado resultante é avaliado dentro da
 * transação (`INVALID_INPUT`, `details.field = "showName"`).
 * @param {Partial<{
 *   siteName: string, siteDescription: string | null, primaryColor: string, secondaryColor: string,
 *   accentColor: string, darkPrimaryColor: string, darkSecondaryColor: string, darkAccentColor: string,
 *   showLogo: boolean, showName: boolean, modeIconPair: import("@/lib/footer-icons").ModeIconPair,
 *   directoryTitle: string, homeBody: string | null, directoryEnabled: boolean
 * }>} patch
 * @returns {Promise<import("@/generated/prisma/client").Configuration>}
 * @throws {DataError} `INVALID_INPUT` para campo obrigatório vazio, de tipo errado ou fora da lista
 */
export async function updateConfiguration(patch) {
  /** @type {Record<string, string | boolean | null>} */
  const data = {
    ...buildTextData(patch, REQUIRED_SITE_FIELDS, [...NULLABLE_IDENTITY_FIELDS, "homeBody"]),
    ...buildBooleanData(patch, ["directoryEnabled", "showLogo", "showName"]),
  };
  const modeIconPair = /** @type {any} */ (patch)?.modeIconPair;
  if (modeIconPair !== undefined) {
    if (!isModeIconPair(modeIconPair)) {
      throw new DataError("INVALID_INPUT", `O par de ícones deve ser um de: ${MODE_ICON_PAIRS.join(", ")}.`, {
        field: "modeIconPair",
      });
    }
    data.modeIconPair = modeIconPair;
  }
  const directoryTitle = /** @type {any} */ (patch)?.directoryTitle;
  if (directoryTitle !== undefined) {
    assertNonEmptyString(directoryTitle, "directoryTitle");
    if (directoryTitle.length > DIRECTORY_TITLE_MAX_LENGTH) {
      throw new DataError(
        "INVALID_INPUT",
        `O título do diretório deve ter de 1 a ${DIRECTORY_TITLE_MAX_LENGTH} caracteres.`,
        { field: "directoryTitle", max: DIRECTORY_TITLE_MAX_LENGTH },
      );
    }
    data.directoryTitle = directoryTitle;
  }

  return guarded(() =>
    prisma.$transaction(async (tx) => {
      if ("showLogo" in data || "showName" in data) {
        const current = await tx.configuration.findUnique({
          where: { id: CONFIGURATION_ID },
          select: { showLogo: true, showName: true },
        });
        assertTopBarVisible(
          /** @type {boolean} */ (data.showLogo ?? current?.showLogo ?? true),
          /** @type {boolean} */ (data.showName ?? current?.showName ?? true),
        );
      }
      return tx.configuration.upsert({
        where: { id: CONFIGURATION_ID },
        update: data,
        create: { id: CONFIGURATION_ID, ...data },
      });
    }),
  );
}

/**
 * Aparência do espaço de um usuário, **crua**, com os nulos (RF31, ADR-038): `null` em `siteName` ou
 * numa cor significa "herda o site". Sem linha, devolve todos os campos herdáveis nulos, `showLogo` e
 * `showName` verdadeiros e `persisted: false`, **sem escrever** no banco (a leitura pública nunca
 * escreve) e sem preencher o nome com o do usuário. Devolve `null` se o usuário não existe. A
 * aparência já mesclada com a do site é `getEffectiveAppearance`.
 * @param {string} ownerId
 * @returns {Promise<(import("@/generated/prisma/client").Appearance & { persisted: boolean }) | null>}
 */
export async function getAppearance(ownerId) {
  assertNonEmptyString(ownerId, "ownerId");
  const row = await prisma.appearance.findUnique({ where: { ownerId } });
  if (row) return { ...row, persisted: true };
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!user) return null;
  return /** @type {any} */ ({
    ownerId,
    siteName: null,
    siteDescription: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    darkPrimaryColor: null,
    darkSecondaryColor: null,
    darkAccentColor: null,
    logoImageId: null,
    faviconImageId: null,
    showLogo: true,
    showName: true,
    createdAt: null,
    updatedAt: null,
    persisted: false,
  });
}

/**
 * Aparência EFETIVA de um usuário: a dele sobre a do site, por unidade de herança (ADR-038), sem
 * escrever (nem a linha do site é criada) e sem o padrão embutido, que é do Core:
 * - a **paleta de cada modo** (as três cores): a do usuário se as três estão definidas, senão a do
 *   site (sem linha do site, os padrões do esquema); os dois modos são independentes;
 * - `siteName`, `logoImageId` e `faviconImageId`: o do usuário, se definido; senão o do site (o logo
 *   e o favicon podem sair `null`: nem o usuário nem o site enviaram imagem);
 * - `showLogo`, `showName`, `siteDescription` e `footerLinks`: **só do usuário**, sem herança;
 * - `inherits`: o que veio do site, para a interface mostrar (`lightPalette`, `darkPalette`,
 *   `siteName`, `logo`, `favicon`).
 * Devolve `null` se o usuário não existe. Leitura consistente (uma transação de leitura).
 * @param {string} userId
 * @returns {Promise<{
 *   ownerId: string, persisted: boolean, siteName: string, siteDescription: string | null,
 *   primaryColor: string, secondaryColor: string, accentColor: string,
 *   darkPrimaryColor: string, darkSecondaryColor: string, darkAccentColor: string,
 *   logoImageId: string | null, faviconImageId: string | null, showLogo: boolean, showName: boolean,
 *   footerLinks: Array<{ id: string, ownerId: string | null, icon: string, url: string, order: number }>,
 *   inherits: { lightPalette: boolean, darkPalette: boolean, siteName: boolean, logo: boolean, favicon: boolean }
 * } | null>}
 */
export async function getEffectiveAppearance(userId) {
  assertNonEmptyString(userId, "userId");
  const [user, row, site, footerLinks] = await prisma.$transaction([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.appearance.findUnique({ where: { ownerId: userId } }),
    prisma.configuration.findUnique({ where: { id: CONFIGURATION_ID } }),
    prisma.footerLink.findMany({ where: { ownerId: userId }, orderBy: FOOTER_ORDER, select: FOOTER_SELECT }),
  ]);
  if (!user) return null;

  /** @type {Record<string, any>} */
  const base = { siteName: DEFAULT_SITE_NAME, ...DEFAULT_COLORS, ...(site ?? {}) };
  /** @type {Record<string, any>} */
  const own = row ?? {};
  const ownLight = LIGHT_PALETTE.every((field) => own[field] != null);
  const ownDark = DARK_PALETTE.every((field) => own[field] != null);
  /** @type {Record<string, string>} */
  const palette = {};
  for (const field of LIGHT_PALETTE) palette[field] = ownLight ? own[field] : base[field];
  for (const field of DARK_PALETTE) palette[field] = ownDark ? own[field] : base[field];

  return /** @type {any} */ ({
    ownerId: userId,
    persisted: row !== null,
    siteName: own.siteName ?? base.siteName,
    siteDescription: own.siteDescription ?? null,
    ...palette,
    logoImageId: own.logoImageId ?? site?.logoImageId ?? null,
    faviconImageId: own.faviconImageId ?? site?.faviconImageId ?? null,
    showLogo: own.showLogo ?? true,
    showName: own.showName ?? true,
    footerLinks,
    inherits: {
      lightPalette: !ownLight,
      darkPalette: !ownDark,
      siteName: own.siteName == null,
      logo: own.logoImageId == null,
      favicon: own.faviconImageId == null,
    },
  });
}

/**
 * Grava a aparência do usuário (*upsert* por dono): a linha nasce no primeiro salvamento, **sem**
 * preencher o `siteName` (nulo herda o nome do site; ADR-038). Aceita `siteName`, as seis cores,
 * `siteDescription`, `showLogo` e `showName`; ausente não muda, `null` (ou cadeia vazia) em
 * `siteName` e nas cores **anula** (volta a herdar). O logo e o favicon NÃO passam por aqui:
 * `replaceImage` e `removeImage`. Regras avaliadas sobre o estado RESULTANTE, dentro da transação:
 * - um modo com uma ou duas cores nulas é inválido (`INVALID_INPUT`, `details.field` igual a
 *   `lightPalette` ou `darkPalette`): ou as três juntas, ou nenhuma (herdar é anular as três);
 * - `showLogo` e `showName` não podem ficar ambos falsos (`INVALID_INPUT`, `details.field` igual a
 *   `showName`).
 * O formato de cor é validado pelo Core.
 * @param {string} ownerId
 * @param {Partial<{
 *   siteName: string | null, siteDescription: string | null, primaryColor: string | null,
 *   secondaryColor: string | null, accentColor: string | null, darkPrimaryColor: string | null,
 *   darkSecondaryColor: string | null, darkAccentColor: string | null,
 *   showLogo: boolean, showName: boolean
 * }>} patch
 * @returns {Promise<import("@/generated/prisma/client").Appearance & { persisted: true }>}
 * @throws {DataError} `NOT_FOUND` (usuário), `INVALID_INPUT`
 */
export async function updateAppearance(ownerId, patch) {
  assertNonEmptyString(ownerId, "ownerId");
  /** @type {Record<string, string | boolean | null>} */
  const data = {
    ...buildTextData(patch, [], [...NULLABLE_IDENTITY_FIELDS, ...INHERITABLE_FIELDS]),
    ...buildBooleanData(patch, ["showLogo", "showName"]),
  };
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!user) throw userNotFound(ownerId);
      const current = await tx.appearance.findUnique({ where: { ownerId } });

      /** @type {Record<string, any>} */
      const next = { ...current, ...data };
      for (const [mode, fields] of /** @type {const} */ ([
        ["lightPalette", LIGHT_PALETTE],
        ["darkPalette", DARK_PALETTE],
      ])) {
        const defined = fields.filter((field) => next[field] != null).length;
        if (defined !== 0 && defined !== fields.length) {
          throw new DataError("INVALID_INPUT", "Uma paleta é definida por inteiro (as três cores) ou herdada (nenhuma).", {
            field: mode,
          });
        }
      }
      assertTopBarVisible(next.showLogo ?? true, next.showName ?? true);

      const row = await tx.appearance.upsert({ where: { ownerId }, update: data, create: { ownerId, ...data } });
      return { ...row, persisted: /** @type {const} */ (true) };
    }),
  );
}

// --------------------------------------------------------
// Imagens (ADR-034, ADR-037): avatar, logo e favicon como BLOB
// --------------------------------------------------------

/** Tipos de imagem (`Image.kind`); o SQLite não os impõe, a camada de dados sim. */
export const IMAGE_KINDS = /** @type {const} */ (["avatar", "logo", "favicon"]);

/** Colunas de uma imagem SEM o conteúdo: nenhuma listagem lê `bytes`; só `getImage` o lê. */
const IMAGE_META_SELECT = {
  id: true,
  kind: true,
  mime: true,
  width: true,
  height: true,
  sha256: true,
  ownerId: true,
  createdAt: true,
};

/**
 * Imagem sem o conteúdo.
 * @typedef {{
 *   id: string, kind: string, mime: string, width: number, height: number, sha256: string,
 *   ownerId: string | null, createdAt: Date
 * }} ImageMeta
 */

/**
 * Dados de uma imagem já reencodada pelo Core (`sharp`): a camada de dados não decodifica nada.
 * @typedef {{ mime: string, bytes: Uint8Array, width: number, height: number, sha256: string }} ImageData
 */

/**
 * Coluna de referência de cada tipo: `User.avatarImageId` no avatar, e `logoImageId` ou
 * `faviconImageId` em `Configuration` (dono nulo) e `Appearance` (dono usuário).
 * @type {Record<string, string>}
 */
const IMAGE_REFERENCE_FIELD = { avatar: "avatarImageId", logo: "logoImageId", favicon: "faviconImageId" };

/** @param {unknown} kind */
function assertImageKind(kind) {
  if (!IMAGE_KINDS.includes(/** @type {any} */ (kind))) {
    throw new DataError("INVALID_INPUT", "O tipo da imagem deve ser avatar, logo ou favicon.", { field: "kind" });
  }
}

/**
 * Dono de uma imagem: o id do usuário ou `null` (o site). O avatar sempre tem dono.
 * @param {string} kind
 * @param {unknown} ownerId
 */
function assertImageOwner(kind, ownerId) {
  if (ownerId === null && kind !== "avatar") return;
  assertNonEmptyString(ownerId, "ownerId");
}

/**
 * Valida o conteúdo de uma imagem, sem tocar o banco.
 * @param {unknown} data
 * @returns {ImageData}
 */
function parseImageData(data) {
  const { mime, bytes, width, height, sha256 } = /** @type {any} */ (data) ?? {};
  if (typeof mime !== "string" || !mime.startsWith("image/")) {
    throw new DataError("INVALID_INPUT", 'O campo "mime" deve ser um tipo de imagem.', { field: "mime" });
  }
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength === 0) {
    throw new DataError("INVALID_INPUT", 'O campo "bytes" deve ter o conteúdo da imagem.', { field: "bytes" });
  }
  for (const [field, value] of /** @type {const} */ ([
    ["width", width],
    ["height", height],
  ])) {
    if (!Number.isInteger(value) || value < 1) {
      throw new DataError("INVALID_INPUT", `O campo "${field}" deve ser um inteiro positivo.`, { field });
    }
  }
  assertNonEmptyString(sha256, "sha256");
  const content = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { mime, bytes: content, width, height, sha256 };
}

/**
 * Grava uma linha de `images`. **Baixo nível:** sozinha deixa a imagem órfã (nenhuma referência
 * aponta para ela). O caminho de escrita das imagens é `replaceImage`, que grava, aponta a
 * referência e apaga a antiga na mesma transação; o Core não deve chamar esta função diretamente.
 * @param {{ kind: string, ownerId: string | null } & ImageData} input
 * @param {Db} [db] cliente de transação de quem chama; sem ele, o cliente comum
 * @returns {Promise<ImageMeta>}
 * @throws {DataError} `INVALID_INPUT`, `AUTHOR_NOT_FOUND` (dono inexistente)
 */
export async function saveImage(input, db = prisma) {
  const { kind, ownerId } = input ?? /** @type {any} */ ({});
  assertImageKind(kind);
  assertImageOwner(kind, ownerId);
  const data = parseImageData(input);
  return guarded(() => db.image.create({ data: { kind, ownerId, ...data }, select: IMAGE_META_SELECT }));
}

/**
 * Imagem com o conteúdo (`bytes`), por id: a única leitura que o traz (`GET /media/<id>`). `null` se
 * não existe.
 * @param {string} id
 * @returns {Promise<(ImageMeta & { bytes: Uint8Array }) | null>}
 */
export async function getImage(id) {
  if (typeof id !== "string" || id === "") return null;
  return prisma.image.findUnique({ where: { id }, select: { ...IMAGE_META_SELECT, bytes: true } });
}

/**
 * Id da imagem que o dono referencia hoje para o tipo (ou `null`). Para o dono usuário, confere que o
 * usuário existe (`NOT_FOUND`).
 * @param {Db} db
 * @param {string} kind
 * @param {string | null} ownerId
 * @returns {Promise<string | null>}
 */
async function readImageReference(db, kind, ownerId) {
  const field = IMAGE_REFERENCE_FIELD[kind];
  if (ownerId !== null) {
    const user = await db.user.findUnique({ where: { id: ownerId }, select: { id: true, avatarImageId: true } });
    if (!user) throw userNotFound(ownerId);
    if (kind === "avatar") return user.avatarImageId;
    const row = await db.appearance.findUnique({
      where: { ownerId },
      select: { logoImageId: true, faviconImageId: true },
    });
    return /** @type {any} */ (row)?.[field] ?? null;
  }
  const row = await db.configuration.findUnique({
    where: { id: CONFIGURATION_ID },
    select: { logoImageId: true, faviconImageId: true },
  });
  return /** @type {any} */ (row)?.[field] ?? null;
}

/**
 * Aponta a referência do dono e do tipo para `imageId` (ou a anula). A linha de `Configuration` ou de
 * `Appearance` é criada, se faltar, apenas para apontar uma imagem.
 * @param {Db} db
 * @param {string} kind
 * @param {string | null} ownerId
 * @param {string | null} imageId
 */
async function writeImageReference(db, kind, ownerId, imageId) {
  const reference = { [IMAGE_REFERENCE_FIELD[kind]]: imageId };
  if (kind === "avatar") {
    await db.user.update({ where: { id: /** @type {string} */ (ownerId) }, data: reference });
  } else if (ownerId === null) {
    await db.configuration.upsert({
      where: { id: CONFIGURATION_ID },
      update: reference,
      create: { id: CONFIGURATION_ID, ...reference },
    });
  } else {
    await db.appearance.upsert({ where: { ownerId }, update: reference, create: { ownerId, ...reference } });
  }
}

/**
 * Troca a imagem do dono e do tipo, **em uma transação**: grava a nova (id novo: a imagem é
 * imutável), aponta a referência e **apaga a antiga**. Se algo falha, nada muda. O dono é o usuário
 * (`avatar`; `logo` e `favicon` da página dele, em `Appearance`) ou `null` (`logo` e `favicon` do
 * site, em `Configuration`). Este é o único caminho de escrita das imagens, e por isso cada
 * referência aponta sempre para uma imagem do mesmo dono e do tipo certo, e não há imagem órfã.
 * @param {"avatar" | "logo" | "favicon"} kind
 * @param {string | null} ownerId
 * @param {ImageData} data conteúdo já reencodado pelo Core
 * @returns {Promise<ImageMeta & { replacedId: string | null }>} a nova imagem (sem `bytes`) e o id da
 *   antiga, que deixou de existir
 * @throws {DataError} `NOT_FOUND` (usuário), `INVALID_INPUT`
 */
export async function replaceImage(kind, ownerId, data) {
  assertImageKind(kind);
  assertImageOwner(kind, ownerId);
  parseImageData(data);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const previous = await readImageReference(tx, kind, ownerId);
      const image = await saveImage({ kind, ownerId, ...data }, tx);
      await writeImageReference(tx, kind, ownerId, image.id);
      if (previous !== null) await tx.image.deleteMany({ where: { id: previous } });
      return { ...image, replacedId: previous };
    }),
  );
}

/**
 * Remove a imagem do dono e do tipo: anula a referência e apaga a imagem, na mesma transação. O logo
 * ou o favicon removido **volta** ao nível de baixo da cadeia (site e, depois, o embutido); nunca
 * fica vazio (ADR-038), o que é do Core e da interface resolver. Sem imagem, não faz nada.
 * @param {"avatar" | "logo" | "favicon"} kind
 * @param {string | null} ownerId
 * @returns {Promise<{ removed: boolean, id: string | null }>}
 * @throws {DataError} `NOT_FOUND` (usuário), `INVALID_INPUT`
 */
export async function removeImage(kind, ownerId) {
  assertImageKind(kind);
  assertImageOwner(kind, ownerId);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const previous = await readImageReference(tx, kind, ownerId);
      if (previous === null) return { removed: false, id: null };
      await writeImageReference(tx, kind, ownerId, null);
      await tx.image.deleteMany({ where: { id: previous } });
      return { removed: true, id: previous };
    }),
  );
}

/**
 * Apaga uma imagem pelo id. As referências a ela viram `null` (`SetNull`), de modo que a operação
 * nunca deixa referência pendente.
 * @param {string} id
 * @returns {Promise<{ id: string }>}
 * @throws {DataError} `NOT_FOUND`
 */
export async function deleteImage(id) {
  assertNonEmptyString(id, "id");
  await guarded(() => prisma.image.delete({ where: { id } }));
  return { id };
}

/**
 * Apaga todas as imagens de um dono (LGPD: o avatar sai com a conta). O banco também o faz pela
 * cascata de `ownerId`; aqui é explícito, na transação de quem chama.
 * @param {Db} db
 * @param {string} ownerId
 * @returns {Promise<{ count: number }>}
 */
async function deleteOwnedImagesIn(db, ownerId) {
  return db.image.deleteMany({ where: { ownerId } });
}

/**
 * Apaga todas as imagens do usuário. A exclusão de usuário (`deleteUser`) já a faz na mesma
 * transação; transferir conteúdo não toca nas imagens.
 * @param {string} ownerId
 * @returns {Promise<{ count: number }>}
 */
export async function deleteOwnedImages(ownerId) {
  assertNonEmptyString(ownerId, "ownerId");
  return guarded(() => deleteOwnedImagesIn(prisma, ownerId));
}

/**
 * Valida e completa a notificação da remoção do avatar (moderação, RN19, RN26): tipo `MODERATION`,
 * gravidade `WARNING`, `data = { event: "AVATAR_REMOVED", reason }`, para o próprio dono do avatar.
 * Só o `reason` é obrigatório; o que vier no pedido não pode contradizer o resto.
 * @param {string} userId
 * @param {unknown} notification
 */
function parseAvatarRemovalNotification(userId, notification) {
  if (notification === null || typeof notification !== "object") {
    throw new DataError("INVALID_INPUT", "A notificação da remoção do avatar é obrigatória.", { field: "notification" });
  }
  const input = /** @type {Record<string, any>} */ (notification);
  const data = input.data !== null && typeof input.data === "object" ? input.data : {};
  /** @type {Array<[string, unknown, unknown]>} */
  const fixed = [
    ["userId", input.userId, userId],
    ["type", input.type, "MODERATION"],
    ["severity", input.severity, "WARNING"],
    ["event", data.event, "AVATAR_REMOVED"],
  ];
  for (const [field, given, expected] of fixed) {
    if (given !== undefined && given !== expected) {
      throw new DataError("INVALID_INPUT", `Na remoção do avatar, "${field}" deve ser ${String(expected)}.`, { field });
    }
  }
  assertNonEmptyString(data.reason, "reason");
  return parseNotificationInput({
    userId,
    type: "MODERATION",
    severity: "WARNING",
    data: { ...data, event: "AVATAR_REMOVED" },
  });
}

/**
 * Remove o avatar de outro usuário (moderação; RN19, RN26): apaga a imagem, anula a referência e
 * grava a notificação ao dono **na mesma transação** (o molde da moderação de conteúdo): se a
 * notificação falha, o avatar permanece; se não há avatar, nenhuma notificação nasce. A autorização
 * (só o administrador) é do Core. Quem remove o PRÓPRIO avatar usa `removeImage("avatar", userId)`.
 * @param {string} userId dono do avatar
 * @param {{ notification: { data: { reason: string }, userId?: string, type?: "MODERATION", severity?: "WARNING" } }} options
 *   `notification.data.reason` é obrigatório; `userId`, `type`, `severity` e `data.event` são
 *   preenchidos aqui e, se vierem, devem ser os fixados
 * @returns {Promise<{ id: string }>} a imagem apagada
 * @throws {DataError} `NOT_FOUND` (usuário ou avatar inexistente), `INVALID_INPUT`
 */
export async function removeAvatar(userId, { notification } = /** @type {any} */ ({})) {
  assertNonEmptyString(userId, "userId");
  const parsed = parseAvatarRemovalNotification(userId, notification);
  const now = new Date();
  const removed = await guarded(() =>
    prisma.$transaction(async (tx) => {
      const imageId = await readImageReference(tx, "avatar", userId);
      if (imageId === null) throw new DataError("NOT_FOUND", "O usuário não tem avatar.", { userId });
      await writeImageReference(tx, "avatar", userId, null);
      await tx.image.deleteMany({ where: { id: imageId } });
      await writeNotification(tx, parsed, now);
      return imageId;
    }),
  );
  await pruneNotificationsLazily(now);
  return { id: removed };
}

// --------------------------------------------------------
// Rodapé por ícones (ADR-035)
// --------------------------------------------------------

/** Ordem de leitura do rodapé de um dono; `id` desempata. */
const FOOTER_ORDER = [{ order: /** @type {const} */ ("asc") }, { id: /** @type {const} */ ("asc") }];
/** Colunas devolvidas de um link do rodapé. */
const FOOTER_SELECT = { id: true, ownerId: true, icon: true, url: true, order: true };

/**
 * `ownerId` de um rodapé: o id do usuário, ou `null` para o rodapé do site. `undefined` é erro, pois o
 * Prisma o trataria como "sem filtro" e leria o rodapé de todos.
 * @param {unknown} ownerId
 */
function assertFooterOwner(ownerId) {
  if (ownerId !== null) assertNonEmptyString(ownerId, "ownerId");
}

/**
 * Rodapé de um dono, na ordem (no máximo 8 links). `null` é o rodapé do site.
 * @param {string | null} ownerId
 * @returns {Promise<Array<{ id: string, ownerId: string | null, icon: string, url: string, order: number }>>}
 */
export async function listFooterLinks(ownerId) {
  assertFooterOwner(ownerId);
  return prisma.footerLink.findMany({ where: { ownerId }, orderBy: FOOTER_ORDER, select: FOOTER_SELECT });
}

/**
 * Valida o lote do rodapé inteiro, sem tocar o banco: no máximo 8 itens, cada um com ícone da lista
 * fechada e URL (o formato é do Core), sem ícone repetido. Um item inválido recusa o lote.
 * @param {unknown} links
 * @returns {Array<{ icon: string, url: string }>}
 */
function parseFooterLinks(links) {
  if (!Array.isArray(links)) {
    throw new DataError("INVALID_INPUT", "O rodapé deve ser uma lista de links.", { field: "links" });
  }
  if (links.length > MAX_FOOTER_LINKS) {
    throw new DataError("INVALID_INPUT", `O rodapé aceita no máximo ${MAX_FOOTER_LINKS} links.`, {
      field: "links",
      max: MAX_FOOTER_LINKS,
    });
  }
  const seen = new Set();
  return links.map((link, index) => {
    const { icon, url } = link ?? {};
    if (!isFooterIcon(icon)) {
      throw new DataError("INVALID_INPUT", "O ícone não está na lista de ícones do rodapé.", { field: "icon", index });
    }
    if (typeof url !== "string" || url.trim() === "") {
      throw new DataError("INVALID_INPUT", 'O campo "url" é obrigatório.', { field: "url", index });
    }
    if (seen.has(icon)) {
      throw new DataError("INVALID_INPUT", "Cada ícone pode aparecer uma só vez no rodapé.", { field: "icon", index });
    }
    seen.add(icon);
    return { icon, url };
  });
}

/**
 * Substitui o rodapé INTEIRO do dono, **em uma transação** (`PUT`): apaga os links atuais e grava os
 * recebidos, renumerando `order` de 0 a n-1 pela ordem recebida (um `order` enviado é ignorado). Um
 * item inválido recusa o lote, e o rodapé anterior permanece. Teto de 8 links e um por ícone; o
 * formato da URL (`https://`, ou `mailto:` no ícone `email`) é validado pelo Core, não aqui. `null`
 * é o rodapé do site. Lista vazia esvazia o rodapé.
 * @param {string | null} ownerId
 * @param {Array<{ icon: string, url: string }>} links
 * @returns {Promise<Array<{ id: string, ownerId: string | null, icon: string, url: string, order: number }>>}
 * @throws {DataError} `INVALID_INPUT` (teto, ícone fora da lista, ícone repetido, URL vazia),
 *   `NOT_FOUND` (usuário)
 */
export async function replaceFooterLinks(ownerId, links) {
  assertFooterOwner(ownerId);
  const parsed = parseFooterLinks(links);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      if (ownerId !== null) {
        const user = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } });
        if (!user) throw userNotFound(ownerId);
      }
      await tx.footerLink.deleteMany({ where: { ownerId } });
      for (const [order, { icon, url }] of parsed.entries()) {
        await tx.footerLink.create({ data: { ownerId, icon, url, order } });
      }
      return tx.footerLink.findMany({ where: { ownerId }, orderBy: FOOTER_ORDER, select: FOOTER_SELECT });
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
 * Entrada de uma notificação (`notify` e a opção `notification` de `updateContent` e `deleteContent`).
 * @typedef {{
 *   userId: string, type: "CONTRAST" | "MODERATION" | "ACCOUNT",
 *   severity?: "INFO" | "WARNING" | "CRITICAL", data?: Record<string, unknown>, dedupeKey?: string | null
 * }} NotificationInput
 */

/**
 * Valida a entrada de uma notificação, sem tocar o banco (um erro de entrada nunca abre transação).
 * @param {NotificationInput} input
 * @returns {{ userId: string, type: string, severity: string, serialized: string, dedupeKey: string | null }}
 * @throws {DataError} `INVALID_INPUT`
 */
function parseNotificationInput(input) {
  const { userId, type, severity = "INFO", data = {}, dedupeKey = null } = input ?? /** @type {any} */ ({});
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
  return { userId, type, severity, serialized, dedupeKey };
}

/**
 * Grava (ou reabre, com `dedupeKey`) a notificação já validada e aplica o teto, dentro da transação
 * `tx` de quem chama.
 * @param {Db} tx
 * @param {ReturnType<typeof parseNotificationInput>} parsed
 * @param {Date} now
 * @returns {Promise<import("@/generated/prisma/client").Notification>}
 */
async function writeNotification(tx, parsed, now) {
  const { userId, type, severity, serialized, dedupeKey } = parsed;
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
}

/**
 * Cria uma notificação para `userId`, ou **reabre** a existente com a mesma `dedupeKey` (RN26): a
 * reabertura zera `readAt` e `resolvedAt`, troca `severity` e `data` e avança `updatedAt`. Sem
 * `dedupeKey`, cada chamada cria uma notificação nova (moderação e conta). O texto exibido não é
 * guardado: o Core o monta a partir de `type` e `data`. Aplica o teto por usuário na mesma
 * transação e dispara a poda preguiçosa (ver `pruneNotifications`).
 * @param {NotificationInput} input
 * @param {{ now?: Date }} [options]
 * @returns {Promise<NotificationView>}
 * @throws {DataError} `INVALID_INPUT`, `AUTHOR_NOT_FOUND` (usuário inexistente)
 */
export async function notify(input, { now = new Date() } = {}) {
  const parsed = parseNotificationInput(input);
  const row = await guarded(() => prisma.$transaction((tx) => writeNotification(tx, parsed, now)));
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
 * Só o dono vê as suas: a função sempre filtra por `userId` (RN19, RN26). O `cursor` só vale se for
 * uma notificação **do próprio usuário**; o de outro usuário ou inexistente lança `INVALID_INPUT`
 * (`details.field: "cursor"`).
 * @param {string} userId
 * @param {{ unreadOnly?: boolean, take?: number, cursor?: string }} [options]
 * @returns {Promise<NotificationView[]>}
 * @throws {DataError} `INVALID_INPUT`
 */
export async function listNotifications(userId, { unreadOnly = false, take = 20, cursor } = {}) {
  assertNonEmptyString(userId, "userId");
  if (!Number.isInteger(take) || take < 1 || take > MAX_NOTIFICATIONS_PER_USER) {
    throw new DataError("INVALID_INPUT", `O campo "take" deve ser um inteiro de 1 a ${MAX_NOTIFICATIONS_PER_USER}.`, {
      field: "take",
    });
  }
  if (cursor) {
    const own = typeof cursor === "string" ? await prisma.notification.count({ where: { id: cursor, userId } }) : 0;
    if (own === 0) {
      throw new DataError("INVALID_INPUT", "O cursor não é uma notificação do usuário.", { field: "cursor" });
    }
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
 * Uma notificação do usuário. `null` se não existe **ou é de outro usuário** (`markRead` devolve
 * `count: 0` nos dois casos e não os distingue).
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<NotificationView | null>}
 */
export async function getNotification(userId, id) {
  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(id, "id");
  const row = await prisma.notification.findFirst({ where: { id, userId } });
  return row ? toNotificationView(row) : null;
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
