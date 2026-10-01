// Validação de sessão das páginas do painel (camada 2 da Tabela de camadas, Cap. 5 §5.6): o
// Server Component consulta a sessão no banco e redireciona ao login se ela for inválida.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Sessão válida do administrador; sem ela, redireciona a `/login` preservando o destino.
 * @param {string} [path] caminho da página protegida
 */
export async function requireAdminSession(path = "/admin") {
  const session = await getSession(await headers());
  if (!session) redirect(`/login?redirectTo=${encodeURIComponent(path)}`);
  return session;
}
