// Cookie-marcador de sessão `vitrine-logado=1` (ADR-037; Cap. 5 §5.6): diz às páginas PÚBLICAS, que
// são estáticas (ISR) e não sabem quem lê, que vale a pena perguntar a `GET /api/auth/get-session`
// se há alguém logado (o link "Administração", `AdminLink`). NÃO é a sessão: não tem segredo, não
// autentica nada e pode ficar velho; quem confirma é o servidor. É um cookie de SESSÃO DO NAVEGADOR
// (sem `Max-Age`: some quando o navegador fecha), escrito pelo `LoginForm` ao entrar e apagado pelo
// `SignOutForm` e pelo `AdminLink` quando o `get-session` devolve `null`.
// Visitante anônimo não tem o marcador e, por isso, não faz requisição alguma.
//
// Módulo de navegador (usa `document.cookie`), sem React. Cookies bloqueados nunca lançam erro.

/** Nome do cookie-marcador. */
export const SESSION_MARKER_COOKIE = "vitrine-logado";

/**
 * Há o marcador em uma string `document.cookie`? Só o valor exato `1` vale.
 * @param {string} cookieString
 * @returns {boolean}
 */
export function hasSessionMarker(cookieString) {
  for (const part of cookieString.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_MARKER_COOKIE) return part.slice(index + 1).trim() === "1";
  }
  return false;
}

/**
 * Texto de `document.cookie` que grava o marcador (de sessão do navegador; `Secure` em HTTPS; sem
 * `HttpOnly`: o cliente o lê).
 * @param {boolean} secure
 */
export function markerCookieString(secure) {
  return `${SESSION_MARKER_COOKIE}=1; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Texto de `document.cookie` que apaga o marcador.
 * @param {boolean} secure
 */
export function clearedMarkerCookieString(secure) {
  return `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;
}

const isSecure = () => window.location.protocol === "https:";

/** Grava o marcador (depois de um login bem-sucedido). */
export function setSessionMarker() {
  try {
    document.cookie = markerCookieString(isSecure());
  } catch {
    // Cookies bloqueados: o link "Administração" simplesmente não aparece.
  }
}

/** Apaga o marcador (ao sair, ou quando o servidor diz que não há sessão). */
export function clearSessionMarker() {
  try {
    document.cookie = clearedMarkerCookieString(isSecure());
  } catch {
    // Cookies bloqueados: não há marcador a apagar.
  }
}

/** @returns {boolean} o navegador tem o marcador */
export function readSessionMarker() {
  try {
    return hasSessionMarker(document.cookie);
  } catch {
    return false;
  }
}
