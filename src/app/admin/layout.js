// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel é da UI (M10): a casca
// visual é o componente AdminShell, que recebe o usuário e a Server Function de sair (RF20).
import { AdminShell } from "@/components/admin/AdminShell";
import { signOut } from "./_lib/actions";
import { requireAdminSession } from "./_lib/session";

export const metadata = {
  title: "Painel administrativo",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }) {
  const { user } = await requireAdminSession();
  return (
    <AdminShell user={user} signOutAction={signOut}>
      {children}
    </AdminShell>
  );
}
