// Caminhos do site que vêm de props (o Core os monta no servidor): a defesa em profundidade dos links que os
// componentes montam a partir deles. Módulo sem React.

/**
 * O caminho só vale se for um caminho DO SITE ("/maria/aula"): nada de "//outro-site", de barra invertida (o
 * navegador a lê como barra), de esquema nem de espaço ou caractere de controle.
 * @param {unknown} href
 * @returns {string | null} o próprio caminho, ou `null` se não for um caminho do site
 */
export function siteRelative(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  // Sem espaço nem caractere de controle (códigos até 32) e sem a barra invertida (código 92).
  return [...href].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 92) ? null : href;
}
