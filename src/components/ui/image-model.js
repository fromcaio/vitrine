// Modelo do envio de imagens (RF35, RF36, RN29; ADR-034): os formatos, o teto de tamanho, a conferência
// que se faz ANTES de enviar, o endereço `/media/<id>` e as iniciais do avatar. Funções puras, sem React
// nem DOM. O servidor é a autoridade (RF21): decodifica, reencoda e recusa o que não for imagem
// (422 `INVALID_IMAGE`); a conferência daqui só poupa o envio de um arquivo que ele recusaria.

/** RN29: PNG, JPEG ou WebP, nunca SVG nem GIF. */
export const IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
/** O valor do atributo `accept` do seletor de arquivo. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
/** RN29: até 2 MB por envio. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * O que cada tipo de imagem vira no servidor (RN29), para dizer ao autor antes do envio.
 * @type {Readonly<Record<"logo" | "favicon" | "avatar", string>>}
 */
export const IMAGE_RESULT = Object.freeze({
  logo: "O servidor a reduz para no máximo 512 px no maior lado.",
  favicon: "O servidor a transforma em um ícone de 64 × 64 px.",
  avatar: "O servidor a recorta em um quadrado de 256 × 256 px, centralizado.",
});

export const MESSAGES = {
  empty: "O arquivo está vazio.",
  format: "Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.",
  tooLarge: "O arquivo é grande demais. O limite é de 2 MB.",
  unreadable: "Não foi possível ler o arquivo escolhido.",
};

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Confere o arquivo escolhido (formato, tamanho, não vazio) antes de enviá-lo. Devolve a mensagem do
 * problema, ou `null` se pode ir. O formato é o que o navegador declara (`file.type`); a decisão final
 * é do servidor, pelo conteúdo.
 * @param {{ type?: string, size?: number } | null | undefined} file
 * @returns {string | null}
 */
export function checkImageFile(file) {
  if (!file) return MESSAGES.unreadable;
  if (!IMAGE_TYPES.includes(String(file.type ?? "").toLowerCase())) return MESSAGES.format;
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return MESSAGES.empty;
  if (size > IMAGE_MAX_BYTES) return `${MESSAGES.tooLarge} Este arquivo tem ${formatBytes(size)}.`;
  return null;
}

/** O endereço de uma imagem é SEMPRE da mesma origem: `/media/<id>` (ADR-034, item 7). */
const MEDIA_URL = /^\/media\/[A-Za-z0-9_-]+$/;

/**
 * @param {unknown} url
 * @returns {url is string}
 */
export const isMediaUrl = (url) => typeof url === "string" && MEDIA_URL.test(url);

/**
 * O endereço `/media/<id>` de um identificador de imagem, ou `null` sem ele (ou se o identificador
 * não tem forma de identificador).
 * @param {unknown} id
 * @returns {string | null}
 */
export function mediaUrlOfId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return `/media/${id}`;
}

/**
 * As iniciais de um nome, em maiúsculas: a primeira letra da primeira e da última palavra (uma só, se
 * o nome tem uma palavra). Sem nome, "?".
 * @param {unknown} name
 */
export function initialsOf(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(/** @type {string} */ (words.at(-1)))[0] : "";
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}
