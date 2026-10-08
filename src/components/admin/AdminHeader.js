// Barra superior do painel (M10, M19): a marca do site (logo e/ou nome, D-34), que leva ao site
// (`/`), o sino de notificações (se o Core o liga), o botão de modo claro/escuro (ADR-036), o usuário
// autenticado e o encerramento da sessão (RF20; o botão também apaga os rascunhos locais do editor e o
// cookie-marcador, em SignOutForm). A cor secundária é a da estrutura, com o texto `on-secondary` do
// modo (Cap. 5 §5.9). Em telas estreitas, o nome e o e-mail descem para uma segunda linha (RNF06).
import Link from "next/link";
import { ColorModeToggle } from "@/components/layout/ColorModeToggle";
import { SiteBrand } from "@/components/layout/SiteBrand";
import { SignOutForm } from "./SignOutForm";

/**
 * @param {object} props
 * @param {string} props.siteName nome exibido como marca do painel
 * @param {string | null} [props.logoUrl] logo do site (`/media/<id>`); sem ele, o logo embutido
 * @param {boolean} [props.showLogo] mostra o logo (padrão); pelo menos um de `showLogo` e `showName`
 *   fica ligado
 * @param {boolean} [props.showName] mostra o nome (padrão)
 * @param {string} [props.modeIconPair] par de ícones do botão de modo (`modeIconPair` do site)
 * @param {boolean} [props.modeToggle] mostra o botão de modo claro/escuro (padrão)
 * @param {{ name: string, email: string }} props.user usuário da sessão, já validada no servidor
 * @param {() => Promise<void>} props.signOutAction Server Function que encerra a sessão
 * @param {import("react").ReactNode} [props.notificationBell] o sino (`NotificationBell`), que o Core
 *   monta com o contador lido no servidor; sem ele, a barra não tem o sino
 */
export function AdminHeader({
  siteName,
  user,
  signOutAction,
  notificationBell = null,
  logoUrl = null,
  showLogo = true,
  showName = true,
  modeIconPair,
  modeToggle = true,
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-secondary px-4 py-3 text-on-secondary">
      {/* A marca leva ao site (`/`); o painel se alcança pelo menu e pelo "Administração" do site. Sem
          prefetch: o portal traz a folha do KaTeX, e pré-carregá-la aqui geraria o aviso de recurso não usado. */}
      <Link href="/" prefetch={false} className="mr-auto flex min-w-0 items-center gap-3 rounded-sm">
        <SiteBrand name={siteName} logoUrl={logoUrl} showLogo={showLogo} showName={showName} />
        <span className="shrink-0 text-sm">Painel</span>
      </Link>
      {notificationBell}
      {/* Sobre o fundo neutro, como na barra do espaço: o botão marcado mantém o contraste. */}
      {modeToggle ? (
        <div className="rounded-md bg-background p-1 text-foreground">
          <ColorModeToggle iconPair={modeIconPair} />
        </div>
      ) : null}
      <div className="order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:max-w-xs sm:text-right">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs">{user.email}</p>
      </div>
      <SignOutForm action={signOutAction} />
    </header>
  );
}
