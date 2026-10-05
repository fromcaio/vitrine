// Contraste das cores do tema, por modo (Cap. 5 §5.9 e §5.9.1; RN09, RN27, RNF05), segundo a
// WCAG 2.1. Módulo puro: não importa o Next.js nem o Prisma e não usa APIs do navegador, de modo
// que o servidor (PUT da aparência e da configuração) e o formulário de aparência (pré-visualização
// local) o compartilham. As cores chegam já validadas no formato #RRGGBB (`hexColorSchema`, RN09).

const WHITE = "#FFFFFF";
/**
 * Texto escuro: o preto puro (ADR-020). Entre ele e o branco, sempre há uma opção com pelo
 * menos 4,58:1 sobre qualquer cor; com #171717, uma faixa de tons médios ficava abaixo de 4,5:1.
 */
const DARK_TEXT = "#000000";
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Modos de cor (ADR-025). A paleta clara é verificada contra o fundo claro (#FFFFFF) e a noturna,
 * contra o fundo noturno (#0A0A0A): os neutros de cada modo são fixos (Tabela de neutros do
 * Cap. 5 §5.9), o que mantém o contraste verificável com três pares por modo (RN27).
 * @typedef {"light" | "dark"} ColorMode
 */
export const COLOR_MODES = /** @type {const} */ (["light", "dark"]);

/** Fundo da página em cada modo: o outro lado de todos os pares (`--vitrine-background`). */
export const MODE_BACKGROUND = Object.freeze({ light: WHITE, dark: "#0A0A0A" });

/**
 * Campos da paleta de cada modo no registro gravado (`primaryColor`... e `darkPrimaryColor`...).
 * @typedef {"primaryColor" | "secondaryColor" | "accentColor" | "darkPrimaryColor" | "darkSecondaryColor" | "darkAccentColor"} PaletteField
 */

/** Pares verificados de cada modo (Tabela de pares do Cap. 5, `sec:arq-contraste`): três por paleta. */
const CONTRAST_PAIRS = /** @type {const} */ ({
  light: [
    { field: "primaryColor", label: "primária", minimum: 4.5 },
    { field: "secondaryColor", label: "secundária", minimum: 4.5 },
    { field: "accentColor", label: "de destaque", minimum: 3 },
  ],
  dark: [
    { field: "darkPrimaryColor", label: "primária noturna", minimum: 4.5 },
    { field: "darkSecondaryColor", label: "secundária noturna", minimum: 4.5 },
    { field: "darkAccentColor", label: "de destaque noturna", minimum: 3 },
  ],
});

/** Texto que nomeia o fundo do par na mensagem de cada modo. */
const BACKGROUND_LABEL = Object.freeze({ light: "o branco", dark: "o fundo noturno (#0A0A0A)" });

/** @param {unknown} mode */
function assertMode(mode) {
  if (mode !== "light" && mode !== "dark") {
    throw new TypeError(`Modo de cor desconhecido: ${String(mode)} (use "light" ou "dark")`);
  }
}

/**
 * Aviso de contraste insuficiente de uma cor do tema (RN09). Não bloqueia o salvamento. O modo do
 * aviso está no próprio `field` (os campos da paleta noturna começam por `dark`), e a mensagem o
 * nomeia: a forma é a mesma nos dois modos.
 * @typedef {object} ContrastWarning
 * @property {"LOW_CONTRAST"} code
 * @property {PaletteField} field campo avisado
 * @property {number} ratio razão de contraste com o fundo do modo, truncada em duas casas
 * @property {number} minimum mínimo exigido para o par (4,5 ou 3)
 * @property {string} message texto em português, pronto para exibição
 */

/**
 * Canal sRGB de 8 bits convertido para o valor linear (WCAG 2.1, luminância relativa).
 * @param {string} hex dois dígitos hexadecimais
 */
function linearChannel(hex) {
  const value = parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Luminância relativa de uma cor, de 0 (preto) a 1 (branco).
 * @param {string} color cor no formato #RRGGBB
 */
function relativeLuminance(color) {
  const match = typeof color === "string" ? HEX_COLOR.exec(color) : null;
  if (!match) throw new TypeError(`Cor fora do formato #RRGGBB: ${String(color)}`);
  const [, red, green, blue] = match;
  return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}

/**
 * Trunca (sem arredondar) em duas casas: uma razão de 4,499 aparece como 4,49, e não como 4,50,
 * que pareceria atender ao mínimo.
 * @param {number} ratio
 */
function truncateRatio(ratio) {
  return Math.floor(ratio * 100) / 100;
}

/**
 * Separador decimal do português.
 * @param {number | string} value
 */
function formatDecimal(value) {
  return String(value).replace(".", ",");
}

/**
 * Razão de contraste da WCAG 2.1 entre duas cores: (L1 + 0,05) / (L2 + 0,05), em que L1 é a
 * luminância relativa da cor mais clara. Vai de 1 (cores iguais) a 21 (preto e branco), e a
 * ordem dos argumentos não altera o resultado.
 * @param {string} a cor no formato #RRGGBB (maiúsculas ou minúsculas)
 * @param {string} b cor no formato #RRGGBB (maiúsculas ou minúsculas)
 * @returns {number} razão sem arredondamento
 * @throws {TypeError} se uma das cores não estiver no formato #RRGGBB
 */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Avisos de contraste das três cores da paleta de um modo (RN09; CT24, CT48). A paleta clara é
 * comparada com o branco #FFFFFF e a noturna, com o fundo noturno #0A0A0A (`MODE_BACKGROUND`): a
 * primária e a secundária, usadas com texto, exigem 4,5:1; a de destaque, que não é texto,
 * exige 3:1. A comparação usa a razão sem arredondamento; o campo `ratio` e a mensagem trazem a
 * razão truncada em duas casas.
 *
 * Recebe o registro gravado (aparência ou configuração), com as duas paletas: lê só os três
 * campos do modo pedido (`primaryColor`... no claro; `darkPrimaryColor`... no noturno). Sem o
 * modo, vale o claro, de modo que quem passa só as três cores claras segue funcionando.
 * @param {Partial<Record<PaletteField, string>>} palette cores já validadas no formato #RRGGBB
 * @param {ColorMode} [mode] modo da paleta a verificar; `light` por omissão
 * @returns {ContrastWarning[]} um aviso por cor abaixo do mínimo; lista vazia se nada falha
 * @throws {TypeError} se o modo for desconhecido ou se uma das cores do modo não estiver no
 *   formato #RRGGBB
 */
export function contrastWarnings(palette, mode = "light") {
  assertMode(mode);
  const background = MODE_BACKGROUND[mode];
  /** @type {ContrastWarning[]} */
  const warnings = [];
  for (const { field, label, minimum } of CONTRAST_PAIRS[mode]) {
    const ratio = contrastRatio(/** @type {string} */ (palette[field]), background);
    if (ratio >= minimum) continue;
    const shown = truncateRatio(ratio);
    warnings.push({
      code: "LOW_CONTRAST",
      field,
      ratio: shown,
      minimum,
      message:
        `A cor ${label} tem contraste de ${formatDecimal(shown.toFixed(2))}:1 com ${BACKGROUND_LABEL[mode]}, ` +
        `abaixo do mínimo de ${formatDecimal(minimum)}:1 (WCAG 2.1 AA).`,
    });
  }
  return warnings;
}

/**
 * Cor do texto a usar sobre um fundo preenchido: o branco ou o preto, o que tiver a maior razão
 * de contraste com o fundo (no empate, o branco); a escolhida tem sempre pelo menos 4,58:1. É a
 * origem do token --vitrine-on-primary: com a primária padrão (#3b82f6), o branco teria 3,68:1 e
 * reprovaria o nível AA, enquanto o preto alcança 5,71:1.
 * @param {string} color cor de fundo no formato #RRGGBB
 * @returns {"#FFFFFF" | "#000000"}
 * @throws {TypeError} se a cor não estiver no formato #RRGGBB
 */
export function readableTextOn(color) {
  return contrastRatio(color, WHITE) >= contrastRatio(color, DARK_TEXT) ? WHITE : DARK_TEXT;
}

/**
 * Texto sobre a primária e sobre a secundária da paleta de um modo: o `readableTextOn` de cada
 * uma. É por modo porque a cor de entrada é: com as paletas padrão, o texto sobre a secundária é
 * branco no modo claro (#1E293B) e preto no noturno (#CBD5E1). Os valores são os de
 * `--vitrine-light-on-primary`... e `--vitrine-dark-on-primary`... do envoltório `.vitrine-tema`.
 * @param {Partial<Record<PaletteField, string>>} palette cores já validadas no formato #RRGGBB
 * @param {ColorMode} [mode] `light` por omissão
 * @returns {{ onPrimary: "#FFFFFF" | "#000000", onSecondary: "#FFFFFF" | "#000000" }}
 * @throws {TypeError} se o modo for desconhecido ou se uma das duas cores não estiver no formato
 *   #RRGGBB
 */
export function textColorsOf(palette, mode = "light") {
  assertMode(mode);
  const [primary, secondary] = CONTRAST_PAIRS[mode];
  return {
    onPrimary: readableTextOn(/** @type {string} */ (palette[primary.field])),
    onSecondary: readableTextOn(/** @type {string} */ (palette[secondary.field])),
  };
}

/** Variáveis que o envoltório `.vitrine-tema` aceita no atributo `style` (Cap. 5 §5.9). */
const THEME_VARIABLE = /^--vitrine-(light|dark)-(primary|secondary|accent|on-primary|on-secondary)$/;

/**
 * Filtra o objeto de variáveis que vai ao atributo `style` do envoltório `.vitrine-tema`: só as dez
 * variáveis das duas paletas, e só com valor `#RRGGBB`. É a última defesa contra a injeção de CSS
 * pelo atributo (o Core já valida o dado na gravação e na leitura): qualquer outra chave ou valor é
 * descartado.
 * @param {Record<string, unknown> | null | undefined} style
 * @returns {Record<string, string> | undefined} `undefined` se nada sobrar (o atributo é omitido)
 */
export function safeThemeStyle(style) {
  /** @type {Record<string, string>} */
  const safe = {};
  for (const [name, value] of Object.entries(style ?? {})) {
    if (THEME_VARIABLE.test(name) && typeof value === "string" && HEX_COLOR.test(value)) safe[name] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}
