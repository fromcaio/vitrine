// Casca visual do painel administrativo (M10, M19): barra superior, navegação e área de conteúdo.
// É um Server Component de apresentação: não valida a sessão (isso é do layout e das páginas de
// /admin, com requireSession) nem busca dados; recebe tudo por props.
//
// O menu depende do papel e da senha provisória (RN21): o papel e a situação saem das props
// `role` e `mustChangePassword` ou, se não vierem, do próprio `user` da sessão. Com a senha
// provisória, a conta só pode trocar a senha e sair: o menu traz só "Trocar a senha" e o sino (que
// consultaria uma API bloqueada) nem é montado.
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";

/**
 * @param {object} props
 * @param {{ name: string, email: string, role?: string, mustChangePassword?: boolean }} props.user
 *   usuário da sessão, já validada no servidor
 * @param {() => Promise<void>} props.signOutAction Server Function que encerra a sessão (RF20)
 * @param {string} [props.siteName] nome do site; o padrão é o da RN08
 * @param {"admin" | "user"} [props.role] papel; o padrão é `user.role` (e, sem ele, usuário comum)
 * @param {boolean} [props.mustChangePassword] senha provisória; o padrão é `user.mustChangePassword`
 * @param {import("react").ReactNode} [props.notificationBell] o sino (`NotificationBell`) para a barra
 *   superior; ignorado com a senha provisória
 * @param {readonly string[]} [props.availablePaths] páginas do painel que já existem (ver `AdminSidebar`)
 * @param {import("react").ReactNode} props.children conteúdo da página
 */
export function AdminShell({
  user,
  signOutAction,
  siteName = "Vitrine",
  role,
  mustChangePassword,
  notificationBell = null,
  availablePaths,
  children,
}) {
  const effectiveRole = role ?? (user.role === "admin" ? "admin" : "user");
  const temporary = mustChangePassword ?? user.mustChangePassword === true;
  return (
    <div className="relative flex flex-1 flex-col">
      {/* Atalho de teclado (WCAG 2.4.1): fica acima da janela até receber o foco. */}
      <a
        href="#conteudo-principal"
        className="absolute top-2 left-2 z-10 -translate-y-20 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <AdminHeader
        siteName={siteName}
        user={user}
        signOutAction={signOutAction}
        notificationBell={temporary ? null : notificationBell}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <AdminSidebar role={effectiveRole} mustChangePassword={temporary} availablePaths={availablePaths} />
        {/* tabIndex -1: recebe o foco do atalho acima sem entrar na ordem de tabulação. */}
        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="min-w-0 flex-1 bg-background p-4 outline-none sm:p-6 md:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
