// Proposta 6: requireSession das páginas (código proposto para src/app/admin/_lib/session.js).
import { notFound, redirect } from "next/navigation";
import { isSuspended } from "./authz.mjs";

export const CHANGE_PASSWORD_PATH = "/admin/senha";

/**
 * Sessão válida do painel, com papel opcional. Cada página e cada Server Function chama a própria
 * verificação: o layout não é renderizado de novo a cada navegação (Partial Rendering).
 * @param {{ getSession: (headers: Headers) => Promise<any>, headers: Headers, path?: string, role?: "admin" | "user" }} opts
 */
export async function requireSession({ getSession, headers, path = "/admin", role }) {
  const session = await getSession(headers);
  const user = session?.user;
  if (!user || isSuspended(user)) redirect(`/login?redirectTo=${encodeURIComponent(path)}`);
  if (user.mustChangePassword && path !== CHANGE_PASSWORD_PATH) redirect(CHANGE_PASSWORD_PATH);
  if (role && user.role !== role) notFound(); // página exclusiva: some para quem não tem o papel (sem forbidden(), experimental)
  return { session: session.session, user };
}

/** Resume o que a função fez: "ok", "redirect <destino>" ou "notFound". */
export async function outcome(fn) {
  try {
    await fn();
    return "ok";
  } catch (error) {
    const digest = String(error?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return `redirect ${decodeURIComponent(digest.split(";")[2])}`;
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return "notFound (404)";
    throw error;
  }
}
