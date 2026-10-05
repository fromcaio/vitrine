// Moderação de conteúdo alheio (RF34, RN19, RN26, ADR-027; CT51): o administrador despublica, edita
// e exclui o conteúdo de outro dono, com o motivo, e o dono é notificado. Este módulo monta a
// notificação e aplica a escrita junto dela.
//
// PROVISÓRIO (P-015, pedido ao Dados): a moderação deve ser UMA transação com a notificação, mas
// `updateContent`, `deleteContent` e `notify` de db.js abrem transações próprias. Até o Dados aceitar
// `{ notification }` nas duas escritas, `updateWithNotice` e `deleteWithNotice` gravam a escrita e,
// em seguida, a notificação. A troca é de uma linha em cada função. Enquanto isso, se a
// notificação falhar depois da escrita, o erro é registrado e propagado (500): o conteúdo mudou, mas
// o dono não foi avisado.
import { deleteContent, notify, updateContent } from "@/lib/db";

/** Eventos de moderação de conteúdo; o texto em português é de `notification-text.js`. */
export const CONTENT_EVENTS = Object.freeze({
  unpublished: "CONTENT_UNPUBLISHED",
  edited: "CONTENT_EDITED",
  deleted: "CONTENT_DELETED",
});

/**
 * Campos do conteúdo que a moderação NÃO altera: mover ou reordenar o que é de outro dono não é
 * moderação (RN19; a reordenação alheia responde 403 em `/api/contents/reorder`).
 */
export const MOVE_FIELDS = /** @type {const} */ (["parentId", "order"]);

/**
 * Notificação `MODERATION` ao dono (RN26): o evento, o motivo e o conteúdo; o texto é montado na
 * leitura, a partir de `type` e `data`.
 * @param {{
 *   ownerId: string, event: string, reason: string,
 *   content: { id: string, title: string, type: string }, fields?: string[]
 * }} input
 */
export function contentNotification({ ownerId, event, reason, content, fields }) {
  return {
    userId: ownerId,
    type: /** @type {const} */ ("MODERATION"),
    severity: /** @type {"INFO" | "WARNING"} */ (event === CONTENT_EVENTS.edited ? "INFO" : "WARNING"),
    data: {
      event,
      reason,
      contentId: content.id,
      contentTitle: content.title,
      contentType: content.type,
      ...(fields ? { fields } : {}),
    },
  };
}

/**
 * Evento de uma edição de conteúdo alheio: despublicar (de PUBLISHED para DRAFT) ou, nos demais
 * casos, editar.
 * @param {{ status: string }} before
 * @param {{ status?: string }} patch
 */
export function updateEvent(before, patch) {
  return before.status === "PUBLISHED" && patch.status === "DRAFT" ? CONTENT_EVENTS.unpublished : CONTENT_EVENTS.edited;
}

/** @param {unknown} error */
function logNoticeFailure(error) {
  console.error("[moderação] a escrita foi aplicada, mas a notificação ao dono falhou", error);
}

/**
 * Atualiza o conteúdo e, se houver `notification`, grava a notificação ao dono (ver o aviso do
 * módulo sobre a atomicidade).
 * @param {string} id
 * @param {Parameters<typeof updateContent>[1]} patch
 * @param {Parameters<typeof updateContent>[2]} options
 * @param {Parameters<typeof notify>[0] | null} notification `null` quando o autor edita o que é dele
 */
export async function updateWithNotice(id, patch, options, notification) {
  const updated = await updateContent(id, patch, options);
  if (notification) {
    try {
      await notify(notification);
    } catch (error) {
      logNoticeFailure(error);
      throw error;
    }
  }
  return updated;
}

/**
 * Exclui o conteúdo (e os descendentes, RN07) e, se houver `notification`, grava a notificação ao
 * dono (ver o aviso do módulo sobre a atomicidade).
 * @param {string} id
 * @param {Parameters<typeof notify>[0] | null} notification `null` quando o autor exclui o que é dele
 */
export async function deleteWithNotice(id, notification) {
  const removed = await deleteContent(id);
  if (notification) {
    try {
      await notify(notification);
    } catch (error) {
      logNoticeFailure(error);
      throw error;
    }
  }
  return removed;
}
