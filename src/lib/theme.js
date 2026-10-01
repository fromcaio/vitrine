// Contraste das cores do tema (Cap. 5 §5.9 e §5.9.1; RN09, RNF05), segundo a WCAG 2.1.
// Módulo puro: não importa o Next.js nem o Prisma e não usa APIs do navegador, de modo que o
// servidor (PUT /api/configuration) e o formulário de tema (pré-visualização local) o
// compartilham. As cores chegam já validadas no formato #RRGGBB (`hexColorSchema`, RN09).

const WHITE = "#FFFFFF";
/** Texto escuro: o mesmo valor de --vitrine-foreground em src/app/globals.css. */
const DARK_TEXT = "#171717";
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Pares verificados, sempre contra o branco (Tabela de pares do Cap. 5 §5.9.1). */
const CONTRAST_PAIRS = /** @type {const} */ ([
  { field: "primaryColor", label: "primária", minimum: 4.5 },
  { field: "secondaryColor", label: "secundária", minimum: 4.5 },
  { field: "accentColor", label: "de destaque", minimum: 3 },
]);

/**
 * Aviso de contraste insuficiente de uma cor do tema (RN09). Não bloqueia o salvamento.
 * @typedef {object} ContrastWarning
 * @property {"LOW_CONTRAST"} code
 * @property {"primaryColor" | "secondaryColor" | "accentColor"} field campo avisado
 * @property {number} ratio razão de contraste com o branco, truncada em duas casas
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
 * Avisos de contraste das três cores do tema (RN09; CT24). Cada cor é comparada com o branco
 * #FFFFFF: a primária e a secundária, usadas com texto, exigem 4,5:1; a de destaque, que não é
 * texto, exige 3:1. A comparação usa a razão sem arredondamento; o campo `ratio` e a mensagem
 * trazem a razão truncada em duas casas.
 * @param {{ primaryColor: string, secondaryColor: string, accentColor: string }} colors cores já
 *   validadas no formato #RRGGBB
 * @returns {ContrastWarning[]} um aviso por cor abaixo do mínimo; lista vazia se nada falha
 * @throws {TypeError} se uma das cores não estiver no formato #RRGGBB
 */
export function contrastWarnings(colors) {
  /** @type {ContrastWarning[]} */
  const warnings = [];
  for (const { field, label, minimum } of CONTRAST_PAIRS) {
    const ratio = contrastRatio(colors[field], WHITE);
    if (ratio >= minimum) continue;
    const shown = truncateRatio(ratio);
    warnings.push({
      code: "LOW_CONTRAST",
      field,
      ratio: shown,
      minimum,
      message:
        `A cor ${label} tem contraste de ${formatDecimal(shown.toFixed(2))}:1 com o branco, ` +
        `abaixo do mínimo de ${formatDecimal(minimum)}:1 (WCAG 2.1 AA).`,
    });
  }
  return warnings;
}

/**
 * Cor do texto a usar sobre um fundo preenchido: o branco ou o texto escuro padrão, o que tiver
 * a maior razão de contraste com o fundo (no empate, o branco). É a origem do token
 * --vitrine-on-primary: com a primária padrão (#3b82f6), o branco teria 3,68:1 e reprovaria o
 * nível AA, enquanto o escuro alcança 4,87:1.
 * @param {string} color cor de fundo no formato #RRGGBB
 * @returns {"#FFFFFF" | "#171717"}
 * @throws {TypeError} se a cor não estiver no formato #RRGGBB
 */
export function readableTextOn(color) {
  return contrastRatio(color, WHITE) >= contrastRatio(color, DARK_TEXT) ? WHITE : DARK_TEXT;
}
