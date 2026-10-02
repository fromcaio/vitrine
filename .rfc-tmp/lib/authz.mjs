// Proposta 5: módulo de políticas puras (código proposto para src/lib/authz.js).
// Sem imports: testável sem servidor nem banco (ADR-023, item 5).

/** Papéis do plugin admin (ADR-023). */
export const ROLES = /** @type {const} */ (["admin", "user"]);

/**
 * Regra por papel: "any" = qualquer recurso; "own" = só o recurso cujo dono é o ator;
 * "none" = nunca. O dono de cada recurso é `resource.ownerId` (conteúdo: authorId; aparência,
 * notificação e perfil: userId).
 * @type {Record<string, { admin: "any" | "own" | "none", user: "any" | "own" | "none" }>}
 */
export const POLICY = {
  // Conteúdo (RF05 a RF07, RF26; moderação da ADR-027)
  "content:list": { admin: "any", user: "own" }, // árvore do painel: o filtro por dono é da consulta
  "content:read": { admin: "any", user: "own" },
  "content:create": { admin: "own", user: "own" }, // sempre no próprio nome (RN13): o dono é o ator
  "content:update": { admin: "any", user: "own" }, // inclui status (despublicar), pai e ordem
  "content:delete": { admin: "any", user: "own" },
  "content:reorder": { admin: "any", user: "own" }, // cada item do lote é verificado
  // Aparência do site (portal, login e painel; só o administrador) e do usuário (ADR-025)
  "site:read": { admin: "any", user: "none" },
  "site:update": { admin: "any", user: "none" },
  "appearance:read": { admin: "any", user: "own" },
  "appearance:update": { admin: "own", user: "own" }, // decisão a ratificar: o admin NÃO edita a aparência alheia
  // Usuários (ADR-023, ADR-027): exclusivos do administrador
  "users:list": { admin: "any", user: "none" },
  "users:create": { admin: "any", user: "none" },
  "users:read": { admin: "any", user: "own" },
  "users:update": { admin: "any", user: "none" }, // nome, handle, papel
  "users:ban": { admin: "any", user: "none" },
  "users:reset-password": { admin: "any", user: "none" },
  "users:remove": { admin: "any", user: "none" },
  // Próprio perfil
  "profile:update": { admin: "own", user: "own" }, // nome de exibição
  "profile:change-password": { admin: "own", user: "own" },
  // Notificações (ADR-026): só o dono; nem o administrador lê as alheias
  "notifications:list": { admin: "own", user: "own" },
  "notifications:update": { admin: "own", user: "own" }, // marcar como lida, dispensar
};

/** Ações permitidas enquanto a senha provisória não foi trocada (proposta 3). */
export const ALLOWED_WHILE_MUST_CHANGE = new Set(["profile:change-password", "users:read"]);

/**
 * @typedef {{ id: string, role: string, banned?: boolean | null, banExpires?: Date | string | null, mustChangePassword?: boolean | null }} Actor
 * @typedef {{ allowed: true } | { allowed: false, status: 401 | 403, code: "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED" }} Decision
 */

/** Suspensão vigente (o plugin só limpa `banned` no próximo login: o prazo vencido não conta). */
export function isSuspended(actor) {
  if (!actor.banned) return false;
  return !actor.banExpires || new Date(actor.banExpires).getTime() > Date.now();
}

/**
 * @param {Actor | null | undefined} actor usuário da sessão, ou nulo
 * @param {string} action chave de POLICY
 * @param {{ ownerId?: string | null }} [resource] recurso alvo (omitido nas ações de coleção)
 * @returns {Decision}
 */
export function authorize(actor, action, resource) {
  if (!actor || isSuspended(actor)) return { allowed: false, status: 401, code: "UNAUTHENTICATED" };
  if (actor.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.has(action)) {
    return { allowed: false, status: 403, code: "PASSWORD_CHANGE_REQUIRED" };
  }
  // só os papéis do plugin valem; qualquer outro valor (inclusive "admin,user") falha fechado
  const rule = (ROLES.includes(actor.role) ? POLICY[action]?.[actor.role] : undefined) ?? "none";
  if (rule === "any") return { allowed: true };
  if (rule === "own" && resource?.ownerId !== undefined && resource.ownerId === actor.id) return { allowed: true };
  // "own" sem recurso (ação de coleção, como listar ou criar) vale para o próprio ator
  if (rule === "own" && resource === undefined) return { allowed: true };
  return { allowed: false, status: 403, code: "FORBIDDEN" };
}
