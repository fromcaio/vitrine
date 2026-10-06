// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel é a do SITE (ADR-030): a
// configuração, lida pela guarda de `getSiteConfiguration`, vai no envoltório `.vitrine-tema`. A casca
// visual é o componente AdminShell, da UI, que recebe o usuário, a Server Function de sair (RF20), o
// nome do site (RF18), o papel, as páginas que existem (`availablePaths`) e o sino de notificações
// (RF33); nunca o registro da configuração.
import { AdminShell } from "@/components/admin/AdminShell";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { countUnread } from "@/lib/db";
import { SiteTheme } from "../_lib/site-theme";
import { getSiteConfiguration, siteNameOf } from "../_lib/site";
import { signOut } from "./_lib/actions";
import { availablePathsFor } from "./_lib/menu";
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
  // O layout envolve também `/admin/senha` e não sabe qual página renderiza: a senha provisória é
  // tratada por cada página (RN21), que redireciona; aqui só a sessão conta.
  const { user } = await requireSession({ path: "/admin", allowTemporaryPassword: true });
  const configuration = await getSiteConfiguration();
  const role = user.role === "admin" ? "admin" : "user";
  const temporaryPassword = user.mustChangePassword === true;
  // Com a senha provisória a API de notificações está bloqueada (RN21): nem se consulta o contador, e o
  // sino não é montado (o menu traz só "Trocar a senha"). O contador inicial é o de TODAS as não lidas
  // DO USUÁRIO DA SESSÃO; depois, o próprio sino o mantém em dia.
  const notificationBell = temporaryPassword ? null : <NotificationBell initialUnreadCount={await countUnread(user.id)} />;
  return (
    <SiteTheme configuration={configuration}>
      <AdminShell
        user={user}
        signOutAction={signOut}
        siteName={siteNameOf(configuration)}
        role={role}
        mustChangePassword={temporaryPassword}
        availablePaths={availablePathsFor(role)}
        notificationBell={notificationBell}
      >
        {children}
      </AdminShell>
    </SiteTheme>
  );
}
