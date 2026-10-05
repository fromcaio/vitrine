// Moderação de conteúdo alheio (RF34, RN19, RN26, ADR-027; CT51): o administrador despublica, edita
// e exclui o conteúdo de outro dono, com o motivo, e o dono é notificado. Este módulo monta a
// notificação; a rota a entrega a `updateContent(id, patch, { notification })` ou a
// `deleteContent(id, { notification })`, de db.js, que a gravam NA MESMA TRANSAÇÃO da escrita: se a
// escrita falha (`VERSION_CONFLICT`, `SLUG_CONFLICT`...), nenhuma notificação nasce, e se a
// notificação falha, a escrita é desfeita.

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
