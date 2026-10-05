// Visão geral do painel. A página valida a sessão e entrega o usuário ao componente da UI
// (M10); o encerramento da sessão (RF20) fica na barra superior do painel (AdminShell), com a
// Server Function de ./_lib/actions.
import { AdminOverview } from "@/components/admin/AdminOverview";
import { requireSession } from "./_lib/session";

export default async function AdminPage() {
  // Layouts não são renderizados de novo a cada navegação: a página também valida a sessão.
  const { user } = await requireSession({ path: "/admin" });

  return <AdminOverview user={user} />;
}
