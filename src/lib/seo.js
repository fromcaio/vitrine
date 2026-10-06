// Auxiliares de SEO (RF25, RNF07; Cap. 5 §5.11 e §5.12; M12): funções PURAS, sem Next.js nem banco.
//
// - `plainDescription`: o `description` de um documento, o começo do texto SEM a marcação Markdown.
//   Só texto puro: nada de marcação, matemática, bloco de código nem HTML sai daqui.
// - `publicBaseUrl`: a URL pública do site (`BETTER_AUTH_URL`, sem barra final), base do `metadataBase`
//   e das URLs absolutas do mapa do site e do `robots`.
//
// CUSTO (requisito de segurança, R-018): o texto vem do usuário (até 64 KiB desde a ADR-033; 256 KiB nos corpos gravados antes, RN25) e o servidor é um só
// processo Node; `plainDescription` roda a cada regeneração de página. Por isso (1) só o COMEÇO do texto
// é analisado (`ANALYSIS_LIMIT`), pois a descrição precisa de ~160 caracteres; (2) o bloco de código
// cercado sai por uma varredura linear de linhas, sem expressão regular; e (3) NENHUM quantificador de
// expressão regular varre até um delimitador sem limite: todos têm teto (`SPAN`). Resultado: tempo
// proporcional ao começo analisado, qualquer que seja o texto (`tests/core/seo-cost.test.js`).

/** Tamanho alvo da descrição, em caracteres (o que os buscadores costumam exibir). */
export const DESCRIPTION_LENGTH = 160;

/** Quantos caracteres do começo do texto são analisados; o resto nunca é lido por uma expressão regular. */
export const ANALYSIS_LIMIT = 4000;

/**
 * Teto de qualquer trecho entre delimitadores (colchetes, endereço, matemática, comentário, ênfase,
 * código em linha): um trecho maior não é tratado como construção e fica como texto.
 */
export const SPAN = 300;

/** Recuo máximo de uma marca de linha (títulos, listas, cercas); mais que isso nunca muda o resultado. */
const INDENT = 50;

/**
 * Remove os blocos de código cercados (``` ou ~~~; sem fechamento, vai até o fim), por varredura linear:
 * no lugar do bloco fica uma linha vazia.
 * @param {string} text
 */
function removeFencedCode(text) {
  const fenceRe = new RegExp(`^[ \\t]{0,${INDENT}}(\`\`\`|~~~)`);
  /** @type {string[]} */
  const kept = [];
  /** @type {string | null} */
  let open = null;
  for (const line of text.split("\n")) {
    const fence = fenceRe.exec(line)?.[1] ?? null;
    if (open === null) {
      if (fence === null) kept.push(line);
      else {
        open = fence;
        kept.push("");
      }
    } else if (fence === open) {
      open = null;
    }
  }
  return kept.join("\n");
}

/**
 * Tira a marcação Markdown (e o HTML, que o site nem renderiza) e devolve o texto corrido, com os
 * espaços colapsados. Só analisa o começo (`ANALYSIS_LIMIT`).
 * @param {string} markdown
 * @param {number} [limit] janela analisada; só o ensaio de custo muda o padrão (uma janela grande expõe
 *   qualquer quantificador sem teto, que o corte de `ANALYSIS_LIMIT` esconderia)
 * @returns {string}
 */
export function stripMarkdown(markdown, limit = ANALYSIS_LIMIT) {
  let text = removeFencedCode(headOf(markdown, limit).replace(/\r\n?/g, "\n"));

  // Blocos que não são texto: matemática em bloco, comentários e HTML.
  text = text.replace(new RegExp(`\\$\\$[\\s\\S]{0,${SPAN}}?\\$\\$`, "g"), " ");
  text = text.replace(new RegExp(`<!--[\\s\\S]{0,${SPAN}}?-->`, "g"), " ");
  text = text.replace(new RegExp(`</?[A-Za-z][^>\\n]{0,${SPAN}}>`, "g"), " ");

  // Imagens somem; links e referências ficam só com o texto; autolinks somem.
  text = text.replace(new RegExp(`!\\[[^\\]\\n]{0,${SPAN}}\\](?:\\([^)\\n]{0,${SPAN}}\\)|\\[[^\\]\\n]{0,${SPAN}}\\])`, "g"), " ");
  text = text.replace(new RegExp(`\\[([^\\]\\n]{1,${SPAN}})\\]\\([^)\\n]{0,${SPAN}}\\)`, "g"), "$1");
  text = text.replace(new RegExp(`\\[([^\\]\\n]{1,${SPAN}})\\]\\[[^\\]\\n]{0,${SPAN}}\\]`, "g"), "$1");
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}\\[[^\\]\\n]{1,${SPAN}}\\]:[^\\n]{0,${SPAN}}$`, "gm"), " ");
  text = text.replace(new RegExp(`\\[\\^[^\\]\\n]{1,${SPAN}}\\]`, "g"), "");

  // Matemática em linha: some (o texto de um LaTeX não é uma descrição).
  text = text.replace(new RegExp(`(?<![\\\\$])\\$(?!\\s)[^$\\n]{0,${SPAN}}?(?<!\\s)\\$(?!\\d)`, "g"), " ");

  // Marcas de linha: títulos, citações, listas, tarefas, régua, sublinhado de título e tabela.
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}(?:[-*_][ \\t]{0,${INDENT}}){3,${SPAN}}$`, "gm"), " ");
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}(?:=+|-+)[ \\t]{0,${INDENT}}$`, "gm"), " ");
  text = text.replace(
    new RegExp(`^[ \\t]{0,${INDENT}}\\|?[ \\t]{0,${INDENT}}:?-{1,${SPAN}}:?[ \\t]{0,${INDENT}}(?:\\|[ \\t]{0,${INDENT}}:?-{1,${SPAN}}:?[ \\t]{0,${INDENT}}){0,${SPAN}}\\|?[ \\t]{0,${INDENT}}$`, "gm"),
    " ",
  );
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}#{1,6}[ \\t]+`, "gm"), "");
  text = text.replace(new RegExp(`[ \\t]{1,${INDENT}}#{1,${INDENT}}[ \\t]{0,${INDENT}}$`, "gm"), "");
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}(?:>[ \\t]?){1,${INDENT}}`, "gm"), "");
  text = text.replace(new RegExp(`^[ \\t]{0,${INDENT}}(?:[-*+]|\\d{1,9}[.)])[ \\t]{1,${INDENT}}(?:\\[[ xX]\\][ \\t]{1,${INDENT}})?`, "gm"), "");
  text = text.replace(/\|/g, " ");

  // Ênfase e código em linha: ficam o texto e o conteúdo.
  text = text.replace(new RegExp("`{1,20}([^`\\n]{0," + SPAN + "})`{1,20}", "g"), "$1");
  text = text.replace(new RegExp(`(\\*\\*|__)(?=\\S)([\\s\\S]{0,${SPAN}}?\\S)\\1`, "g"), "$2");
  text = text.replace(new RegExp(`~~(?=\\S)([\\s\\S]{0,${SPAN}}?\\S)~~`, "g"), "$1");
  text = text.replace(new RegExp(`(^|[\\s(])\\*(?=\\S)([^*\\n]{0,${SPAN}}?\\S)\\*(?=$|[\\s).,;:!?])`, "g"), "$1$2");
  text = text.replace(new RegExp(`(^|[\\s(])_(?=\\S)([^_\\n]{0,${SPAN}}?\\S)_(?=$|[\\s).,;:!?])`, "g"), "$1$2");

  // Escapes de barra invertida e espaços.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|~$<>])/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * O começo do texto que é analisado, sem cortar um par substituto ao meio.
 * @param {unknown} markdown
 * @param {number} limit
 */
function headOf(markdown, limit) {
  const text = String(markdown);
  if (text.length <= limit) return text;
  const last = text.charCodeAt(limit - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit);
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
  if (typeof markdown !== "string") return null;
  const text = stripMarkdown(markdown);
  if (text === "") return null;

  const chars = Array.from(text);
  // O texto analisado acabou antes do fim do documento (muita marcação): a última palavra pode estar
  // cortada, então fica só a que está inteira, e as reticências avisam.
  const cutByLimit = markdown.length > ANALYSIS_LIMIT;
  if (chars.length <= max && !cutByLimit) return text;
  if (chars.length <= max) {
    const space = text.lastIndexOf(" ");
    return space <= 0 ? text : `${text.slice(0, space).replace(/[\s,;:.\-–—(]+$/u, "")}…`;
  }

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
