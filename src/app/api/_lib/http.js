// Convenções HTTP da API (Cap. 5 §5.10), compartilhadas por todos os Route Handlers:
// envelope de resposta, formato único de erro, tradução de DataError, leitura do corpo JSON,
// verificação de origem e de sessão. A pasta `_lib` é privada: não gera rota.
import { getSession } from "@/lib/auth";
import { DataError } from "@/lib/db";
import { validate } from "@/lib/validators";

/**
 * Códigos de erro da API (Cap. 5 §5.10).
 * @typedef {"VALIDATION_ERROR" | "UNAUTHENTICATED" | "NOT_FOUND" | "SLUG_CONFLICT" | "INVALID_PARENT" | "CYCLE_DETECTED" | "INTERNAL_ERROR"} ApiErrorCode
 */

/** Erro com resposta HTTP definida; qualquer outro erro vira 500 em `toErrorResponse`. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {ApiErrorCode} code
   * @param {string} message
   * @param {Array<Record<string, unknown>>} [details]
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Respostas da API nunca são guardadas em cache (Cap. 5 §5.7.1).
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Resposta de sucesso: `{ "data": ... }` e, se houver, campos adicionais (ex.: `warnings`).
 * @param {unknown} data
 * @param {{ status?: number, headers?: Record<string, string>, extra?: Record<string, unknown> }} [init]
 */
export function ok(data, { status = 200, headers = {}, extra = {} } = {}) {
  return Response.json({ data, ...extra }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Resposta 204, sem corpo. */
export function noContent() {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/**
 * Tabela de mapeamento de DataError para a resposta HTTP (Cap. 5 §5.10.1.1, `tab:dataerror`).
 * `field` é o campo de entrada associado ao erro, usado em `details`.
 * @type {Record<string, { status: number, code: ApiErrorCode, field: string }>}
 */
export const DATA_ERROR_MAP = {
  NOT_FOUND: { status: 404, code: "NOT_FOUND", field: "id" },
  SLUG_CONFLICT: { status: 409, code: "SLUG_CONFLICT", field: "slug" },
  PARENT_NOT_FOUND: { status: 422, code: "INVALID_PARENT", field: "parentId" },
  PARENT_NOT_COLLECTION: { status: 422, code: "INVALID_PARENT", field: "parentId" },
  CYCLE: { status: 422, code: "CYCLE_DETECTED", field: "parentId" },
  TYPE_HAS_CHILDREN: { status: 422, code: "VALIDATION_ERROR", field: "type" },
  AUTHOR_NOT_FOUND: { status: 422, code: "VALIDATION_ERROR", field: "authorId" },
  INVALID_INPUT: { status: 422, code: "VALIDATION_ERROR", field: "" },
};

const INTERNAL_ERROR = /** @type {const} */ ({
  status: 500,
  code: "INTERNAL_ERROR",
  message: "Erro interno do servidor.",
  details: [],
});

/**
 * @param {unknown} error
 * @returns {error is DataError}
 */
export function isDataError(error) {
  // O nome cobre o caso de o módulo db.js ter sido recarregado em desenvolvimento.
  return error instanceof DataError || /** @type {any} */ (error)?.name === "DataError";
}

/**
 * Traduz um DataError de src/lib/db.js para a resposta da API. Um código desconhecido é tratado
 * como erro interno.
 * @param {DataError} error
 * @returns {{ status: number, code: ApiErrorCode, message: string, details: Array<Record<string, unknown>> }}
 */
export function mapDataError(error) {
  const rule = DATA_ERROR_MAP[error.code];
  if (!rule) return INTERNAL_ERROR;

  const { field: errorField, ...rest } = /** @type {Record<string, unknown>} */ (error.details ?? {});
  const field = typeof errorField === "string" && errorField !== "" ? errorField : rule.field;
  /** @type {Record<string, unknown>} */
  const detail = field ? { field } : {};
  // O valor recusado, quando db.js o informa na chave do próprio campo (ex.: { parentId }).
  if (field && field in rest) {
    detail.value = rest[field];
    delete rest[field];
  }
  Object.assign(detail, rest);

  return {
    status: rule.status,
    code: rule.code,
    message: error.message,
    details: Object.keys(detail).length > 0 ? [detail] : [],
  };
}

/**
 * Tradução única de qualquer erro para a resposta HTTP no formato padrão:
 * `{ "error": { "code", "message", "details" } }`. Erros não previstos são registrados no
 * servidor (RNF14) e respondem 500 com mensagem genérica, sem expor detalhes internos.
 * @param {unknown} error
 * @returns {Response}
 */
export function toErrorResponse(error) {
  /** @type {{ status: number, code: ApiErrorCode, message: string, details: Array<Record<string, unknown>> }} */
  let body;
  if (error instanceof ApiError) {
    body = { status: error.status, code: error.code, message: error.message, details: error.details };
  } else if (isDataError(error)) {
    body = mapDataError(error);
  } else {
    body = INTERNAL_ERROR;
  }
  if (body.status >= 500) console.error("[api] erro não previsto:", error);

  const { status, ...payload } = body;
  return Response.json({ error: payload }, { status, headers: NO_STORE });
}

/**
 * Lê o corpo como JSON. As rotas de escrita aceitam apenas `application/json` (controle de CSRF,
 * Cap. 5 §5.12); outro tipo de conteúdo ou JSON malformado respondem 400.
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
export async function readJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType.trim())) {
    throw new ApiError(400, "VALIDATION_ERROR", "O corpo da requisição deve ser JSON (Content-Type: application/json).");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "JSON malformado no corpo da requisição.");
  }
}

/**
 * Valida a entrada com um esquema de `validators.js`; falha responde 422 com um item de `details`
 * por campo inválido.
 * @template T
 * @param {import("zod").ZodType<T>} schema
 * @param {unknown} input
 * @returns {T}
 */
export function parse(schema, input) {
  const result = validate(schema, input);
  if (!result.ok) {
    throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", result.details);
  }
  return result.data;
}

/**
 * Verificação de origem das mutações (CSRF, Cap. 5 §5.12): a origem informada pelo navegador
 * precisa ser a do próprio site (o host da requisição ou o de BETTER_AUTH_URL). Clientes que não
 * são navegadores não enviam `Origin` nem `Sec-Fetch-Site` e não estão sujeitos a CSRF.
 * @param {Request} request
 */
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }

  /** @type {URL} */
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return false; // inclui "null" (origem opaca)
  }

  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  if (hosts.some((host) => host !== null && host === originUrl.host)) return true;

  const baseUrl = process.env.BETTER_AUTH_URL;
  if (baseUrl) {
    try {
      return new URL(baseUrl).origin === originUrl.origin;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Barreira real da API (RF21, RN01): exige sessão válida no servidor, independente do Proxy.
 * Uma mutação vinda de outra origem não tem o cookie aceito e é tratada como não autenticada.
 * @param {Request} request
 * @param {{ mutation?: boolean }} [options]
 */
export async function requireSession(request, { mutation = false } = {}) {
  if (mutation && !isSameOrigin(request)) {
    throw new ApiError(401, "UNAUTHENTICATED", "Requisição de origem não permitida.");
  }
  const session = await getSession(request.headers);
  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "Autenticação necessária.");
  }
  return session;
}

/**
 * Envolve um Route Handler: valida a sessão ANTES de qualquer ação, resolve `params` (assíncrono
 * no Next.js 16) e converte qualquer erro na resposta padrão.
 * @param {(context: { request: Request, params: Record<string, string>, session: NonNullable<Awaited<ReturnType<typeof getSession>>> }) => Promise<Response>} handler
 * @param {{ mutation?: boolean }} [options] `mutation: true` nas rotas de escrita
 * @returns {(request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>}
 */
export function route(handler, options = {}) {
  return async function routeHandler(request, context) {
    try {
      const session = await requireSession(request, options);
      const params = (await context?.params) ?? {};
      return await handler({ request, params, session });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
