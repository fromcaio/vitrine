// Validação de sessão, de senha provisória e de papel das páginas do painel (RN19, RN21; ADR-029,
// item 7; camada 2 da Tabela de camadas, Cap. 5 §5.6): o Server Component consulta a sessão no banco
// (a suspensão vigente conta como sessão ausente) e redireciona ao login se ela for inválida; com a
// senha provisória, leva à troca (`/admin/senha`) antes de qualquer página do painel; um papel
// insuficiente responde `notFound()`, como se a página não existisse. Cada página e cada Server Function
// do painel o chama: o Proxy é só a verificação otimista.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PASSWORD_PAGE } from "./password-redirect";

/**
 * Sessão válida; sem ela, redireciona a `/login` preservando o destino. Com a senha provisória
 * (`mustChangePassword`, RN21), redireciona a `/admin/senha?redirectTo=<a página pedida>`, e a troca
 * devolve o usuário a ela. Com `role`, exige esse papel: o outro responde `notFound()`.
 * @param {{ role?: "admin" | "user", path?: string, allowTemporaryPassword?: boolean }} [options]
 *   `path` é a página protegida (com a consulta, se importar), para voltar a ela depois do login ou da
 *   troca da senha. `allowTemporaryPassword` só vale para a própria página da troca de senha e para o
 *   layout do painel (que envolve a página da troca e não sabe qual página renderiza): é a exceção ao
 *   redirecionamento.
 */
export async function requireSession({ role, path = "/admin", allowTemporaryPassword = false } = {}) {
  const session = await getSession(await headers());
  if (!session) redirect(`/login?redirectTo=${encodeURIComponent(path)}`);
  if (session.user.mustChangePassword && !allowTemporaryPassword) {
    redirect(`${PASSWORD_PAGE}?redirectTo=${encodeURIComponent(path)}`);
  }
  if (role !== undefined && session.user.role !== role) notFound();
  return session;
}
