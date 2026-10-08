// Nomes do conjunto FECHADO de pares de ícones do botão de modo (D-35, ADR-037), sem React: o modelo
// dos formulários valida contra esta lista, e `mode-icon-pairs.js` lhe associa os ícones.

/** Os quatro pares aceitos, na ordem de exibição. */
export const MODE_ICON_PAIRS = /** @type {const} */ (["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);

/** @typedef {typeof MODE_ICON_PAIRS[number]} ModeIconPair */

/** O par de quem nunca escolheu. @type {ModeIconPair} */
export const DEFAULT_MODE_ICON_PAIR = "sun_moon";

/**
 * @param {unknown} value
 * @returns {value is ModeIconPair}
 */
export function isModeIconPair(value) {
  return typeof value === "string" && /** @type {readonly string[]} */ (MODE_ICON_PAIRS).includes(value);
}
