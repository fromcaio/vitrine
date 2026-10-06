// Páginas do painel que EXISTEM (as demais aparecem no menu como "em breve"; RN19, RN21, Cap. 5 §5.11):
// o `availablePaths` do `AdminShell`. O Core acrescenta uma linha aqui a cada página que entrega; nunca
// uma página que ainda não existe (o link levaria a um 404). Pasta privada do App Router: não gera rota.

/** Páginas de todo usuário. */
const USER_PATHS = ["/admin", "/admin/senha", "/admin/aparencia", "/admin/notificacoes"];

/** Páginas só do administrador (as outras respondem 404 a um usuário comum). */
const ADMIN_PATHS = ["/admin/configuracoes"];

/**
 * @param {"admin" | "user"} role
 * @returns {string[]}
 */
export function availablePathsFor(role) {
  return role === "admin" ? [...USER_PATHS, ...ADMIN_PATHS] : [...USER_PATHS];
}
