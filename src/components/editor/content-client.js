// Cliente da API de conteúdo para o editor (M09; Cap. 5 §5.10, ADR-018): cria (POST) ou atualiza
// (PATCH) um conteúdo e traduz a resposta em um resultado que o editor sabe mostrar. O envio
// substitui o conteúdo vigente, sem histórico de versões (D-15).
//
// Não escreve o autor (RN13: vem da sessão no servidor) nem guarda credenciais: o navegador
// envia o cookie de sessão por conta própria.
//
// RN18: o PATCH informa `version`, o `updatedAt` do conteúdo que o autor abriu. Se o conteúdo mudou
// depois, o servidor responde 409 VERSION_CONFLICT sem alterar nada; este módulo então busca o
// texto atual (GET) para o editor mostrar os dois textos e deixar o autor escolher qual enviar.

/**
 * Erro de um campo, para mostrar junto dele. `suggestion` é um slug livre (UC05, fluxo A1).
 * @typedef {{ field: string, message: string, suggestion?: string }} FieldError
 */

/**
 * Resultado de um envio.
 * - `unauthenticated`: 401, sessão ausente ou expirada
 * - `forbidden`: 403, sem permissão para este conteúdo (ADR-023) ou senha provisória a trocar
 * - `not-found`: 404, o conteúdo não existe mais
 * - `conflict`: 409 SLUG_CONFLICT, slug já usado entre irmãos
 * - `version-conflict`: 409 VERSION_CONFLICT, o conteúdo mudou no servidor depois de aberto (RN18)
 * - `missing-version`: 422 sem o campo `version` no PATCH do corpo (RN18)
 * - `quota`: 422 com o código QUOTA_EXCEEDED (ADR-023) ou 413, conteúdo ou texto acima do limite
 * - `validation`: 422 ou 400, dado recusado pelo servidor
 * - `rate-limited`: 429, envios demais em pouco tempo
 * - `server`: 5xx
 * - `network`: sem resposta (rede fora do ar)
 * @typedef {"unauthenticated" | "forbidden" | "not-found" | "conflict" | "version-conflict" | "missing-version" | "quota" | "validation" | "rate-limited" | "server" | "network"} FailureKind
 */

/**
 * O conteúdo como está no servidor: os campos que o editor altera e a versão (`updatedAt`).
 * @typedef {{ values: import("./draft").EditorValues, version: string }} ServerContent
 */

/**
 * @typedef {{ ok: true, id: string, version: string | null }
 *   | { ok: false, kind: Exclude<FailureKind, "version-conflict">, message: string, fieldErrors: FieldError[] }
 *   | { ok: false, kind: "version-conflict", message: string, fieldErrors: FieldError[],
 *       currentVersion: string | null, server: ServerContent | null }} SaveResult
 */

// Textos neutros: quem sabe se o rascunho foi salvo neste navegador é o editor, que os completa.
// Quando o servidor manda uma mensagem própria (já em português), ela vale mais que estes textos.
const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo e envie outra vez.",
  forbidden: "Este conteúdo é de outro usuário e você não tem permissão para alterá-lo.",
  "not-found": "Este conteúdo não existe mais; talvez tenha sido excluído.",
  conflict: "Já existe um conteúdo com este endereço (slug) na mesma coleção.",
  "version-conflict":
    "Este conteúdo foi alterado no servidor depois de você abri-lo (em outra aba ou pelo administrador). Compare os dois textos e escolha qual enviar.",
  // O 409 aconteceu, mas o GET do texto atual falhou: sem os dois textos, não há o que comparar.
  "version-conflict-unloaded":
    "Este conteúdo foi alterado no servidor depois de você abri-lo, e não foi possível carregar a versão atual para comparar. Envie de novo para tentar outra vez; nada é sobrescrito sem que você veja o outro texto.",
  "missing-version":
    "O envio não informou a versão em que o texto se baseou, e o servidor o recusou. Recarregue a página e envie de novo.",
  quota: "O limite de conteúdos ou o tamanho máximo do texto foi atingido.",
  validation: "O servidor recusou alguns dados. Corrija os campos indicados e envie de novo.",
  "rate-limited": "Muitos envios em pouco tempo. Aguarde um instante e tente de novo.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * @param {Exclude<FailureKind, "version-conflict">} kind
 * @param {Partial<{ message: string, fieldErrors: FieldError[] }>} [extra]
 * @returns {SaveResult}
 */
function failure(kind, extra = {}) {
  return { ok: false, kind, message: extra.message ?? MESSAGES[kind], fieldErrors: extra.fieldErrors ?? [] };
}

/**
 * A versão atual que o servidor informa no 409 VERSION_CONFLICT: `details[0].value` (RN18).
 * @param {unknown} details
 * @returns {string | null}
 */
function currentVersionOf(details) {
  const value = Array.isArray(details) ? details[0]?.value : undefined;
  return typeof value === "string" && value !== "" ? value : null;
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
  if (response.status === 403) {
    // A senha provisória tem texto próprio no servidor; o 403 comum (conteúdo alheio) usa o do editor.
    return failure("forbidden", error?.code === "PASSWORD_CHANGE_REQUIRED" ? { message } : {});
  }
  if (response.status === 404) return failure("not-found");
  if (response.status === 413 || (response.status === 422 && error?.code === "QUOTA_EXCEEDED")) return failure("quota", { message });
  if (response.status === 429) return failure("rate-limited");
  if (response.status === 409 && error?.code === "VERSION_CONFLICT") {
    // A mensagem é a do editor, que diz o que fazer em seguida; o texto do servidor vem do GET.
    return {
      ok: false,
      kind: "version-conflict",
      message: MESSAGES["version-conflict"],
      fieldErrors: [],
      currentVersion: currentVersionOf(error?.details),
      server: null,
    };
  }
  if (response.status === 409) {
    // O servidor informa o slug recusado e, se houver, uma sugestão livre.
    const slugError = fieldErrors.find((item) => item.field === "slug");
    return failure("conflict", {
      message: message ?? MESSAGES.conflict,
      fieldErrors: [{ field: "slug", message: message ?? MESSAGES.conflict, ...(slugError?.suggestion ? { suggestion: slugError.suggestion } : {}) }],
    });
  }
  // RN18: o PATCH do corpo sem `version`. O campo não existe no formulário, então não há onde
  // mostrar o erro junto dele: vale o texto do editor.
  if (response.status === 422 && fieldErrors.some((item) => item.field === "version")) return failure("missing-version");
  if (response.status === 400 || response.status === 422) {
    return failure("validation", { message: response.status === 400 && message ? message : MESSAGES.validation, fieldErrors });
  }
  return failure("server");
}

/**
 * Busca o conteúdo como está no servidor (`GET /api/contents/:id`), para mostrar ao autor o texto
 * que ganhou o conflito de versão. Devolve `null` se não conseguir (404, sem permissão, rede
 * fora): o editor então só avisa, sem oferecer a comparação.
 * @param {string} id
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<ServerContent | null>}
 */
async function loadCurrent(id, fetchImpl) {
  try {
    const response = await fetchImpl(`/api/contents/${encodeURIComponent(id)}`, { method: "GET" });
    if (!response.ok) return null;
    const data = (await response.json())?.data;
    if (typeof data?.updatedAt !== "string") return null;
    return {
      version: data.updatedAt,
      values: {
        title: typeof data.title === "string" ? data.title : "",
        slug: typeof data.slug === "string" ? data.slug : "",
        body: typeof data.body === "string" ? data.body : "",
        status: data.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
      },
    };
  } catch {
    return null;
  }
}

/**
 * Envia o conteúdo do editor: `POST /api/contents` se ainda não existe, `PATCH
 * /api/contents/:id` se já existe. O PATCH leva `version` (RN18): a versão em que o texto se
 * baseou ou, ao reenviar depois de um conflito, a versão atual do servidor, que é a escolha
 * explícita de sobrescrever. Se o servidor responde 409 VERSION_CONFLICT, o resultado traz o texto
 * atual dele (`server`), buscado com um GET.
 * @param {object} input
 * @param {string | null} input.id identificador do conteúdo; `null` para criar
 * @param {string | null} [input.parentId] coleção pai, só na criação
 * @param {"DOCUMENT" | "COLLECTION"} [input.type] tipo, só na criação
 * @param {import("./draft").EditorValues} input.values campos do formulário
 * @param {string | null} [input.version] versão (`updatedAt`) em que o texto se baseou, só no PATCH
 * @param {typeof fetch} [input.fetchImpl] para testes
 * @returns {Promise<SaveResult>}
 */
export async function saveContent({ id, parentId = null, type = "DOCUMENT", values, version = null, fetchImpl = fetch }) {
  const { title, slug, body, status } = values;
  const creating = id === null;
  const url = creating ? "/api/contents" : `/api/contents/${encodeURIComponent(id)}`;
  const payload = creating
    ? { title, slug, type, parentId, body, status }
    : { title, slug, body, status, ...(version === null ? {} : { version }) };

  try {
    const response = await fetchImpl(url, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await interpretResponse(response);
    if (!result.ok && result.kind === "version-conflict" && id !== null) {
      const server = await loadCurrent(id, fetchImpl);
      return { ...result, server, ...(server ? {} : { message: MESSAGES["version-conflict-unloaded"] }) };
    }
    return result;
  } catch {
    return failure("network");
  }
}
