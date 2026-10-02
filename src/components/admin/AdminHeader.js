// Barra superior do painel (M10, casca): nome do site, usuário autenticado e encerramento da
// sessão (RF20; o botão também apaga os rascunhos locais do editor, em SignOutForm). A cor
// secundária é a da estrutura, com texto branco (Cap. 5 §5.9). Em telas estreitas, o nome e o
// e-mail descem para uma segunda linha (RNF06).
import Link from "next/link";
import { SignOutForm } from "./SignOutForm";

/**
 * @param {object} props
 * @param {string} props.siteName nome exibido como marca do painel
 * @param {{ name: string, email: string }} props.user usuário da sessão, já validada no servidor
 * @param {() => Promise<void>} props.signOutAction Server Function que encerra a sessão
 */
export function AdminHeader({ siteName, user, signOutAction }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-secondary px-4 py-3 text-on-secondary">
      <Link href="/admin" className="mr-auto flex items-baseline gap-2 rounded-sm">
        <span className="text-lg font-semibold">{siteName}</span>{" "}
        <span className="text-sm">Painel</span>
      </Link>
      <div className="order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:max-w-xs sm:text-right">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs">{user.email}</p>
      </div>
      <SignOutForm action={signOutAction} />
    </header>
  );
}
