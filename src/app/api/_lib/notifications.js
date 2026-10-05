// Apoio às rotas de /api/notifications (RF33, RN26, ADR-026): a forma pública de uma notificação, com
// o texto em português. A pasta `_lib` é privada: não gera rota.
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
