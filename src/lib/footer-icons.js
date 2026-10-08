// Listas fechadas do épico v1 (ADR-035, ADR-037; D-35 e D-36): os ícones do rodapé e os pares de
// ícones do botão de modo. Módulo puro, sem dependências (nem Prisma, nem Next.js, nem DOM), para que
// a camada de dados, o Core e a interface importem a MESMA lista. O desenho de cada ícone (SVG
// inline) é da interface; aqui só valem os identificadores e o teto.

/**
 * Ícones do rodapé, na ordem em que o seletor os oferece (ADR-035, item 3). Os de marcas vêm do
 * Simple Icons (CC0); `website` e `email` são glifos próprios.
 */
export const FOOTER_ICONS = /** @type {const} */ ([
  "github",
  "linkedin",
  "instagram",
  "youtube",
  "x",
  "facebook",
  "bluesky",
  "mastodon",
  "telegram",
  "whatsapp",
  "twitch",
  "discord",
  "lattes",
  "orcid",
  "researchgate",
  "googlescholar",
  "website",
  "email",
]);

/** @typedef {typeof FOOTER_ICONS[number]} FooterIcon */

/** Máximo de links do rodapé por dono (o site ou um usuário; ADR-035, item 2). */
export const MAX_FOOTER_LINKS = 8;

/** Pares de ícones do botão de modo, para o site inteiro (D-35); o primeiro é o padrão. */
export const MODE_ICON_PAIRS = /** @type {const} */ (["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);

/** @typedef {typeof MODE_ICON_PAIRS[number]} ModeIconPair */

/** Par de ícones padrão (o mesmo `@default` de `Configuration.modeIconPair`). */
export const DEFAULT_MODE_ICON_PAIR = /** @type {ModeIconPair} */ (MODE_ICON_PAIRS[0]);

/**
 * @param {unknown} value
 * @returns {value is FooterIcon}
 */
export function isFooterIcon(value) {
  return typeof value === "string" && /** @type {readonly string[]} */ (FOOTER_ICONS).includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is ModeIconPair}
 */
export function isModeIconPair(value) {
  return typeof value === "string" && /** @type {readonly string[]} */ (MODE_ICON_PAIRS).includes(value);
}
