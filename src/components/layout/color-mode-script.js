// Modo de cor do leitor (RF32, RN27, ADR-036; Cap. 5 §5.9, Código do script do modo): o cookie
// `vitrine-modo` e o script inline do <head>, que aplica a classe .dark ao <html> antes da primeira
// pintura. Módulo sem React nem DOM: o layout raiz (Core) importa o script e o injeta; o seletor
// (ColorModeToggle) importa o nome do cookie e as funções de leitura e de escrita.
//
// Só há dois modos, claro e escuro (D-33): sem "automático". A primeira visita, sem cookie, é CLARA.
// O cookie é funcional (sem dado pessoal), escrito PELO CLIENTE e lido SÓ por este script: o servidor
// nunca o lê (ler cookie no layout o tornaria dinâmico e mataria o ISR e o LCP).
//
// O script é admitido pela CSP (script-src 'unsafe-inline', ADR-022) e tem conteúdo FIXO: a única
// parte que varia é o nome do cookie, uma constante deste módulo. Nunca o monte com dado do banco,
// da requisição ou do usuário.

/** Nome do cookie com a escolha do leitor (`light` ou `dark`). */
export const COLOR_MODE_COOKIE = "vitrine-modo";

/** Chave do `localStorage` da versão anterior (com "automático"): já não é lida; a escrita a apaga. */
export const LEGACY_STORAGE_KEY = "vitrine:modo";

/** Validade do cookie: um ano, em segundos. */
export const COLOR_MODE_MAX_AGE = 31_536_000;

/**
 * Escolha do leitor: claro ou escuro.
 * @typedef {"light" | "dark"} ColorModeChoice
 */

/**
 * O leitor quer o modo escuro? Só o valor exato `dark` o liga; qualquer outro (ausente, lixo, o
 * antigo `auto`) é o modo claro.
 * @param {string | null | undefined} stored valor do cookie
 * @returns {boolean}
 */
export function wantsDark(stored) {
  return stored === "dark";
}

/**
 * Valor do cookie de modo em uma string `document.cookie`; `null` se não houver.
 * @param {string} cookieString
 * @returns {string | null}
 */
export function readModeCookie(cookieString) {
  for (const part of cookieString.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === COLOR_MODE_COOKIE) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * Texto a atribuir a `document.cookie` para gravar a escolha: `Path=/`, um ano, `SameSite=Lax`, sem
 * `HttpOnly` (o script do <head> precisa lê-lo) e com `Secure` em HTTPS.
 * @param {ColorModeChoice} choice
 * @param {boolean} secure a página foi aberta por HTTPS
 * @returns {string}
 */
export function modeCookieString(choice, secure) {
  return `${COLOR_MODE_COOKIE}=${choice}; Path=/; Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Script do `<head>` do layout raiz (Código do Cap. 5 §5.9). Cookies bloqueados não podem quebrar a
 * página: o `catch` deixa o modo claro.
 */
export const COLOR_MODE_SCRIPT = `(function () {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)${COLOR_MODE_COOKIE}=([^;]*)/);
    if (m && m[1] === "dark") document.documentElement.classList.add("dark");
  } catch (e) { /* cookies bloqueados: segue o modo claro */ }
})();`;
