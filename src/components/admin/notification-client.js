// Cliente da API de notificações (RF33, RN26, ADR-026; Cap. 5 §5.10): lista, marca como lida,
// dispensa, marca todas e consulta o contador, e traduz cada resposta em um resultado que o sino e a
// lista sabem mostrar, com mensagens em português. Módulo sem React. O texto de uma notificação vem
// do servidor como TEXTO PURO: quem o exibe o deixa ao React (nunca como HTML).
//
// Limites do servidor: as escritas, 60 por minuto; as leituras seguem o padrão da API. Um cursor
// cujo item foi dispensado entre duas páginas responde 422 (`stale-cursor`): recomece da primeira.

/** Tamanho da página da lista (o padrão do servidor). */
export const PAGE_SIZE = 20;

/** @typedef {"INFO" | "WARNING" | "CRITICAL"} Severity */

/**
 * Notificação como a API a devolve (sem o dono nem a chave de deduplicação).
 * @typedef {object} PublicNotification
 * @property {string} id
 * @property {string} type
 * @property {Severity} severity
 * @property {string} title texto puro, em português
 * @property {string} text texto puro, em português
 * @property {unknown} [data]
 * @property {string | null} readAt
 * @property {string | null} resolvedAt
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {"unauthenticated" | "forbidden" | "rate-limited" | "not-found" | "stale-cursor" | "server" | "network"} FailureKind
 * @typedef {{ ok: false, kind: FailureKind, message: string }} Failure
 */

export const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo para ver as suas notificações.",
  forbidden: "Você não tem permissão para esta operação.",
  passwordChange: "Troque a senha provisória antes de usar as notificações.",
  rateLimited: "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.",
  notFound: "Esta notificação não existe mais; talvez tenha sido dispensada em outra aba.",
  staleCursor: "A lista mudou desde a última página. Ela foi recarregada do início.",
  rejected: "O servidor não aceitou o pedido. Recarregue a página e tente de novo.",
  server: "O servidor não conseguiu atender agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * Notificação saneada: só os campos conhecidos, com os tipos esperados (um item malformado não
 * derruba a lista). `null` se não tem identificador.
 * @param {any} raw
 * @returns {PublicNotification | null}
 */
export function normalizeNotification(raw) {
  if (!raw || typeof raw.id !== "string" || raw.id === "") return null;
  const text = (/** @type {unknown} */ value) => (typeof value === "string" ? value : "");
  const date = (/** @type {unknown} */ value) => (typeof value === "string" ? value : null);
  return {
    id: raw.id,
    type: text(raw.type),
    severity: raw.severity === "WARNING" || raw.severity === "CRITICAL" ? raw.severity : "INFO",
    title: text(raw.title),
    text: text(raw.text),
    data: raw.data,
    readAt: date(raw.readAt),
    resolvedAt: date(raw.resolvedAt),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  };
}

/**
 * @param {Response} response
 * @param {{ cursor?: boolean }} [context] `cursor`: o pedido levava um cursor (o 422 é de cursor velho)
 * @returns {Promise<Failure>}
 */
async function failureOf(response, { cursor = false } = {}) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const status = response.status;
  /** @param {FailureKind} kind @param {string} message @returns {Failure} */
  const fail = (kind, message) => ({ ok: false, kind, message });
  if (status === 401) return fail("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) {
    return fail("forbidden", body?.error?.code === "PASSWORD_CHANGE_REQUIRED" ? MESSAGES.passwordChange : MESSAGES.forbidden);
  }
  if (status === 404) return fail("not-found", MESSAGES.notFound);
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return fail("rate-limited", `${MESSAGES.rateLimited}${wait}`);
  }
  if (status === 422 && cursor) return fail("stale-cursor", MESSAGES.staleCursor);
  if (status === 400 || status === 422) return fail("server", MESSAGES.rejected);
  return fail("server", MESSAGES.server);
}

/**
 * @template T
 * @param {() => Promise<Response>} send
 * @param {(body: any) => T} read o que extrair de uma resposta ok
 * @param {{ cursor?: boolean }} [context]
 * @returns {Promise<({ ok: true } & T) | Failure>}
 */
async function request(send, read, context) {
  try {
    const response = await send();
    if (!response.ok) return await failureOf(response, context);
    const body = await response.json().catch(() => null);
    return { ok: true, ...read(body) };
  } catch {
    return { ok: false, kind: "network", message: MESSAGES.network };
  }
}

/** @param {unknown} value */
const countOf = (value) => (Number.isInteger(value) && /** @type {number} */ (value) >= 0 ? /** @type {number} */ (value) : null);

/**
 * Uma página das notificações do usuário (`GET /api/notifications`), das mais recentes às mais antigas.
 * @param {object} [options]
 * @param {boolean} [options.unread] só as não lidas e não resolvidas
 * @param {string | null} [options.cursor] o `nextCursor` da página anterior
 * @param {number} [options.limit] de 1 a 100
 * @param {typeof fetch} [options.fetchImpl] para testes
 */
export function listNotifications({ unread = false, cursor = null, limit = PAGE_SIZE, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unread) params.set("unread", "1");
  if (cursor) params.set("cursor", cursor);
  return request(
    () => fetchImpl(`/api/notifications?${params}`, { cache: "no-store" }),
    (body) => ({
      items: /** @type {PublicNotification[]} */ ((Array.isArray(body?.data) ? body.data : []).map(normalizeNotification).filter(Boolean)),
      unreadCount: countOf(body?.unreadCount),
      nextCursor: typeof body?.nextCursor === "string" && body.nextCursor !== "" ? body.nextCursor : null,
    }),
    { cursor: cursor !== null },
  );
}

/**
 * Só o contador de não lidas (`GET /api/notifications?limit=1`): a consulta leve do sino.
 * @param {typeof fetch} [fetchImpl] para testes
 */
export function fetchUnreadCount(fetchImpl = fetch) {
  return request(
    () => fetchImpl("/api/notifications?limit=1", { cache: "no-store" }),
    (body) => ({ unreadCount: countOf(body?.unreadCount) }),
  );
}

/**
 * Marca uma notificação como lida (idempotente) ou a dispensa.
 * @param {string} id
 * @param {"read" | "dismissed"} action
 * @param {typeof fetch} [fetchImpl] para testes
 */
function update(id, action, fetchImpl = fetch) {
  return request(
    () =>
      fetchImpl(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [action]: true }),
      }),
    (body) => ({ unreadCount: countOf(body?.unreadCount) }),
  );
}

/** @param {string} id @param {typeof fetch} [fetchImpl] */
export const markRead = (id, fetchImpl) => update(id, "read", fetchImpl);
/** @param {string} id @param {typeof fetch} [fetchImpl] */
export const dismissNotification = (id, fetchImpl) => update(id, "dismissed", fetchImpl);

/**
 * Marca todas as suas como lidas (`POST /api/notifications/read-all`).
 * @param {typeof fetch} [fetchImpl] para testes
 */
export function markAllRead(fetchImpl = fetch) {
  return request(
    () => fetchImpl("/api/notifications/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    (body) => ({ count: countOf(body?.data?.count) ?? 0, unreadCount: countOf(body?.unreadCount) }),
  );
}
