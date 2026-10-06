// Visão geral do painel (RF26, RF29, RN25). A página valida a sessão e entrega à `AdminOverview` da UI (M10) o
// usuário, os números DELE (os conteúdos em cada estado, lidos da árvore do dono da sessão), a cota, o
// contador de notificações não lidas, o endereço do espaço público e as páginas que existem. O encerramento
// da sessão (RF20) fica na barra superior do painel (AdminShell), com a Server Function de ./_lib/actions.
import { AdminOverview } from "@/components/admin/AdminOverview";
import { countUnread, getContentTree } from "@/lib/db";
import { currentLimits } from "../api/_lib/limits";
import { countContents, spaceHrefOf } from "./_lib/content-tree";
import { availablePathsFor } from "./_lib/menu";
import { requireSession } from "./_lib/session";

export default async function AdminPage() {
  // Layouts não são renderizados de novo a cada navegação: a página também valida a sessão.
  const { user } = await requireSession({ path: "/admin" });
  const role = user.role === "admin" ? "admin" : "user";
  const [tree, unreadCount] = await Promise.all([getContentTree({ ownerId: user.id }), countUnread(user.id)]);

  return (
    <AdminOverview
      user={user}
      counts={countContents(tree)}
      limits={{ maxContents: currentLimits().maxContentsPerUser }}
      unreadCount={unreadCount}
      spaceHref={spaceHrefOf(user.handle)}
      availablePaths={availablePathsFor(role)}
    />
  );
}
