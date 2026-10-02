// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel é da UI (M10): a casca
// visual é o componente AdminShell, que recebe o usuário, a Server Function de sair (RF20) e o
// nome do site (RF18), lido da configuração na mesma consulta do layout raiz.
import { AdminShell } from "@/components/admin/AdminShell";
import { getSiteConfiguration, siteNameOf } from "../_lib/site";
import { signOut } from "./_lib/actions";
import { requireAdminSession } from "./_lib/session";

export const metadata = {
  title: "Painel administrativo",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }) {
  const { user } = await requireAdminSession();
  // O componente recebe só o nome, nunca o registro da configuração.
  const siteName = siteNameOf(await getSiteConfiguration());
  return (
    <AdminShell user={user} signOutAction={signOut} siteName={siteName}>
      {children}
    </AdminShell>
  );
}
