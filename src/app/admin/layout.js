// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel do ADMINISTRADOR é a do SITE
// (ADR-030, ADR-038); a do usuário comum é a efetiva, a dele sobre a do sistema (`panelAppearance`).
// A configuração, lida pela guarda de `getSiteConfiguration`, e a mescla vão no envoltório
// `.vitrine-tema`. A casca
// visual é o componente AdminShell, da UI, que recebe o usuário, a Server Function de sair (RF20), o
// nome do site (RF18), o papel, as páginas que existem (`availablePaths`) e o sino de notificações
// (RF33); nunca o registro da configuração.
import { AdminShell } from "@/components/admin/AdminShell";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { countUnread } from "@/lib/db";
import { SiteTheme } from "../_lib/site-theme";
import { getSiteConfiguration, siteNameOf } from "../_lib/site";
import { signOut } from "./_lib/actions";
import { availablePathsFor } from "./_lib/menu";
import { panelAppearance } from "./_lib/appearance";
import { requireSession } from "./_lib/session";

/**
 * O título do painel acompanha o nome do painel (o do site, ou o efetivo do usuário comum); as páginas
 * do painel usam "Página | nome". `absolute`: o título do próprio painel ignora o modelo do layout raiz.
 * Sem sessão (o layout redireciona ao login), vale o nome do site.
 */
export async function generateMetadata() {
  const configuration = await getSiteConfiguration();
  const session = await getSession(await headers());
  const siteName = session
    ? (await panelAppearance({ role: session.user.role === "admin" ? "admin" : "user", userId: session.user.id, configuration })).siteName
    : siteNameOf(configuration);
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
  const panel = await panelAppearance({ role, userId: user.id, configuration });
  const temporaryPassword = user.mustChangePassword === true;
  // Com a senha provisória a API de notificações está bloqueada (RN21): nem se consulta o contador, e o
  // sino não é montado (o menu traz só "Trocar a senha"). O contador inicial é o de TODAS as não lidas
  // DO USUÁRIO DA SESSÃO; depois, o próprio sino o mantém em dia.
  const notificationBell = temporaryPassword ? null : <NotificationBell initialUnreadCount={await countUnread(user.id)} />;
  return (
    <SiteTheme configuration={panel.theme}>
      <AdminShell
        user={user}
        signOutAction={signOut}
        siteName={panel.siteName}
        showLogo={panel.showLogo}
        showName={panel.showName}
        modeIconPair={panel.modeIconPair}
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
