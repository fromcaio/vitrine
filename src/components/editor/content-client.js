// Cliente da API de conteúdo para o editor (M09; Cap. 5 §5.10, ADR-018): cria (POST) ou atualiza
// (PATCH) um conteúdo e traduz a resposta em um resultado que o editor sabe mostrar. O envio
// substitui o conteúdo vigente, sem histórico de versões (D-15).
//
// Não escreve o autor (RN13: vem da sessão no servidor) nem guarda credenciais: o navegador
// envia o cookie de sessão por conta própria.

/**
 * Erro de um campo, para mostrar junto dele. `suggestion` é um slug livre (UC05, fluxo A1).
 * @typedef {{ field: string, message: string, suggestion?: string }} FieldError
 */

/**
 * Resultado de um envio.
 * - `unauthenticated`: 401, sessão ausente ou expirada
 * - `not-found`: 404, o conteúdo não existe mais
 * - `conflict`: 409, slug já usado entre irmãos
 * - `validation`: 422 ou 400, dado recusado pelo servidor
 * - `server`: 5xx
 * - `network`: sem resposta (rede fora do ar)
 * @typedef {{ ok: true, id: string, version: string | null }
 *   | { ok: false, kind: "unauthenticated" | "not-found" | "conflict" | "validation" | "server" | "network", message: string, fieldErrors: FieldError[] }} SaveResult
 */

// Textos neutros: quem sabe se o rascunho foi salvo neste navegador é o editor, que os completa.
const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo e envie outra vez.",
  "not-found": "Este conteúdo não existe mais; talvez tenha sido excluído.",
  conflict: "Já existe um conteúdo com este endereço (slug) na mesma coleção.",
  validation: "O servidor recusou alguns dados. Corrija os campos indicados e envie de novo.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * @param {"unauthenticated" | "not-found" | "conflict" | "validation" | "server" | "network"} kind
 * @param {Partial<{ message: string, fieldErrors: FieldError[] }>} [extra]
 * @returns {SaveResult}
 */
function failure(kind, extra = {}) {
  return { ok: false, kind, message: extra.message ?? MESSAGES[kind], fieldErrors: extra.fieldErrors ?? [] };
}

/**
 * Itens de `error.details` da API como erros de campo.
 * @param {unknown} details
 * @returns {FieldError[]}
 */
function fieldErrorsOf(details) {
  if (!Array.isArray(details)) return [];
  /** @type {FieldError[]} */
  const errors = [];
  for (const item of details) {
    if (typeof item !== "object" || item === null) continue;
    const { field, message, suggestion } = /** @type {Record<string, unknown>} */ (item);
    if (typeof field !== "string" || field === "") continue;
    errors.push({
      field,
      message: typeof message === "string" ? message : "Valor recusado.",
      ...(typeof suggestion === "string" ? { suggestion } : {}),
    });
  }
  return errors;
}

/**
 * Traduz a resposta HTTP da API em um `SaveResult`. Uma resposta que não é JSON (por exemplo, a
 * página de erro de um proxy) vira um erro genérico, sem lançar.
 * @param {Response} response
 * @returns {Promise<SaveResult>}
 */
export async function interpretResponse(response) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    const data = body?.data;
    if (typeof data?.id !== "string") return failure("server");
    return { ok: true, id: data.id, version: typeof data.updatedAt === "string" ? data.updatedAt : null };
  }

  const error = body?.error;
  const message = typeof error?.message === "string" ? error.message : undefined;
  const fieldErrors = fieldErrorsOf(error?.details);

  if (response.status === 401) return failure("unauthenticated");
  if (response.status === 404) return failure("not-found");
  if (response.status === 409) {
    // O servidor informa o slug recusado e, se houver, uma sugestão livre.
    const slugError = fieldErrors.find((item) => item.field === "slug");
    return failure("conflict", {
      message: message ?? MESSAGES.conflict,
      fieldErrors: [{ field: "slug", message: message ?? MESSAGES.conflict, ...(slugError?.suggestion ? { suggestion: slugError.suggestion } : {}) }],
    });
  }
  if (response.status === 400 || response.status === 422) {
    return failure("validation", { message: response.status === 400 && message ? message : MESSAGES.validation, fieldErrors });
  }
  return failure("server");
}

/**
 * Envia o conteúdo do editor: `POST /api/contents` se ainda não existe, `PATCH
 * /api/contents/:id` se já existe.
 * @param {object} input
 * @param {string | null} input.id identificador do conteúdo; `null` para criar
 * @param {string | null} [input.parentId] coleção pai, só na criação
 * @param {"DOCUMENT" | "COLLECTION"} [input.type] tipo, só na criação
 * @param {import("./draft").EditorValues} input.values campos do formulário
 * @param {typeof fetch} [input.fetchImpl] para testes
 * @returns {Promise<SaveResult>}
 */
export async function saveContent({ id, parentId = null, type = "DOCUMENT", values, fetchImpl = fetch }) {
  const { title, slug, body, status } = values;
  const creating = id === null;
  const url = creating ? "/api/contents" : `/api/contents/${encodeURIComponent(id)}`;
  const payload = creating ? { title, slug, type, parentId, body, status } : { title, slug, body, status };

  try {
    const response = await fetchImpl(url, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await interpretResponse(response);
  } catch {
    return failure("network");
  }
}
