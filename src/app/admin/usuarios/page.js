// Usuários (RF27, UC13; RN19 a RN24; CT41, CT42, CT52): só o administrador. Quem não é responde `notFound()` (a
// página não existe para ele, RN19; a API responde 403 em português se alguém a chamar direto), como em
// /admin/configuracoes. A página lê a PRIMEIRA página da lista (a mesma consulta de `GET /api/users`, sem o
// hash nem as contas) e monta a `UserTable` da UI, que cria, edita, redefine a senha, suspende, reativa e
// exclui sozinha, pela API. NÃO há `/admin/usuarios/[id]`: a tabela edita no lugar (R-024). A senha
// provisória nunca passa pela página: aparece só na resposta da API, no navegador.
import { headers } from "next/headers";
import { UserTable } from "@/components/admin/UserTable";
import { countActiveAdmins } from "@/lib/db";
import { SPACE_HREF, USER_CONTENT_HREF, firstUsersPage } from "../_lib/users";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Usuários",
  robots: { index: false, follow: false },
};

export default async function UsersPage() {
  const { user } = await requireSession({ role: "admin", path: "/admin/usuarios" });
  const [initial, activeAdminCount] = await Promise.all([firstUsersPage(await headers()), countActiveAdmins()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <UserTable
        initial={initial}
        currentUserId={user.id}
        activeAdminCount={activeAdminCount}
        spaceHref={SPACE_HREF}
        contentHref={USER_CONTENT_HREF}
      />
    </div>
  );
}
