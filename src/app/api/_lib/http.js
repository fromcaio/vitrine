// Convenções HTTP da API (Cap. 5 §5.10), compartilhadas por todos os Route Handlers: envelope de
// resposta, formato único de erro, tradução de DataError, leitura do corpo JSON com limite e
// verificação de origem. A sessão e a autorização por dono estão em ./route.js. A pasta `_lib` é
// privada: não gera rota.
import { DataError } from "@/lib/db";
import { validate } from "@/lib/validators";

/**
 * Códigos de erro da API (Cap. 5 §5.10; ADR-018 e ADR-029).
 * @typedef {"VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED" | "NOT_FOUND"
 *   | "SLUG_CONFLICT" | "INVALID_PARENT" | "CYCLE_DETECTED" | "VERSION_CONFLICT" | "QUOTA_EXCEEDED"
 *   | "PAYLOAD_TOO_LARGE" | "RATE_LIMITED" | "USER_CONFLICT" | "LAST_ADMIN" | "USER_HAS_CONTENT" | "BUSY"
 *   | "CONTENT_TOO_COMPLEX" | "INVALID_IMAGE" | "INTERNAL_ERROR"} ApiErrorCode
 */

/** Erro com resposta HTTP definida; qualquer outro erro vira 500 em `toErrorResponse`. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {ApiErrorCode} code
   * @param {string} message
   * @param {Array<Record<string, unknown>>} [details]
   * @param {Record<string, string>} [headers] cabeçalhos da resposta (ex.: `Retry-After`)
   */
  constructor(status, code, message, details = [], headers = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
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

/** Mensagem do 422 `CONTENT_TOO_COMPLEX` (ADR-033): a UI a mostra ao autor como está. */
export const CONTENT_TOO_COMPLEX_MESSAGE = "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.";

/**
 * 422 `CONTENT_TOO_COMPLEX` (ADR-033): o texto não renderiza dentro do orçamento (tempo, pilha ou exceção
 * do renderizador). Nada é gravado. `field` é `body` (conteúdo) ou `homeBody` (texto do portal).
 * @param {"body" | "homeBody"} field
 * @param {Record<string, unknown>} [extra] ex.: `reason` e `budgetMs`
 */
export function contentTooComplex(field, extra = {}) {
  return new ApiError(422, "CONTENT_TOO_COMPLEX", CONTENT_TOO_COMPLEX_MESSAGE, [{ field, ...extra }]);
}

/**
 * 503 `BUSY` com `Retry-After`: a fila de validações de texto está cheia (ADR-033); repetir é seguro.
 * @param {number} retryAfter segundos
 */
export function renderBusy(retryAfter) {
  return new ApiError(
    503,
    "BUSY",
    "Há validações de texto demais em andamento. Tente de novo em instantes.",
    [],
    { "Retry-After": String(retryAfter) },
  );
}

/**
 * 422 `INVALID_IMAGE` (A-029; ADR-034): a imagem enviada não vale (formato, tamanho, dimensão, arquivo
 * corrompido ou tipo declarado que não confere). `details[0].field` é `file`; a mensagem é em português e
 * NÃO repete o arquivo, o nome nem o tipo enviados.
 * @param {string} message
 */
export function invalidImage(message) {
  return new ApiError(422, "INVALID_IMAGE", message, [{ field: "file" }]);
}

/**
 * 503 `BUSY` com `Retry-After`: já há imagens demais sendo processadas (uma por usuário, duas no servidor;
 * ADR-034, item 4); repetir é seguro.
 * @param {number} retryAfter segundos
 */
export function imageBusy(retryAfter) {
  return new ApiError(503, "BUSY", "Há imagens demais sendo processadas. Tente de novo em instantes.", [], {
    "Retry-After": String(retryAfter),
  });
}

/**
 * Tabela de mapeamento de DataError para a resposta HTTP (Cap. 5 §5.10.1.1, `tab:dataerror`).
 * `field` é o campo de entrada associado ao erro, usado em `details`; `message`, quando presente,
 * substitui o texto de db.js (o pai de outro dono é indistinguível do pai inexistente, RN19).
 * @type {Record<string, { status: number, code: ApiErrorCode, field: string, message?: string }>}
 */
export const DATA_ERROR_MAP = {
  NOT_FOUND: { status: 404, code: "NOT_FOUND", field: "id" },
  SLUG_CONFLICT: { status: 409, code: "SLUG_CONFLICT", field: "slug" },
  PARENT_NOT_FOUND: { status: 422, code: "INVALID_PARENT", field: "parentId" },
  PARENT_NOT_COLLECTION: { status: 422, code: "INVALID_PARENT", field: "parentId" },
  OWNER_MISMATCH: { status: 422, code: "INVALID_PARENT", field: "parentId", message: "O conteúdo pai não existe." },
  CYCLE: { status: 422, code: "CYCLE_DETECTED", field: "parentId" },
  TYPE_HAS_CHILDREN: { status: 422, code: "VALIDATION_ERROR", field: "type" },
  AUTHOR_NOT_FOUND: { status: 422, code: "VALIDATION_ERROR", field: "authorId" },
  INVALID_INPUT: { status: 422, code: "VALIDATION_ERROR", field: "" },
  QUOTA_EXCEEDED: { status: 422, code: "QUOTA_EXCEEDED", field: "" },
  VERSION_CONFLICT: { status: 409, code: "VERSION_CONFLICT", field: "version" },
  USER_HAS_CONTENT: { status: 409, code: "USER_HAS_CONTENT", field: "" },
  USER_CONFLICT: { status: 409, code: "USER_CONFLICT", field: "" },
  LAST_ADMIN: { status: 409, code: "LAST_ADMIN", field: "" },
  BUSY: { status: 503, code: "BUSY", field: "" },
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
 * Item de `details` de um DataError: o campo e o valor recusado, mais o que db.js informa.
 * @param {DataError} error
 * @param {{ field: string }} rule
 * @returns {Record<string, unknown>}
 */
function detailOf(error, rule) {
  const { field: errorField, ...rest } = /** @type {Record<string, unknown>} */ (error.details ?? {});

  // RN18: a versão atual vai em `details[0].value`, para o editor mostrar o texto do servidor.
  if (error.code === "VERSION_CONFLICT") return { field: rule.field, value: rest.currentVersion };

  // RN25: o campo é a cota estourada (`body` ou `contents`); o resto (bytes, total, max) acompanha.
  if (error.code === "QUOTA_EXCEEDED") {
    const { quota, ...numbers } = rest;
    return { field: typeof quota === "string" ? quota : "", ...numbers };
  }

  const field = typeof errorField === "string" && errorField !== "" ? errorField : rule.field;
  /** @type {Record<string, unknown>} */
  const detail = field ? { field } : {};
  // O valor recusado, quando db.js o informa na chave do próprio campo (ex.: { parentId }).
  if (field && field in rest) {
    detail.value = rest[field];
    delete rest[field];
  }
  return Object.assign(detail, rest);
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

  const detail = detailOf(error, rule);
  return {
    status: rule.status,
    code: rule.code,
    message: rule.message ?? error.message,
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
  let headers = {};
  if (error instanceof ApiError) {
    body = { status: error.status, code: error.code, message: error.message, details: error.details };
    headers = error.headers;
  } else if (isDataError(error)) {
    body = mapDataError(error);
  } else {
    body = INTERNAL_ERROR;
  }
  if (body.status >= 500) console.error("[api] erro não previsto:", error);

  const { status, ...payload } = body;
  return Response.json({ error: payload }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Limite do corpo JSON das rotas que não recebem texto longo (usuários, aparência, senha). */
export const DEFAULT_JSON_MAX_BYTES = 64 * 1024;

/**
 * Limite do corpo JSON das rotas que recebem um texto de conteúdo (ADR-029, item 9): duas vezes a
 * cota do corpo mais 64 KiB, folga para o escape do JSON e os demais campos. Acima disso a requisição
 * é recusada com 413 sem ser lida por inteiro; a cota exata, em bytes do texto, é conferida depois
 * (422 `QUOTA_EXCEEDED`, RN25).
 * @param {{ maxBodyBytes: number }} limits
 */
export function contentJsonMaxBytes(limits) {
  return 2 * limits.maxBodyBytes + 64 * 1024;
}

/** @param {number} maxBytes */
function payloadTooLarge(maxBytes) {
  return new ApiError(413, "PAYLOAD_TOO_LARGE", "O corpo da requisição é grande demais.", [
    { field: "body", max: maxBytes },
  ]);
}

/**
 * Lê o corpo em bytes, parando assim que passa de `maxBytes`: a requisição que declara um corpo
 * maior (`Content-Length`) é recusada sem ler nada, e a que não declara (ou mente) é cortada no
 * limite, sem encher a memória.
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array>}
 */
async function readLimitedBytes(request, maxBytes) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body?.cancel().catch(() => {});
    throw payloadTooLarge(maxBytes);
  }
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw payloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Lê o corpo como texto (UTF-8), com o mesmo limite de `readLimitedBytes`.
 * @param {Request} request
 * @param {number} maxBytes
 */
async function readLimitedText(request, maxBytes) {
  return new TextDecoder().decode(await readLimitedBytes(request, maxBytes));
}

/**
 * Lê o corpo como JSON. As rotas de escrita aceitam apenas `application/json` (controle de CSRF,
 * Cap. 5 §5.12); outro tipo de conteúdo ou JSON malformado respondem 400, e um corpo acima do limite,
 * 413 (RN25).
 * @param {Request} request
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<unknown>}
 */
export async function readJson(request, { maxBytes = DEFAULT_JSON_MAX_BYTES } = {}) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType.trim())) {
    throw new ApiError(400, "VALIDATION_ERROR", "O corpo da requisição deve ser JSON (Content-Type: application/json).");
  }
  const text = await readLimitedText(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "JSON malformado no corpo da requisição.");
  }
}

/** Folga fixa das fronteiras e dos cabeçalhos de um corpo `multipart` (A-029): 16 KiB sobre o arquivo. */
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

/**
 * Lê o arquivo de um corpo `multipart/form-data` (rotas de envio de imagem; A-029, ADR-034, item 4): o
 * campo `file`, com os demais campos ignorados e o NOME do arquivo enviado nunca usado. Ordem: tipo do
 * conteúdo (400), leitura com limite (`maxFileBytes` mais a folga das fronteiras; acima, 413 ANTES de
 * decodificar), análise do `multipart` (400 se malformado), presença do campo (422) e o tamanho do
 * arquivo em si (413). O `readJson` não muda: as rotas JSON seguem só com `application/json`.
 * @param {Request} request
 * @param {{ maxFileBytes: number, field?: string }} options
 * @returns {Promise<{ bytes: Uint8Array, type: string }>} os bytes e o tipo DECLARADO pelo cliente (a decisão é do conteúdo)
 */
export async function readFormFile(request, { maxFileBytes, field = "file" }) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;.*\bboundary=/i.test(contentType.trim())) {
    throw new ApiError(400, "VALIDATION_ERROR", "O corpo da requisição deve ser multipart/form-data (Content-Type: multipart/form-data).");
  }
  const raw = await readLimitedBytes(request, maxFileBytes + MULTIPART_OVERHEAD_BYTES);
  /** @type {FormData} */
  let form;
  try {
    form = await new Response(raw, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Corpo multipart malformado.");
  }
  const part = form.get(field);
  if (part === null || typeof part === "string" || typeof part.arrayBuffer !== "function") {
    throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [{ field, message: "Envie o arquivo no campo \"file\"." }]);
  }
  if (part.size > maxFileBytes) throw payloadTooLarge(maxFileBytes);
  return { bytes: new Uint8Array(await part.arrayBuffer()), type: part.type };
}

/**
 * Valida a entrada com um esquema de `validators.js`; falha responde 422 com um item de `details`
 * por campo inválido.
 * @template T
 * @param {import("zod").ZodType<T>} schema
 * @param {unknown} input
 * @param {{ bracketIndexes?: boolean }} [options] ver `validate`
 * @returns {T}
 */
export function parse(schema, input, options) {
  const result = validate(schema, input, options);
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
