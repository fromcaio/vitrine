// Destino depois da troca da senha provisória (UC14, RN21): módulo puro, sem Next.js. O `redirectTo` só
// vale se for um caminho interno do site (`safeRedirectPath`, que recusa outro site) e nunca a própria
// página da troca (um laço).
import { safeRedirectPath } from "@/lib/validators";

/** A página da troca de senha, alvo do redirecionamento com a senha provisória (UC14, RN21). */
export const PASSWORD_PAGE = "/admin/senha";

/**
 * @param {unknown} value `redirectTo` bruto da consulta
 * @returns {string} o caminho a que a troca devolve o usuário (`/admin` se o pedido não serve)
 */
export function passwordRedirectTarget(value) {
  const target = safeRedirectPath(value);
  const { pathname } = new URL(target, "http://localhost");
  return pathname === PASSWORD_PAGE || pathname.startsWith(`${PASSWORD_PAGE}/`) ? "/admin" : target;
}
