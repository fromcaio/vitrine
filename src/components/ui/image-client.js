// Cliente do envio de imagens (RF35, RF36; Cap. 5 `api.tex`, `sec:arq-api-v1`): `PUT` multipart com o
// campo `file` e `DELETE` nas rotas de logotipo, favicon e avatar. Traduz cada resposta em um resultado
// que a tela sabe mostrar, com mensagens em português (o texto do servidor nunca é repassado e o nome
// do arquivo nunca sai do navegador). Módulo sem React.
//
// O endereço devolvido pelo servidor só vale se for `/media/<id>` (mesma origem; a CSP da v1 mantém
// `https:` no `img-src` por causa do Markdown, mas logotipo, favicon e avatar nunca são URL externa).
// Nada é guardado no navegador: o arquivo vai direto no corpo e a resposta é só repassada.
import { isMediaUrl } from "./image-model";

/**
 * @typedef {"unauthenticated" | "forbidden" | "password-change" | "invalid-image" | "too-large" | "rate-limited" | "busy" | "validation" | "not-found" | "server" | "network"} FailureKind
 * @typedef {{ ok: false, kind: FailureKind, message: string }} ImageFailure
 * @typedef {{ ok: true, url: string, id: string, width: number, height: number }} ImageUploaded
 * @typedef {{ upload: (file: File) => Promise<ImageUploaded | ImageFailure>, remove: () => Promise<{ ok: true } | ImageFailure> }} ImageClient
 */

export const MESSAGES = {
  unauthenticated: "Sua sessão expirou. Entre de novo para enviar a imagem.",
  forbidden: "Você não tem permissão para alterar esta imagem.",
  passwordChange: "Troque a senha provisória antes de enviar imagens.",
  invalidImage: "A imagem não foi aceita. Envie um arquivo PNG, JPEG ou WebP válido, de até 2 MB e 25 megapixels.",
  tooLarge: "O arquivo é grande demais. O limite é de 2 MB.",
  rateLimited: "Muitos envios em pouco tempo. Aguarde um instante e tente de novo.",
  busy: "O servidor está processando outras imagens agora. Tente de novo em instantes.",
  validation: "O servidor não aceitou o envio. Escolha o arquivo de novo e tente outra vez.",
  notFound: "Não há imagem para remover.",
  server: "O servidor não conseguiu atender agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

/**
 * Os endereços de envio (Tabela `api-v1`): a imagem do próprio espaço, a do sistema (só o administrador)
 * e o avatar do próprio usuário.
 */
export const IMAGE_ENDPOINTS = Object.freeze({
  page: Object.freeze({ logo: "/api/appearance/logo", favicon: "/api/appearance/favicon" }),
  site: Object.freeze({ logo: "/api/configuration/logo", favicon: "/api/configuration/favicon" }),
  avatar: "/api/users/me/avatar",
});

/** @param {Response} response @param {string} base */
function waitOf(response, base) {
  const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
  return `${base}${wait}`;
}

/**
 * @param {Response} response
 * @returns {Promise<ImageFailure>}
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
  /** @param {FailureKind} kind @param {string} message @returns {ImageFailure} */
  const fail = (kind, message) => ({ ok: false, kind, message });
  if (status === 401) return fail("unauthenticated", MESSAGES.unauthenticated);
  if (status === 403) return code === "PASSWORD_CHANGE_REQUIRED" ? fail("password-change", MESSAGES.passwordChange) : fail("forbidden", MESSAGES.forbidden);
  if (status === 404) return fail("not-found", MESSAGES.notFound);
  if (status === 413) return fail("too-large", MESSAGES.tooLarge);
  if (status === 422 && code === "INVALID_IMAGE") return fail("invalid-image", MESSAGES.invalidImage);
  if (status === 422 || status === 400) return fail("validation", MESSAGES.validation);
  if (status === 429) return fail("rate-limited", waitOf(response, MESSAGES.rateLimited));
  if (status === 503 && code === "BUSY") return fail("busy", waitOf(response, MESSAGES.busy));
  return fail("server", MESSAGES.server);
}

/**
 * O cliente de um endereço de imagem.
 * @param {string} endpoint por exemplo `IMAGE_ENDPOINTS.page.logo`
 * @param {typeof fetch} [fetchImpl] o `fetch` (os testes o simulam); o padrão é o global, lido no momento da chamada
 * @returns {ImageClient}
 */
export function createImageClient(endpoint, fetchImpl) {
  const send = (/** @type {RequestInit} */ init) => (fetchImpl ?? fetch)(endpoint, { credentials: "same-origin", ...init });
  return {
    async upload(file) {
      try {
        const form = new FormData();
        // O nome do arquivo no disco do autor não sai do navegador (o servidor nunca o usa).
        form.append("file", file, "imagem");
        const response = await send({ method: "PUT", body: form });
        if (!response.ok) return await failureOf(response);
        const body = await response.json().catch(() => null);
        const data = body?.data;
        if (!isMediaUrl(data?.url)) return { ok: false, kind: "server", message: MESSAGES.server };
        const dimension = (/** @type {unknown} */ value) => (Number.isInteger(value) && /** @type {number} */ (value) > 0 ? /** @type {number} */ (value) : 0);
        return {
          ok: true,
          url: data.url,
          id: typeof data.id === "string" ? data.id : data.url.slice("/media/".length),
          width: dimension(data.width),
          height: dimension(data.height),
        };
      } catch {
        return { ok: false, kind: "network", message: MESSAGES.network };
      }
    },
    async remove() {
      try {
        const response = await send({ method: "DELETE" });
        return response.ok ? { ok: true } : await failureOf(response);
      } catch {
        return { ok: false, kind: "network", message: MESSAGES.network };
      }
    },
  };
}
