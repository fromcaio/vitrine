// Modo de cor do leitor (RF32, RN27; Cap. 5 §5.9, Código do script do modo): a chave do
// localStorage e o script inline do <head>, que aplica a classe .dark ao <html> antes da primeira
// pintura. Módulo sem React nem DOM: o layout raiz (Core) importa a constante e a injeta; o
// seletor (ColorModeToggle) importa a chave e a lógica de decisão.
//
// O script é admitido pela CSP (script-src 'unsafe-inline', ADR-022) e tem conteúdo FIXO: a única
// parte que varia é a chave, uma constante deste módulo. Nunca o monte com dado do banco, da
// requisição ou do usuário.

/** Chave do localStorage com a escolha do leitor (`light`, `dark` ou `auto`). */
export const COLOR_MODE_STORAGE_KEY = "vitrine:modo";

/**
 * Escolha do leitor: claro, escuro ou o do sistema (`auto`, também o valor de quem nunca
 * escolheu).
 * @typedef {"light" | "dark" | "auto"} ColorModeChoice
 */

/**
 * O leitor quer o modo noturno? É a decisão do script abaixo, em função: só `dark` o força, só
 * `light` o impede, e qualquer outro valor (`auto`, ausente, lixo) segue a preferência do sistema.
 * @param {string | null | undefined} stored valor lido da chave
 * @param {boolean} systemPrefersDark resultado de `(prefers-color-scheme: dark)`
 */
export function wantsDark(stored, systemPrefersDark) {
  return stored === "dark" || (stored !== "light" && systemPrefersDark);
}

/**
 * Script do `<head>` do layout raiz (Código do Cap. 5 §5.9). Armazenamento bloqueado ou sem
 * `matchMedia` não pode quebrar a página: o `catch` deixa o modo claro.
 */
export const COLOR_MODE_SCRIPT = `(function () {
  try {
    var m = localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)});
    var escuro = m === "dark" ||
      (m !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (escuro) document.documentElement.classList.add("dark");
  } catch (e) { /* armazenamento bloqueado: segue o modo claro */ }
})();`;
