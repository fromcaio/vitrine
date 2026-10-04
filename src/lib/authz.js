// Autorização por dono (RN01, RN19, RN21, RN23; ADR-023, ADR-029; Cap. 5 §5.6.3): módulo PURO, sem
// Prisma, better-auth nem Next.js, de modo que a matriz inteira é testável sem servidor nem banco
// (CT37). A matriz é uma TABELA papel × recurso × ação; o que a tabela não diz é negado (falha
// fechada): papel desconhecido, ação desconhecida, sessão ausente e recurso sem dono.
//
// Quem chama (o auxiliar de rota, `src/app/api/_lib/route.js`, e as páginas) carrega o recurso,
// monta `{ ownerId }` e aplica a decisão; este módulo nunca consulta o banco.

/** Papéis do plugin `admin` do better-auth (ADR-023). Qualquer outro valor falha fechado. */
export const ROLES = Object.freeze(/** @type {const} */ (["admin", "user"]));

/**
 * Regra de um papel sobre uma ação:
 * - `any`: qualquer recurso (para o administrador, o recurso de outro dono é *moderação*);
 * - `own`: só o recurso cujo dono é o próprio ator;
 * - `none`: nunca.
 * @typedef {"any" | "own" | "none"} Rule
 */

/**
 * Linha da matriz. `scope` distingue a ação sobre um recurso identificado (`resource`, que exige
 * `{ ownerId }`) da ação sobre uma coleção (`collection`: listar e criar, em que o recurso é o
 * próprio ator). Uma ação de recurso chamada sem recurso falha fechada.
 * @typedef {{ scope: "resource" | "collection", admin: Rule, user: Rule }} PolicyRow
 */

/**
 * A matriz (Cap. 5 §5.6.3, Tabela de autorização). O dono de cada recurso é `resource.ownerId`:
 * conteúdo, `authorId`; aparência, notificação e perfil, o próprio usuário.
 *
 * Decisões de política (RN19, aprovadas em 04/10/2026): o administrador *não* edita a aparência nem
 * o perfil de outro usuário e *não* lê as notificações alheias (mínimo privilégio); a suspensão é o
 * recurso contra uma aparência abusiva.
 * @type {Readonly<Record<string, Readonly<PolicyRow>>>}
 */
export const POLICY = deepFreeze({
  // Conteúdo (RF05 a RF07, RF26; moderação da ADR-027)
  "content:list": { scope: "collection", admin: "any", user: "own" }, // o filtro por dono é da consulta
  "content:read": { scope: "resource", admin: "any", user: "own" },
  "content:create": { scope: "collection", admin: "own", user: "own" }, // sempre no próprio nome (RN13)
  "content:update": { scope: "resource", admin: "any", user: "own" }, // inclui estado, pai e ordem
  "content:delete": { scope: "resource", admin: "any", user: "own" },
  "content:reorder": { scope: "resource", admin: "any", user: "own" }, // cada item do lote é verificado
  // Configuração do site (portal, login e painel): só o administrador (RF30, RF31)
  "site:read": { scope: "resource", admin: "any", user: "none" },
  "site:update": { scope: "resource", admin: "any", user: "none" },
  // Aparência do usuário (ADR-025): a de outro responde 403, também para o administrador
  "appearance:read": { scope: "resource", admin: "any", user: "own" },
  "appearance:update": { scope: "resource", admin: "own", user: "own" },
  // Usuários (ADR-023, ADR-027): exclusivos do administrador, salvo o próprio perfil
  "users:list": { scope: "collection", admin: "any", user: "none" },
  "users:create": { scope: "collection", admin: "any", user: "none" },
  "users:read": { scope: "resource", admin: "any", user: "own" },
  "users:update": { scope: "resource", admin: "any", user: "none" }, // nome, handle e papel
  "users:ban": { scope: "resource", admin: "any", user: "none" },
  "users:reset-password": { scope: "resource", admin: "any", user: "none" },
  "users:remove": { scope: "resource", admin: "any", user: "none" },
  // Perfil e senha do próprio usuário (RF28)
  "profile:update": { scope: "resource", admin: "own", user: "own" },
  "profile:change-password": { scope: "resource", admin: "own", user: "own" },
  // Notificações (ADR-026): só as do próprio usuário, inclusive para o administrador
  "notifications:list": { scope: "collection", admin: "own", user: "own" },
  "notifications:update": { scope: "resource", admin: "own", user: "own" },
});

/**
 * Ações permitidas enquanto a senha provisória não foi trocada (RN21): trocar a própria senha e ler
 * o próprio perfil. Todas as demais respondem 403 `PASSWORD_CHANGE_REQUIRED`.
 */
export const ALLOWED_WHILE_MUST_CHANGE = Object.freeze(new Set(["profile:change-password", "users:read"]));

/**
 * Usuário da sessão, como o better-auth o devolve (campos do plugin `admin` e do Vitrine).
 * @typedef {{
 *   id: string, role: string, banned?: boolean | null, banExpires?: Date | string | number | null,
 *   mustChangePassword?: boolean | null
 * }} Actor
 */

/**
 * Recurso-alvo: só o dono importa aqui.
 * @typedef {{ ownerId?: string | null }} Resource
 */

/**
 * Decisão. Negada, traz o status e o código do envelope da ADR-018. Permitida, `foreign` indica que
 * o recurso é de outro dono (só o administrador, por uma regra `any`): é *moderação*, e quem a
 * implementa exige o motivo e notifica o dono (RN19, RN26).
 * @typedef {{ allowed: true, foreign: boolean }
 *   | { allowed: false, status: 401 | 403, code: "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED" }} Decision
 */

/** @type {Readonly<Decision>} */
const UNAUTHENTICATED = Object.freeze({ allowed: false, status: 401, code: "UNAUTHENTICATED" });
/** @type {Readonly<Decision>} */
const FORBIDDEN = Object.freeze({ allowed: false, status: 403, code: "FORBIDDEN" });
/** @type {Readonly<Decision>} */
const PASSWORD_CHANGE_REQUIRED = Object.freeze({ allowed: false, status: 403, code: "PASSWORD_CHANGE_REQUIRED" });

/**
 * Suspensão vigente (RN23): `banned` e sem prazo, ou com prazo ainda por vencer. O better-auth só
 * limpa `banned` no próximo login, de modo que o prazo vencido não pode contar como suspensão.
 * @param {Pick<Actor, "banned" | "banExpires">} actor
 * @param {Date} [now]
 */
export function isSuspended(actor, now = new Date()) {
  if (!actor.banned) return false;
  if (actor.banExpires === null || actor.banExpires === undefined) return true;
  const expires = new Date(actor.banExpires).getTime();
  // Uma data ilegível não pode devolver o acesso: conta como suspensão sem prazo.
  return Number.isNaN(expires) || expires > now.getTime();
}

/** @param {unknown} value */
function isNonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

/**
 * Decide se `actor` pode executar `action` sobre `resource`. Ordem da decisão: sessão e suspensão
 * (401), senha provisória (403), papel, ação e dono (403).
 * @param {Actor | null | undefined} actor usuário da sessão, ou nulo
 * @param {string} action chave de `POLICY`
 * @param {Resource} [resource] recurso-alvo; omitido nas ações de coleção
 * @param {{ now?: Date }} [options]
 * @returns {Decision}
 */
export function authorize(actor, action, resource, { now = new Date() } = {}) {
  if (!actor || typeof actor !== "object" || !isNonEmptyString(actor.id)) return UNAUTHENTICATED;
  if (isSuspended(actor, now)) return UNAUTHENTICATED;
  if (actor.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.has(action)) return PASSWORD_CHANGE_REQUIRED;

  // Só os dois papéis do plugin valem; "admin,user", "Admin" e outros valores falham fechados.
  if (!ROLES.includes(/** @type {any} */ (actor.role))) return FORBIDDEN;
  if (!Object.hasOwn(POLICY, action)) return FORBIDDEN;
  const row = POLICY[action];
  const rule = row[/** @type {"admin" | "user"} */ (actor.role)];

  if (rule === "none") return FORBIDDEN;

  if (row.scope === "collection") {
    // Ação de coleção: o recurso é o próprio ator. `any` vale para qualquer dono (o filtro é da
    // consulta); `own` não aceita um dono diferente se o chamador o informar.
    if (rule === "any") return { allowed: true, foreign: false };
    if (resource !== undefined && resource.ownerId !== undefined && resource.ownerId !== actor.id) return FORBIDDEN;
    return { allowed: true, foreign: false };
  }

  // Ação de recurso: sem dono conhecido, nunca casa (uma ação de recurso sem recurso falha fechada).
  const ownerId = resource?.ownerId;
  if (!isNonEmptyString(ownerId)) return FORBIDDEN;
  if (ownerId === actor.id) return { allowed: true, foreign: false };
  if (rule === "any") return { allowed: true, foreign: true };
  return FORBIDDEN;
}

/**
 * Congela a tabela inteira, para que nenhum código altere a política em tempo de execução.
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  for (const inner of Object.values(/** @type {any} */ (value))) {
    if (inner && typeof inner === "object") deepFreeze(inner);
  }
  return Object.freeze(value);
}
