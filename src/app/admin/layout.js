// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel é a do SITE (ADR-030): a
// configuração, lida pela guarda de `getSiteConfiguration`, vai no envoltório `.vitrine-tema`. A casca
// visual é o componente AdminShell, da UI, que recebe o usuário, a Server Function de sair (RF20) e o
// nome do site (RF18); nunca o registro da configuração.
import { AdminShell } from "@/components/admin/AdminShell";
import { SiteTheme } from "../_lib/site-theme";
import { getSiteConfiguration, siteNameOf } from "../_lib/site";
import { signOut } from "./_lib/actions";
import { requireSession } from "./_lib/session";

/**
 * O título do painel acompanha o nome do site; as páginas do painel usam "Página | nome". `absolute`:
 * o título do próprio painel ignora o modelo do layout raiz.
 */
export async function generateMetadata() {
  const siteName = siteNameOf(await getSiteConfiguration());
  return {
    title: { absolute: `Painel administrativo | ${siteName}`, template: `%s | ${siteName}` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children }) {
  const { user } = await requireSession({ path: "/admin" });
  const configuration = await getSiteConfiguration();
  return (
    <SiteTheme configuration={configuration}>
      <AdminShell user={user} signOutAction={signOut} siteName={siteNameOf(configuration)}>
        {children}
      </AdminShell>
    </SiteTheme>
  );
}
