// Notificações do próprio usuário (RF33, RN26, ADR-026; CT50): a página usa `requireSession` e monta o
// `NotificationList` da UI com a PRIMEIRA página já lida no servidor (`firstNotificationsPage`, a forma
// pública da API). Só lê o id da SESSÃO: nunca um identificador da URL, então não há como ver as de outro
// usuário (nem o administrador vê as alheias; RN19). As ações (ler, dispensar, marcar todas, carregar mais)
// são chamadas ao `/api/notifications`, feitas pelo próprio componente.
import { NotificationList } from "@/components/admin/NotificationList";
import { firstNotificationsPage } from "../_lib/notifications";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Notificações",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const { user } = await requireSession({ path: "/admin/notificacoes" });
  const initial = await firstNotificationsPage(user.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Notificações</h1>
      <NotificationList initial={initial} />
    </div>
  );
}
