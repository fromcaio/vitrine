// Comandos da barra de ferramentas do editor (M09; RF08): funções puras sobre o texto e a seleção
// de um <textarea>. Cada comando recebe `{ value, start, end }` e devolve o novo texto com a
// nova seleção; quem os chama aplica o resultado ao campo. Nada aqui toca o DOM, o que permite
// testar todos os comandos sem navegador.
//
// Os marcadores seguem o Markdown que o MarkdownRenderer entende (GFM e `remark-math`).

/**
 * Texto e seleção de um campo. `start` e `end` são índices em `value` (`start <= end`).
 * @typedef {{ value: string, start: number, end: number }} TextState
 */

/**
 * @typedef {"bold" | "italic" | "strike" | "code" | "codeBlock" | "heading1" | "heading2" | "heading3"
 *   | "quote" | "ul" | "ol" | "tasks" | "link" | "image" | "table" | "math" | "mathBlock"} FormatCommand
 */

/** Textos de exemplo, selecionados depois da inserção para o autor digitar por cima. */
const PLACEHOLDER = {
  bold: "texto em negrito",
  italic: "texto em itálico",
  strike: "texto tachado",
  code: "código",
  codeBlockLanguage: "linguagem",
  codeBlockBody: "código",
  link: "texto do link",
  image: "descrição da imagem",
  math: "x",
  mathBlock: "x^2 + y^2 = z^2",
  url: "https://",
};

const TABLE_TEMPLATE = ["| Coluna 1 | Coluna 2 |", "|:---------|:---------|", "| dado     | dado     |"].join("\n");

// ---------------------------------------------------------------------------------------------
// Marcadores em linha (negrito, itálico, tachado, código e fórmula em linha)
// ---------------------------------------------------------------------------------------------

/**
 * O trecho `[from, to)` está entre dois marcadores de um só caractere? Conta as sequências do
 * mesmo caractere coladas a cada lado: para `*`, o itálico existe quando a menor das duas é ímpar
 * (1 ou 3); para os demais, quando as duas têm exatamente um caractere.
 * @param {string} value
 * @param {number} from
 * @param {number} to
 * @param {string} marker um caractere
 */
function hasSingleMarker(value, from, to, marker) {
  let before = 0;
  while (value[from - 1 - before] === marker) before += 1;
  let after = 0;
  while (value[to + after] === marker) after += 1;
  if (before === 0 || after === 0) return false;
  return marker === "*" ? Math.min(before, after) % 2 === 1 : before === 1 && after === 1;
}

/**
 * Envolve a seleção com `marker`, ou desfaz o envolvimento se ela já o tem (alternância). Sem
 * seleção, insere o marcador duas vezes com `placeholder` no meio, selecionado. Os espaços nas
 * pontas da seleção ficam fora do marcador, porque `** texto**` não é negrito em Markdown.
 * @param {TextState} state
 * @param {string} marker
 * @param {string} placeholder
 * @returns {TextState}
 */
function toggleInline({ value, start, end }, marker, placeholder) {
  const size = marker.length;
  const selected = value.slice(start, end);
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const coreStart = start + leading;
  const coreEnd = selected.trim() === "" ? start : end - trailing;
  const core = value.slice(coreStart, coreEnd);

  if (core === "") {
    // Sem texto: insere o marcador e o exemplo, deixando o exemplo selecionado.
    const inserted = `${marker}${placeholder}${marker}`;
    return {
      value: value.slice(0, start) + inserted + value.slice(end),
      start: start + size,
      end: start + size + placeholder.length,
    };
  }

  // O marcador já está em volta do texto? Para os de um só caractere, o que conta é a sequência
  // de marcadores colada ao texto: `*x*` é itálico, `**x**` é negrito (não é itálico), e
  // `***x***` é negrito e itálico. Para `` ` `` e `$`, só uma sequência de um caractere é o
  // marcador (duas seriam outro). Os de dois caracteres (`**` e `~~`) basta que estejam coladas.
  const wrappedOutside =
    size === 1
      ? hasSingleMarker(value, coreStart, coreEnd, marker)
      : value.slice(coreStart - size, coreStart) === marker && value.slice(coreEnd, coreEnd + size) === marker;
  if (wrappedOutside) {
    return {
      value: value.slice(0, coreStart - size) + core + value.slice(coreEnd + size),
      start: coreStart - size,
      end: coreEnd - size,
    };
  }

  // A seleção inclui os marcadores: `⟦**x**⟧`.
  const inner = core.slice(size, core.length - size);
  if (core.length > 2 * size && core.startsWith(marker) && core.endsWith(marker) && (size > 1 || hasSingleMarker(value, coreStart + size, coreEnd - size, marker))) {
    return {
      value: value.slice(0, coreStart) + inner + value.slice(coreEnd),
      start: coreStart,
      end: coreStart + inner.length,
    };
  }

  return {
    value: value.slice(0, coreStart) + marker + core + marker + value.slice(coreEnd),
    start: coreStart + size,
    end: coreEnd + size,
  };
}

// ---------------------------------------------------------------------------------------------
// Prefixos de linha (títulos, citação e listas)
// ---------------------------------------------------------------------------------------------

/**
 * Linhas cobertas pela seleção: do início da primeira ao fim da última. Uma seleção que termina
 * logo depois de uma quebra de linha não inclui a linha seguinte.
 * @param {TextState} state
 */
function coveredLines({ value, start, end }) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const newline = value.indexOf("\n", effectiveEnd);
  const lineEnd = newline === -1 ? value.length : newline;
  return { lineStart, lineEnd, lines: value.slice(lineStart, lineEnd).split("\n") };
}

/**
 * Aplica `transform` às linhas cobertas e acerta a seleção: com o cursor em uma linha só, ele
 * acompanha o texto; com várias linhas ou uma seleção, o bloco inteiro fica selecionado, o que
 * permite alternar o comando de novo.
 * @param {TextState} state
 * @param {(lines: string[]) => string[]} transform
 * @returns {TextState}
 */
function transformLines(state, transform) {
  const { value, start, end } = state;
  const { lineStart, lineEnd, lines } = coveredLines(state);
  const changed = transform(lines);
  const block = changed.join("\n");
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
  if (start === end && lines.length === 1) {
    const caret = Math.max(lineStart, start + (block.length - lines[0].length));
    return { value: next, start: caret, end: caret };
  }
  return { value: next, start: lineStart, end: lineStart + block.length };
}

const HEADING_PREFIX = /^#{1,6}[ \t]+/;
const QUOTE_PREFIX = /^>[ \t]?/;
const LIST_PREFIX = /^(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

/** @param {string} line */
const isBlank = (line) => line.trim() === "";

/**
 * @param {TextState} state
 * @param {number} level
 */
function heading(state, level) {
  const prefix = `${"#".repeat(level)} `;
  return transformLines(state, (lines) => {
    const filled = lines.filter((line) => !isBlank(line));
    const alreadyThisLevel = filled.length > 0 && filled.every((line) => line.startsWith(prefix) && !line.startsWith(`${prefix}#`));
    return lines.map((line) => {
      if (isBlank(line) && lines.length > 1) return line;
      const bare = line.replace(HEADING_PREFIX, "");
      return alreadyThisLevel ? bare : prefix + bare;
    });
  });
}

/** @param {TextState} state */
function quote(state) {
  return transformLines(state, (lines) => {
    const filled = lines.filter((line) => !isBlank(line));
    const allQuoted = filled.length > 0 && filled.every((line) => QUOTE_PREFIX.test(line));
    return lines.map((line) => {
      if (isBlank(line) && lines.length > 1) return line;
      return allQuoted ? line.replace(QUOTE_PREFIX, "") : `> ${line}`;
    });
  });
}

/**
 * Lista com marcadores, numerada ou de tarefas. Apertar o mesmo botão de novo desfaz a lista; um
 * tipo diferente troca o marcador das linhas.
 * @param {TextState} state
 * @param {"ul" | "ol" | "tasks"} kind
 */
function list(state, kind) {
  /** @param {number} position */
  const marker = (position) => (kind === "ol" ? `${position}. ` : kind === "tasks" ? "- [ ] " : "- ");
  /** @param {string} line */
  const matchesKind = (line) =>
    kind === "ol" ? /^\d+[.)][ \t]/.test(line) : kind === "tasks" ? /^[-*+][ \t]+\[[ xX]\][ \t]/.test(line) : /^[-*+][ \t]/.test(line) && !/^[-*+][ \t]+\[[ xX]\][ \t]/.test(line);

  return transformLines(state, (lines) => {
    const filled = lines.filter((line) => !isBlank(line));
    const alreadyThisKind = filled.length > 0 && filled.every(matchesKind);
    let position = 0;
    return lines.map((line) => {
      if (isBlank(line) && lines.length > 1) return line;
      const bare = line.replace(LIST_PREFIX, "");
      if (alreadyThisKind) return bare;
      position += 1;
      return marker(position) + bare;
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Blocos (código, fórmula em bloco e tabela) e inserções (link e imagem)
// ---------------------------------------------------------------------------------------------

/**
 * Quebras de linha que separam um bloco do texto antes dele: nenhuma no início do texto, e as
 * necessárias para deixar uma linha em branco nos demais casos.
 * @param {string} before
 */
function separatorBefore(before) {
  if (before === "" || before.endsWith("\n\n")) return "";
  return before.endsWith("\n") ? "\n" : "\n\n";
}

/** @param {string} after */
function separatorAfter(after) {
  if (after === "" || after.startsWith("\n\n")) return "";
  return after.startsWith("\n") ? "\n" : "\n\n";
}

/**
 * Insere um bloco no lugar de `[from, to)`, separado do texto vizinho por uma linha em branco.
 * @param {string} value
 * @param {number} from
 * @param {number} to
 * @param {string} block
 * @param {{ from: number, to: number }} select seleção dentro do bloco
 * @returns {TextState}
 */
function insertBlock(value, from, to, block, select) {
  const before = value.slice(0, from);
  const after = value.slice(to);
  const lead = separatorBefore(before);
  const origin = from + lead.length;
  return {
    value: before + lead + block + separatorAfter(after) + after,
    start: origin + select.from,
    end: origin + select.to,
  };
}

/** @param {TextState} state */
function codeBlock({ value, start, end }) {
  const body = value.slice(start, end) || PLACEHOLDER.codeBlockBody;
  const language = PLACEHOLDER.codeBlockLanguage;
  return insertBlock(value, start, end, `\`\`\`${language}\n${body}\n\`\`\``, { from: 3, to: 3 + language.length });
}

/** @param {TextState} state */
function mathBlock({ value, start, end }) {
  const body = value.slice(start, end) || PLACEHOLDER.mathBlock;
  return insertBlock(value, start, end, `$$\n${body}\n$$`, { from: 3, to: 3 + body.length });
}

/** @param {TextState} state */
function table({ value, end }) {
  // Insere depois da seleção: o texto selecionado não é perdido.
  return insertBlock(value, end, end, TABLE_TEMPLATE, { from: 2, to: 2 + "Coluna 1".length });
}

/**
 * Link `[texto](url)`. Com uma URL selecionada, ela vira o endereço e o texto fica para o autor;
 * com outro texto selecionado, ele vira o texto do link e o endereço fica para o autor.
 * @param {TextState} state
 */
function link({ value, start, end }) {
  const selected = value.slice(start, end);
  const isUrl = /^https?:\/\/\S+$/i.test(selected);
  const text = isUrl ? PLACEHOLDER.link : selected || PLACEHOLDER.link;
  const url = isUrl ? selected : PLACEHOLDER.url;
  const inserted = `[${text}](${url})`;
  const select = selected !== "" && !isUrl ? { from: text.length + 3, to: text.length + 3 + url.length } : { from: 1, to: 1 + text.length };
  return { value: value.slice(0, start) + inserted + value.slice(end), start: start + select.from, end: start + select.to };
}

/**
 * Imagem `![descrição](url)`. O texto alternativo é o primeiro a ser preenchido; o endereço
 * começa em `https://`, porque a política de segurança do site barra imagens em `http:`.
 * @param {TextState} state
 */
function image({ value, start, end }) {
  const selected = value.slice(start, end);
  const alt = selected || PLACEHOLDER.image;
  const inserted = `![${alt}](${PLACEHOLDER.url})`;
  const select = selected === "" ? { from: 2, to: 2 + alt.length } : { from: alt.length + 4, to: alt.length + 4 + PLACEHOLDER.url.length };
  return { value: value.slice(0, start) + inserted + value.slice(end), start: start + select.from, end: start + select.to };
}

/**
 * Aplica um comando da barra de ferramentas.
 * @param {FormatCommand} command
 * @param {TextState} state texto e seleção atuais
 * @returns {TextState} novo texto e nova seleção
 */
export function applyFormat(command, state) {
  const start = Math.min(state.start, state.end);
  const end = Math.max(state.start, state.end);
  const current = { value: state.value, start, end };
  switch (command) {
    case "bold":
      return toggleInline(current, "**", PLACEHOLDER.bold);
    case "italic":
      return toggleInline(current, "*", PLACEHOLDER.italic);
    case "strike":
      return toggleInline(current, "~~", PLACEHOLDER.strike);
    case "code":
      return toggleInline(current, "`", PLACEHOLDER.code);
    case "math":
      return toggleInline(current, "$", PLACEHOLDER.math);
    case "codeBlock":
      return codeBlock(current);
    case "mathBlock":
      return mathBlock(current);
    case "table":
      return table(current);
    case "heading1":
      return heading(current, 1);
    case "heading2":
      return heading(current, 2);
    case "heading3":
      return heading(current, 3);
    case "quote":
      return quote(current);
    case "ul":
    case "ol":
    case "tasks":
      return list(current, command);
    case "link":
      return link(current);
    case "image":
      return image(current);
    default:
      throw new TypeError(`Comando de formatação desconhecido: ${String(command)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Apoio ao editor
// ---------------------------------------------------------------------------------------------

/**
 * Menor trecho que, trocado em `before`, produz `after`: o prefixo e o sufixo em comum ficam de
 * fora. Serve para aplicar uma mudança ao campo como uma edição de verdade (a que o navegador
 * registra no histórico de desfazer), e não como a troca do texto inteiro.
 * @param {string} before
 * @param {string} after
 * @returns {{ start: number, end: number, text: string }} `before[start, end)` vira `text`
 */
export function diffRange(before, after) {
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < shortest - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return { start: prefix, end: before.length - suffix, text: after.slice(prefix, after.length - suffix) };
}

/**
 * Sugere o slug (RN03) a partir do título (UC05): sem acentos, em minúsculas, com hífens entre
 * as palavras e no máximo 80 caracteres. Devolve "" se o título não tiver letra nem dígito.
 * @param {string} title
 */
export function slugFromTitle(title) {
  const slug = String(title)
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.replaceAll(/-+$/g, "");
}

/**
 * Endereços `http:` de imagens escritas em Markdown. A política de segurança do site barra
 * imagens fora de `https:`, de modo que elas aparecem quebradas; o editor avisa o autor. Os
 * trechos de código ficam de fora, para que um exemplo de Markdown não gere aviso.
 * @param {string} markdown
 * @returns {string[]}
 */
export function findInsecureImages(markdown) {
  const withoutCode = String(markdown)
    .replaceAll(/```[\s\S]*?(?:```|$)/g, "")
    .replaceAll(/~~~[\s\S]*?(?:~~~|$)/g, "")
    .replaceAll(/`[^`\n]*`/g, "");
  return [...withoutCode.matchAll(/!\[[^\]]*\]\(\s*<?(http:\/\/[^\s)>]*)/gi)].map(([, url]) => url);
}
