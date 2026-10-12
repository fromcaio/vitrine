// Cliente da API de conteúdo para a árvore do painel (RF03, RF06, RF07, RF26; Cap. 5 §5.10): lê a
// árvore, cria coleção, renomeia, publica ou despublica, move, reordena em lote e exclui, e traduz cada
// resposta em um resultado que a árvore sabe mostrar, com mensagens em português. Módulo sem React.
// O servidor é a autoridade (RF21): aqui só se interpreta a resposta.
//
// Moderação (RF34, RN19): o administrador, na árvore de OUTRO usuário (`?ownerId=`), só despublica e
// exclui, sempre com o MOTIVO (`reason`), que o dono vê na notificação; mover, reordenar e publicar no
// conteúdo alheio respondem 403.
//
// Limites do servidor: escritas de conteúdo, 60 por minuto (429); 500 conteúdos por usuário (RN25,
// 422 `QUOTA_EXCEEDED`); árvore até 5 níveis. Um 404 em um nó é "excluído em outra aba".
import { normalizeTree } from "./content-tree-model";

/**
 * @typedef {"unauthenticated" | "forbidden" | "rate-limited" | "not-found" | "slug-conflict" | "quota" | "invalid-parent" | "rejected" | "server" | "network"} FailureKind
 * @typedef {{ ok: false, kind: FailureKind, message: string, suggestion?: string }} Failure
 */

export const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
  forbidden: "Você não tem permissão para esta operação.",
  passwordChange: "Troque a senha provisória antes de editar o conteúdo.",
  rateLimited: "Muitas alterações em pouco tempo. Aguarde um instante e tente de novo.",
  notFound: "Este conteúdo não existe mais; talvez tenha sido excluído em outra aba. A árvore foi recarregada.",
  slugConflict: "Já existe um conteúdo com este slug neste nível.",
  quota: "Você atingiu o limite de conteúdos do seu espaço. Exclua algum para criar outro.",
  invalidParent: "O destino não aceita este conteúdo (precisa ser uma coleção sua, sem formar um ciclo). A árvore foi recarregada.",
  rejected: "O servidor não aceitou o pedido. Recarregue a página e tente de novo.",
  server: "O servidor não conseguiu atender agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * @param {Response} response
 * @returns {Promise<Failure>}
 */
async function failureOf(response) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const status = response.status;
  const code = typeof body?.error?.code === "string" ? body.error.code : "";
  /** @param {FailureKind} kind @param {string} message @param {Partial<Failure>} [extra] @returns {Failure} */
  const fail = (kind, message, extra) => ({ ok: false, kind, message, ...extra });
  if (status === 401) return fail("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) return fail("forbidden", code === "PASSWORD_CHANGE_REQUIRED" ? MESSAGES.passwordChange : MESSAGES.forbidden);
  if (status === 404) return fail("not-found", MESSAGES.notFound);
  if (status === 409 && code === "SLUG_CONFLICT") {
    const suggestion = body?.error?.details?.[0]?.suggestion;
    return fail("slug-conflict", MESSAGES.slugConflict, typeof suggestion === "string" && suggestion !== "" ? { suggestion } : undefined);
  }
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return fail("rate-limited", `${MESSAGES.rateLimited}${wait}`);
  }
  if (status === 422 && code === "QUOTA_EXCEEDED") return fail("quota", MESSAGES.quota);
  if (status === 422 && (code === "INVALID_PARENT" || code === "CYCLE_DETECTED")) return fail("invalid-parent", MESSAGES.invalidParent);
  if (status === 422 || status === 400) {
    const reason = Array.isArray(body?.error?.details) ? body.error.details.find((item) => item?.field === "reason" && typeof item?.message === "string") : null;
    if (reason) return fail("rejected", reason.message);
  }
  if (status === 400 || status === 409 || status === 422) return fail("rejected", MESSAGES.rejected);
  return fail("server", MESSAGES.server);
}

/**
 * @template T
 * @param {() => Promise<Response>} send
 * @param {(body: any) => T} read o que extrair de uma resposta ok
 * @returns {Promise<({ ok: true } & T) | Failure>}
 */
async function request(send, read) {
  try {
    const response = await send();
    if (!response.ok) return await failureOf(response);
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { ok: true, ...read(body) };
  } catch {
    return { ok: false, kind: "network", message: MESSAGES.network };
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * A árvore do dono da sessão, com os rascunhos (`GET /api/contents`).
 * @param {typeof fetch} [fetchImpl] para testes
 * @param {string} [ownerId] a árvore de outro usuário (só o administrador; moderação)
 */
export function fetchTree(fetchImpl = fetch, ownerId = undefined) {
  const url = ownerId ? `/api/contents?ownerId=${encodeURIComponent(ownerId)}` : "/api/contents";
  return request(
    () => fetchImpl(url, { cache: "no-store" }),
    (body) => ({ tree: normalizeTree(body?.data) }),
  );
}

/**
 * Cria uma coleção (`POST /api/contents`), no fim do nível do pai.
 * @param {{ title: string, slug: string, parentId: string | null }} input
 * @param {typeof fetch} [fetchImpl] para testes
 */
export function createCollection({ title, slug, parentId }, fetchImpl = fetch) {
  return request(
    () => fetchImpl("/api/contents", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title: title.trim(), slug, type: "COLLECTION", parentId }) }),
    (body) => ({ id: typeof body?.data?.id === "string" ? body.data.id : null }),
  );
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @param {typeof fetch} [fetchImpl]
 */
function patch(id, patch, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/contents/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }),
    () => ({}),
  );
}

/** Publica ou despublica (RF26, RN16). @param {string} id @param {"PUBLISHED" | "DRAFT"} status @param {typeof fetch} [fetchImpl] */
export const setStatus = (id, status, fetchImpl) => patch(id, { status }, fetchImpl);

/** Move para o fim de outra coleção, ou da raiz com `null` (RF07). @param {string} id @param {string | null} parentId @param {typeof fetch} [fetchImpl] */
export const moveTo = (id, parentId, fetchImpl) => patch(id, { parentId }, fetchImpl);

/**
 * Renomeia uma coleção (RF07): o título e/ou o slug (o endereço acompanha o slug, RN04). Envia SÓ os
 * campos que mudaram (`title`, `slug` ou os dois) e nunca `version` (título e endereço não são corpo).
 * O servidor trata a mudança como estrutural e revalida o espaço; um slug repetido entre irmãos
 * responde 409 (`slug-conflict`, com a sugestão).
 * @param {string} id
 * @param {{ title?: string, slug?: string }} fields só os campos que mudaram
 * @param {typeof fetch} [fetchImpl]
 */
export function renameContent(id, { title, slug }, fetchImpl) {
  /** @type {Record<string, string>} */
  const changes = {};
  if (title !== undefined) changes.title = title.trim();
  if (slug !== undefined) changes.slug = slug;
  return patch(id, changes, fetchImpl);
}

/**
 * Grava a ordem de um nível (`PATCH /api/contents/reorder`): o lote transacional com todos os irmãos
 * renumerados. Devolve a árvore atualizada.
 * @param {{ id: string, parentId: string | null, order: number }[]} items
 * @param {typeof fetch} [fetchImpl] para testes
 */
export function reorder(items, fetchImpl = fetch) {
  return request(
    () => fetchImpl("/api/contents/reorder", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(items) }),
    (body) => ({ tree: normalizeTree(body?.data) }),
  );
}

/**
 * Moderação: despublica o conteúdo de outro usuário com o motivo (`PATCH` com `{ status: "DRAFT", reason }`).
 * @param {string} id
 * @param {string} reason
 * @param {typeof fetch} [fetchImpl]
 */
export const unpublishWithReason = (id, reason, fetchImpl) => patch(id, { status: "DRAFT", reason }, fetchImpl);

/**
 * Moderação: exclui o conteúdo de outro usuário e os descendentes, com o motivo (`DELETE ?reason=`).
 * @param {string} id
 * @param {string} reason
 * @param {typeof fetch} [fetchImpl]
 */
export function deleteWithReason(id, reason, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/contents/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }),
    () => ({}),
  );
}

/** Exclui o nó e os descendentes (RN07). @param {string} id @param {typeof fetch} [fetchImpl] */
export function deleteContent(id, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/contents/${encodeURIComponent(id)}`, { method: "DELETE" }),
    () => ({}),
  );
}
