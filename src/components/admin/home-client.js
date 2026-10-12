// Cliente da API da página inicial para o `HomeEditor` (M26; RF42, RN35, RN36; ADR-040): `PUT /api/configuration` (o
// sistema, só o administrador) e `PUT /api/home` (a página do próprio usuário), os dois com o envio PARCIAL (só os
// campos que mudaram) e sem `version` (o último envio vale). Traduz a resposta em um resultado que o editor sabe
// mostrar, com mensagens em português. Módulo sem React. O servidor é a autoridade (RF21): aqui só se interpreta a
// resposta. O envelope é `{ data }` e os erros são `{ error: { code, message, details? } }` (ADR-018).
import { TOO_COMPLEX_MESSAGE, busyMessage } from "@/components/ui/render-errors";

/** @typedef {"sistema" | "pagina"} HomeTarget o sistema (o portal `/`) ou a página do próprio usuário (`/{handle}`) */
/** @typedef {"PUBLISHED" | "DRAFT"} HomeStatus */

/**
 * O registro como a API o devolve (`GET` ou `data` do `PUT`): os campos que o editor usa.
 * @typedef {object} HomeRecord
 * @property {string | null} [homeBody] o texto em Markdown
 * @property {HomeStatus} [homeStatus]
 * @property {boolean} [homeShowItems] a lista de coleções e documentos da raiz (só na página do usuário)
 * @property {boolean} [directoryEnabled] o diretório de espaços (só no sistema)
 * @property {string | null} [directoryTitle] o título do diretório (só no sistema)
 */

/**
 * - `unauthenticated`: 401, sessão ausente ou expirada
 * - `forbidden`: 403, sem permissão (ou senha provisória a trocar)
 * - `quota`: 413, ou 422 `QUOTA_EXCEEDED`, o texto passa do limite
 * - `validation`: 400 ou 422, dado recusado pelo servidor
 * - `rate-limited`: 429, envios demais em pouco tempo
 * - `too-complex`: 422 `CONTENT_TOO_COMPLEX`, o texto não renderiza a tempo (ADR-033)
 * - `busy`: 503 `BUSY`, a fila de validação do servidor está cheia (ADR-033)
 * - `server`: os demais erros do servidor
 * - `network`: sem resposta (rede fora do ar)
 * @typedef {"unauthenticated" | "forbidden" | "quota" | "validation" | "rate-limited" | "too-complex" | "busy" | "server" | "network"} HomeFailureKind
 */

/**
 * Erro de um campo, para mostrar junto dele (`field` é o da API: `homeBody`, `directoryTitle`...).
 * @typedef {{ field: string, message: string }} HomeFieldError
 */

/**
 * @typedef {{ ok: true, data: HomeRecord } | { ok: false, kind: HomeFailureKind, message: string, fieldErrors: HomeFieldError[] }} HomeSaveResult
 */

/** O endereço de cada alvo. */
export const HOME_ENDPOINT = /** @type {const} */ ({ sistema: "/api/configuration", pagina: "/api/home" });

/** Campos a que o servidor pode ligar uma mensagem de erro (`details[].field`). */
const DETAIL_FIELDS = ["homeBody", "homeStatus", "homeShowItems", "directoryEnabled", "directoryTitle"];

export const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo e salve outra vez.",
  forbiddenSistema: "Só o administrador pode alterar a página inicial do sistema.",
  forbiddenPagina: "Você não tem permissão para alterar esta página inicial.",
  tooLarge: "O texto é grande demais para ser enviado.",
  quota: "O tamanho máximo do texto foi atingido.",
  validation: "O servidor recusou alguns dados. Corrija os campos indicados e salve de novo.",
  rateLimited: "Muitas alterações em pouco tempo. Aguarde um instante e tente de novo.",
  tooComplex: "O texto não foi enviado.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * @param {HomeFailureKind} kind
 * @param {string} message
 * @param {HomeFieldError[]} [fieldErrors]
 * @returns {HomeSaveResult}
 */
function failure(kind, message, fieldErrors = []) {
  return { ok: false, kind, message, fieldErrors };
}

/**
 * Traduz a resposta HTTP em um `HomeSaveResult`. Uma resposta que não é JSON (a página de erro de um proxy, por
 * exemplo) vira um erro genérico, sem lançar.
 * @param {Response} response
 * @param {HomeTarget} target
 * @returns {Promise<HomeSaveResult>}
 */
export async function interpretHomeResponse(response, target) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok) {
    return typeof body?.data === "object" && body.data !== null ? { ok: true, data: body.data } : failure("server", MESSAGES.server);
  }

  const status = response.status;
  const error = body?.error;
  const code = typeof error?.code === "string" ? error.code : "";
  if (status === 401) return failure("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) {
    // A senha provisória tem texto próprio no servidor.
    const message = code === "PASSWORD_CHANGE_REQUIRED" && typeof error?.message === "string" ? error.message : undefined;
    return failure("forbidden", message ?? (target === "sistema" ? MESSAGES.forbiddenSistema : MESSAGES.forbiddenPagina));
  }
  if (status === 413) return failure("quota", MESSAGES.quota, [{ field: "homeBody", message: MESSAGES.tooLarge }]);
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return failure("rate-limited", `${MESSAGES.rateLimited}${wait}`);
  }
  // ADR-033: o texto não renderiza a tempo (a mensagem fica junto do texto) ou a fila de validação está cheia.
  if (status === 422 && code === "CONTENT_TOO_COMPLEX") {
    return failure("too-complex", MESSAGES.tooComplex, [{ field: "homeBody", message: TOO_COMPLEX_MESSAGE }]);
  }
  if (status === 503 && code === "BUSY") return failure("busy", busyMessage(response.headers.get("Retry-After")));
  if (status === 400 || status === 422) {
    /** @type {HomeFieldError[]} */
    const fieldErrors = [];
    const details = Array.isArray(error?.details) ? error.details : [];
    for (const detail of details) {
      const message = typeof detail?.message === "string" ? detail.message : null;
      if (!message) continue;
      const field = detail.field === "body" && code === "QUOTA_EXCEEDED" ? "homeBody" : detail.field;
      fieldErrors.push({ field: typeof field === "string" && DETAIL_FIELDS.includes(field) ? field : "", message });
    }
    return failure(code === "QUOTA_EXCEEDED" ? "quota" : "validation", MESSAGES.validation, fieldErrors);
  }
  return failure("server", MESSAGES.server);
}

/**
 * Envia as alterações da página inicial (parcial): `PUT /api/configuration` (sistema) ou `PUT /api/home` (página).
 * @param {object} input
 * @param {HomeTarget} input.target
 * @param {Record<string, string | boolean | null>} input.patch só os campos que mudaram
 * @param {typeof fetch} [input.fetchImpl] para testes
 * @returns {Promise<HomeSaveResult>}
 */
export async function saveHome({ target, patch, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(HOME_ENDPOINT[target], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return await interpretHomeResponse(response, target);
  } catch {
    return failure("network", MESSAGES.network);
  }
}
