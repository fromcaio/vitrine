// Cliente do rodapé (RF24, RN17; Cap. 5 `api.tex`, `sec:arq-api-v1`): `PUT` da lista inteira em
// `/api/footer-links` (o rodapé do próprio espaço) ou `/api/configuration/footer-links` (o do sistema,
// só o administrador), com o corpo `{ links: [{ icon, url }] }`; a ordem do vetor é a do rodapé. Traduz a
// resposta em um resultado que a tela sabe mostrar, em português. Um item inválido recusa o lote com 422 e
// um `details` por item (`field` como `links[2].url`): a mensagem de cada um volta indexada pela posição.
// Módulo sem React.
import { MESSAGES as FORM_MESSAGES } from "./appearance-model";

/**
 * @typedef {"unauthenticated" | "forbidden" | "password-change" | "validation" | "too-large" | "rate-limited" | "server" | "network"} FailureKind
 * @typedef {{ ok: false, kind: FailureKind, message: string, rows: Record<number, string> }} FooterFailure
 * @typedef {{ ok: true, links: { icon: string, url: string }[] }} FooterSaved
 * @typedef {{ save: (links: { icon: string, url: string }[]) => Promise<FooterSaved | FooterFailure> }} FooterClient
 */

export const MESSAGES = {
  // O mesmo texto dos formulários de aparência: o `SiteFormFooter` o reconhece e oferece o login.
  unauthenticated: FORM_MESSAGES.unauthenticated,
  forbidden: "Você não tem permissão para editar este rodapé.",
  passwordChange: "Troque a senha provisória antes de editar o rodapé.",
  rejected: "O servidor não aceitou os links. Confira os campos indicados e tente de novo.",
  tooLarge: "A lista de links é grande demais para o servidor.",
  rateLimited: "Muitas tentativas. Aguarde um instante e tente de novo.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/** O endereço de cada rodapé (Tabela `api-v1`): o do próprio espaço e o do sistema. */
export const FOOTER_ENDPOINTS = Object.freeze({ page: "/api/footer-links", site: "/api/configuration/footer-links" });

/**
 * Os erros por item de um 422 (`details: [{ field: "links[2].url", message }]`): a posição e a mensagem
 * do servidor, que é curta e em português e vai para a tela como TEXTO.
 * @param {unknown} details
 * @returns {Record<number, string>}
 */
function rowMessages(details) {
  /** @type {Record<number, string>} */
  const rows = {};
  if (!Array.isArray(details)) return rows;
  for (const item of details) {
    const field = typeof item?.field === "string" ? item.field : "";
    const message = typeof item?.message === "string" ? item.message : "";
    const match = /^links\[(\d+)\]/.exec(field);
    if (match && message) rows[Number(match[1])] ??= message;
  }
  return rows;
}

/**
 * @param {Response} response
 * @returns {Promise<FooterFailure>}
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
  /** @param {FailureKind} kind @param {string} message @param {Record<number, string>} [rows] @returns {FooterFailure} */
  const fail = (kind, message, rows = {}) => ({ ok: false, kind, message, rows });
  if (status === 401) return fail("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) return code === "PASSWORD_CHANGE_REQUIRED" ? fail("password-change", MESSAGES.passwordChange) : fail("forbidden", MESSAGES.forbidden);
  if (status === 413) return fail("too-large", MESSAGES.tooLarge);
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return fail("rate-limited", `${MESSAGES.rateLimited}${wait}`);
  }
  if (status === 422 || status === 400) return fail("validation", MESSAGES.rejected, rowMessages(body?.error?.details));
  return fail("server", MESSAGES.server);
}

/**
 * O cliente de um endereço de rodapé.
 * @param {string} endpoint `FOOTER_ENDPOINTS.page` ou `.site`
 * @param {typeof fetch} [fetchImpl] o `fetch` (os testes o simulam); o padrão é o global, lido na chamada
 * @returns {FooterClient}
 */
export function createFooterClient(endpoint, fetchImpl) {
  return {
    async save(links) {
      try {
        const response = await (fetchImpl ?? fetch)(endpoint, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links }),
        });
        if (!response.ok) return await failureOf(response);
        const body = await response.json().catch(() => null);
        const stored = Array.isArray(body?.data)
          ? body.data.filter((/** @type {any} */ item) => typeof item?.icon === "string" && typeof item?.url === "string").map((/** @type {any} */ item) => ({ icon: item.icon, url: item.url }))
          : links;
        return { ok: true, links: stored };
      } catch {
        return { ok: false, kind: "network", message: MESSAGES.network, rows: {} };
      }
    },
  };
}
