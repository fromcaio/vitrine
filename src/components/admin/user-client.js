// Cliente da API de usuários (RF27; Cap. 5 §5.10; ADR-029): lista, cria, edita, redefine a senha,
// suspende, reativa e exclui, e traduz cada resposta em um resultado que a tela sabe mostrar, com
// mensagens em português (o texto do servidor nunca é repassado). Módulo sem React.
//
// A senha provisória (`temporaryPassword`) vem NESTAS respostas e em nenhuma outra, uma única vez
// (RN21): este módulo a entrega a quem chamou e não a guarda em lugar algum (nem em log).
import { normalizePage, normalizeUser } from "./user-model";

/**
 * @typedef {"unauthenticated" | "forbidden" | "password-change" | "not-found" | "user-conflict" | "last-admin" | "has-content" | "slug-conflict" | "validation" | "no-avatar" | "rate-limited" | "server" | "network"} FailureKind
 * @typedef {{ ok: false, kind: FailureKind, message: string, field?: string, fields?: Record<string, string>, conflicts?: string[] }} Failure
 */

export const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
  forbidden: "Você não tem permissão para esta operação.",
  passwordChange: "Troque a senha provisória antes de gerenciar usuários.",
  notFound: "Este usuário não existe mais; talvez tenha sido excluído em outra aba. A lista foi recarregada.",
  noAvatar: "Este usuário não tem avatar; talvez ele já tenha sido removido. A lista foi recarregada.",
  emailTaken: "Já existe uma conta com este e-mail.",
  handleTaken: "Já existe um usuário com este handle.",
  conflict: "Já existe um usuário com estes dados.",
  lastAdmin: "Este é o último administrador ativo: ele não pode ser rebaixado, suspenso nem excluído. Torne outro usuário administrador antes.",
  hasContent: "Este usuário tem conteúdo. Escolha o que fazer com ele: transferi-lo a outro usuário ou excluí-lo junto.",
  slugConflict: "O destino já tem conteúdo na raiz com o mesmo endereço (slug) de algum item deste usuário. Nada foi alterado. Escolha renomear os itens em conflito ou outro destino.",
  selfAction: "Você não pode fazer isto com a própria conta.",
  rateLimited: "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.",
  rejected: "O servidor não aceitou os dados enviados. Confira os campos e tente de novo.",
  server: "O servidor não conseguiu atender agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

const JSON_HEADERS = { "Content-Type": "application/json" };


/**
 * Os erros de campo de um 422/400/409 (`details: [{ field, message }]`). A mensagem do servidor já é
 * em português e curta; é exibida como TEXTO, junto do campo.
 * @param {unknown} details
 * @returns {Record<string, string>}
 */
function fieldMessages(details) {
  /** @type {Record<string, string>} */
  const fields = {};
  if (!Array.isArray(details)) return fields;
  for (const item of details) {
    if (!item || typeof item !== "object") continue;
    const { field, message } = /** @type {Record<string, unknown>} */ (item);
    if (typeof field === "string" && field !== "" && typeof message === "string") fields[field] ??= message;
  }
  return fields;
}

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
  const details = body?.error?.details;
  /** @param {FailureKind} kind @param {string} message @param {Partial<Failure>} [extra] @returns {Failure} */
  const fail = (kind, message, extra) => ({ ok: false, kind, message, ...extra });
  if (status === 401) return fail("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) {
    if (code === "PASSWORD_CHANGE_REQUIRED") return fail("password-change", MESSAGES.passwordChange);
    return fail("forbidden", code === "FORBIDDEN" && /própria conta/i.test(String(body?.error?.message ?? "")) ? MESSAGES.selfAction : MESSAGES.forbidden);
  }
  if (status === 404) return fail("not-found", MESSAGES.notFound);
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return fail("rate-limited", `${MESSAGES.rateLimited}${wait}`);
  }
  if (status === 409) {
    if (code === "LAST_ADMIN") return fail("last-admin", MESSAGES.lastAdmin);
    if (code === "USER_HAS_CONTENT") return fail("has-content", MESSAGES.hasContent);
    if (code === "SLUG_CONFLICT") {
      const list = Array.isArray(details) ? details.flatMap((d) => (Array.isArray(d?.conflicts) ? d.conflicts : [])) : Array.isArray(details?.conflicts) ? details.conflicts : [];
      const conflicts = list.map((item) => (typeof item === "string" ? item : typeof item?.slug === "string" ? item.slug : "")).filter(Boolean);
      return fail("slug-conflict", MESSAGES.slugConflict, { conflicts });
    }
    if (code === "USER_CONFLICT") {
      const field = typeof details?.[0]?.field === "string" ? details[0].field : "";
      const message = field === "email" ? MESSAGES.emailTaken : field === "handle" ? MESSAGES.handleTaken : MESSAGES.conflict;
      return fail("user-conflict", message, { field });
    }
    return fail("server", MESSAGES.rejected);
  }
  if (status === 400 || status === 422) {
    const fields = fieldMessages(details);
    return fail("validation", MESSAGES.rejected, { fields });
  }
  return fail("server", MESSAGES.server);
}

/**
 * @template T
 * @param {() => Promise<Response>} send
 * @param {(body: any, response: Response) => T} read
 * @returns {Promise<({ ok: true } & T) | Failure>}
 */
async function request(send, read) {
  try {
    const response = await send();
    if (!response.ok) return await failureOf(response);
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { ok: true, ...read(body, response) };
  } catch {
    return { ok: false, kind: "network", message: MESSAGES.network };
  }
}

/** @param {unknown} value */
const temporaryOf = (value) => (typeof value === "string" && value !== "" ? value : null);

/**
 * Uma página de usuários (`GET /api/users`).
 * @param {{ search?: string, limit?: number, offset?: number, fetchImpl?: typeof fetch }} [options]
 */
export function listUsers({ search = "", limit = 50, offset = 0, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search.trim() !== "") params.set("search", search.trim());
  return request(
    () => fetchImpl(`/api/users?${params}`, { cache: "no-store" }),
    (body) => normalizePage(body),
  );
}

/**
 * Cria a conta (`POST /api/users`). A senha provisória só vem aqui.
 * @param {{ email: string, name: string, handle: string | null, role: "admin" | "user" }} input
 * @param {typeof fetch} [fetchImpl]
 */
export function createUser(input, fetchImpl = fetch) {
  return request(
    () => fetchImpl("/api/users", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }),
    (body) => ({ user: normalizeUser(body?.data), temporaryPassword: temporaryOf(body?.data?.temporaryPassword) }),
  );
}

/**
 * Edita nome, handle e papel (`PATCH /api/users/:id`). O e-mail não se edita.
 * @param {string} id
 * @param {{ name?: string, handle?: string | null, role?: "admin" | "user" }} patch
 * @param {typeof fetch} [fetchImpl]
 */
export function updateUser(id, patch, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }),
    (body) => ({ user: normalizeUser(body?.data) }),
  );
}

/**
 * Redefine a senha (`PUT /api/users/:id/password`): o servidor gera a provisória, que vem só aqui.
 * @param {string} id
 * @param {typeof fetch} [fetchImpl]
 */
export function resetPassword(id, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/users/${encodeURIComponent(id)}/password`, { method: "PUT", headers: JSON_HEADERS, body: "{}" }),
    (body) => ({ temporaryPassword: temporaryOf(body?.data?.temporaryPassword) }),
  );
}

/**
 * Suspende (`POST /api/users/:id/ban`) com o motivo e, se houver, o prazo (ISO 8601).
 * @param {string} id
 * @param {{ reason: string, expiresAt: string | null }} input
 * @param {typeof fetch} [fetchImpl]
 */
export function banUser(id, { reason, expiresAt }, fetchImpl = fetch) {
  return request(
    () =>
      fetchImpl(`/api/users/${encodeURIComponent(id)}/ban`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(expiresAt ? { reason, expiresAt } : { reason }),
      }),
    (body) => ({ user: normalizeUser(body?.data) }),
  );
}

/** Reativa (`DELETE /api/users/:id/ban`). @param {string} id @param {typeof fetch} [fetchImpl] */
export function unbanUser(id, fetchImpl = fetch) {
  return request(
    () => fetchImpl(`/api/users/${encodeURIComponent(id)}/ban`, { method: "DELETE" }),
    (body) => ({ user: normalizeUser(body?.data) }),
  );
}

/**
 * Exclui o usuário (`DELETE /api/users/:id`). Sem a escolha e com conteúdo, o servidor responde 409
 * `USER_HAS_CONTENT`. Com `content: "transfer"`, `to` é obrigatório; `onConflict: "rename"` renomeia a raiz
 * conflitante (o padrão do servidor recusa tudo).
 * @param {string} id
 * @param {{ content?: "transfer" | "delete", to?: string, onConflict?: "fail" | "rename" }} [choice]
 * @param {typeof fetch} [fetchImpl]
 */
export function deleteUser(id, choice = {}, fetchImpl = fetch) {
  const params = new URLSearchParams();
  if (choice.content) params.set("content", choice.content);
  if (choice.content === "transfer") {
    if (choice.to) params.set("to", choice.to);
    if (choice.onConflict) params.set("onConflict", choice.onConflict);
  }
  const query = params.toString();
  return request(
    () => fetchImpl(`/api/users/${encodeURIComponent(id)}${query ? `?${query}` : ""}`, { method: "DELETE" }),
    (body) => ({
      content: /** @type {"none" | "transferred" | "deleted"} */ (["none", "transferred", "deleted"].includes(body?.data?.content) ? body.data.content : "none"),
      roots: Number.isInteger(body?.data?.roots) ? body.data.roots : 0,
      renamed: /** @type {{ id: string, from: string, to: string }[]} */ (
        (Array.isArray(body?.data?.renamed) ? body.data.renamed : []).filter((item) => typeof item?.from === "string" && typeof item?.to === "string")
      ),
    }),
  );
}

/**
 * Remove o avatar de OUTRO usuário (`DELETE /api/users/:id/avatar?reason=`; RF36, RN19, RN26): o motivo é
 * obrigatório e o dono é notificado na mesma transação. 204 sem corpo; 404 se o usuário não tem avatar
 * (ou não existe mais).
 * @param {string} id
 * @param {string} reason o motivo, de 1 a 500 caracteres, já aparado
 * @param {typeof fetch} [fetchImpl]
 */
export async function removeAvatar(id, reason, fetchImpl = fetch) {
  const params = new URLSearchParams({ reason });
  const result = await request(
    () => fetchImpl(`/api/users/${encodeURIComponent(id)}/avatar?${params}`, { method: "DELETE" }),
    () => ({}),
  );
  // Aqui o 404 quer dizer, quase sempre, "não há avatar": a mensagem é outra.
  return result.ok || result.kind !== "not-found" ? result : /** @type {Failure} */ ({ ok: false, kind: "no-avatar", message: MESSAGES.noAvatar });
}
