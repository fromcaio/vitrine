// Apoio às rotas de /api/notifications (RF33, RN26, ADR-026): a forma pública de uma notificação, com
// o texto em português, e a busca de UMA notificação do próprio usuário. A pasta `_lib` é privada:
// não gera rota.
import { MAX_NOTIFICATIONS_PER_USER, listNotifications } from "@/lib/db";
import { describeNotification } from "./notification-text";

/**
 * Notificação como a API a devolve: sem o dono nem a chave de deduplicação, e com `title` e `text`
 * montados a partir de `type` e `data`.
 * @param {import("@/lib/db").NotificationView} notification
 */
export function publicNotification(notification) {
  const { title, text } = describeNotification(notification);
  return {
    id: notification.id,
    type: notification.type,
    severity: notification.severity,
    title,
    text,
    data: notification.data,
    readAt: notification.readAt,
    resolvedAt: notification.resolvedAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

/**
 * Notificação `id` do usuário, ou `null` se não existe ou é de outro usuário (a rota responde 404 nos
 * dois casos, sem distinguir).
 *
 * PROVISÓRIO (P-015, pedido ao Dados): db.js não tem a leitura de uma notificação (`markRead` devolve
 * `count: 0` tanto para "já lida" quanto para "inexistente"). Até `getNotification(userId, id)`
 * existir, a busca percorre as notificações do usuário, que o teto de RN26 limita a 1000.
 * @param {string} userId
 * @param {string} id
 */
export async function findOwnNotification(userId, id) {
  const all = await listNotifications(userId, { take: MAX_NOTIFICATIONS_PER_USER });
  return all.find((notification) => notification.id === id) ?? null;
}
