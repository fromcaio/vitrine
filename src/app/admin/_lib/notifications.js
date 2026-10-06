// Apoio ao painel para as notificações (RF33, RN19, RN26, ADR-026): a primeira página da lista, lida no
// servidor com a MESMA forma de `GET /api/notifications` (o `NotificationList` da UI recebe o corpo da
// resposta em `initial`). Pasta privada do App Router: não gera rota.
import { countUnread, listNotifications } from "@/lib/db";
import { publicNotification } from "../../api/_lib/notifications";

/** Itens da primeira página (o padrão da API e o `pageSize` do `NotificationList`). */
export const FIRST_PAGE_SIZE = 20;

/**
 * A primeira página de notificações DO USUÁRIO, na forma pública da API: `items` (sem o dono nem a
 * chave de deduplicação, com `title` e `text` em português), `unreadCount` (todas as não lidas, e não só
 * as desta página) e `nextCursor` (`null` na última página). As datas vão como texto ISO, como no JSON
 * da API: o componente cliente só aceita texto, e um `Date` virava "sem data".
 * @param {string} userId o id da SESSÃO (nunca um identificador vindo da URL)
 * @param {number} [pageSize]
 * @returns {Promise<{ items: ReturnType<typeof publicNotification>[], unreadCount: number, nextCursor: string | null }>}
 */
export async function firstNotificationsPage(userId, pageSize = FIRST_PAGE_SIZE) {
  // Uma a mais que a página, só para saber se há a próxima.
  const rows = await listNotifications(userId, { take: pageSize + 1 });
  const page = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize ? page[page.length - 1].id : null;
  return JSON.parse(
    JSON.stringify({ items: page.map(publicNotification), unreadCount: await countUnread(userId), nextCursor }),
  );
}
