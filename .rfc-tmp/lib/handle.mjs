// Validação do handle (ADR-024), função pura compartilhada pelas provas 2A e 2B.
// A classe [a-z0-9-] já exclui "_next", "favicon.ico", "robots.txt" e "sitemap.xml": só os nomes que
// casam com a expressão e colidem com rotas precisam constar da lista de reservados.
export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RESERVED_HANDLES = ["admin", "api", "login", "logout"];

/** @returns {string | null} mensagem de erro, ou null se válido */
export function handleError(value) {
  if (typeof value !== "string") return "O handle deve ser um texto.";
  if (value.length < 3 || value.length > 30) return "O handle deve ter de 3 a 30 caracteres.";
  if (!HANDLE_PATTERN.test(value)) return "O handle aceita só letras minúsculas, dígitos e hífens (sem hífen nas pontas nem repetido).";
  if (RESERVED_HANDLES.includes(value)) return "Este handle é reservado.";
  return null;
}
