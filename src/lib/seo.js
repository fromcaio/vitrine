// Auxiliares de SEO (RF25, RNF07; Cap. 5 §5.11; M12): funções PURAS, sem Next.js nem banco.
//
// - `plainDescription`: o `description` de um documento, o começo do texto SEM a marcação Markdown.
//   Só texto puro: nada de marcação, matemática, bloco de código nem HTML sai daqui.
// - `publicBaseUrl`: a URL pública do site (`BETTER_AUTH_URL`, sem barra final), base do `metadataBase`
//   e das URLs absolutas do mapa do site e do `robots`.

/** Tamanho alvo da descrição, em caracteres (o que os buscadores costumam exibir). */
export const DESCRIPTION_LENGTH = 160;

/**
 * Tira a marcação Markdown (e o HTML, que o site nem renderiza) e devolve o texto corrido, com os
 * espaços colapsados.
 * @param {string} markdown
 * @returns {string}
 */
export function stripMarkdown(markdown) {
  let text = String(markdown).replace(/\r\n?/g, "\n");

  // Blocos inteiros que não são texto: código cercado, matemática em bloco, comentários e HTML.
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:\n[ \t]*\1[^\n]*(?=\n|$)|(?![\s\S]))/gm, "\n");
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<\/?[A-Za-z][^>\n]*>/g, " ");

  // Imagens somem; links e referências ficam só com o texto; autolinks somem.
  text = text.replace(/!\[[^\]\n]*\](?:\([^)\n]*\)|\[[^\]\n]*\])/g, " ");
  text = text.replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1");
  text = text.replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1");
  text = text.replace(/^[ \t]*\[[^\]\n]+\]:[^\n]*$/gm, " ");
  text = text.replace(/\[\^[^\]\n]+\]/g, "");

  // Matemática em linha: some (o texto de um LaTeX não é uma descrição).
  text = text.replace(/(?<![\\$])\$(?!\s)[^$\n]*?(?<!\s)\$(?!\d)/g, " ");

  // Marcas de linha: títulos, citações, listas, tarefas, régua, sublinhado de título e tabela.
  text = text.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, " ");
  text = text.replace(/^[ \t]*(?:=+|-+)[ \t]*$/gm, " ");
  text = text.replace(/^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, " ");
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  text = text.replace(/[ \t]+#+[ \t]*$/gm, "");
  text = text.replace(/^[ \t]*(?:>[ \t]?)+/gm, "");
  text = text.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "");
  text = text.replace(/\|/g, " ");

  // Ênfase e código em linha: ficam o texto e o conteúdo.
  text = text.replace(/`+([^`\n]*)`+/g, "$1");
  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
  text = text.replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=$|[\s).,;:!?])/g, "$1$2");
  text = text.replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=$|[\s).,;:!?])/g, "$1$2");

  // Escapes de barra invertida e espaços.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|~$<>])/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * O `description` de um documento: o começo do texto, sem marcação, com no máximo `max` caracteres,
 * cortado em palavra inteira (e acrescido de reticências quando cortado). Texto vazio ou só de
 * marcação: `null`.
 * @param {string | null | undefined} markdown
 * @param {number} [max]
 * @returns {string | null}
 */
export function plainDescription(markdown, max = DESCRIPTION_LENGTH) {
  if (typeof markdown !== "string" || markdown.trim() === "") return null;
  const text = stripMarkdown(markdown);
  if (text === "") return null;

  const chars = Array.from(text);
  if (chars.length <= max) return text;

  // Reserva uma posição para as reticências e corta na última palavra inteira.
  const head = chars.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.join("").replace(/[\s,;:.\-–—(]+$/u, "")}…`;
}

/**
 * A URL pública do site, sem barra final, ou `null` (sem URL, valem caminhos relativos). Só `http` e
 * `https`; qualquer outra coisa (vazio, `javascript:`, texto) é ignorada.
 * @param {string | null | undefined} [value] o padrão é `BETTER_AUTH_URL`
 * @returns {string | null}
 */
export function publicBaseUrl(value = process.env.BETTER_AUTH_URL) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
