// Validação de sessão e de papel das páginas do painel (RN19; ADR-029, item 7; camada 2 da Tabela de
// camadas, Cap. 5 §5.6): o Server Component consulta a sessão no banco (a suspensão vigente conta como
// sessão ausente) e redireciona ao login se ela for inválida; um papel insuficiente responde
// `notFound()`, como se a página não existisse. Cada página e cada Server Function do painel o chama:
// o Proxy é só a verificação otimista.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Sessão válida; sem ela, redireciona a `/login` preservando o destino. Com `role`, exige esse papel:
 * o outro responde `notFound()`.
 * @param {{ role?: "admin" | "user", path?: string }} [options] `path` é a página protegida (com a
 *   consulta, se importar), para voltar a ela depois do login
 */
export async function requireSession({ role, path = "/admin" } = {}) {
  const session = await getSession(await headers());
  if (!session) redirect(`/login?redirectTo=${encodeURIComponent(path)}`);
  if (role !== undefined && session.user.role !== role) notFound();
  return session;
}
