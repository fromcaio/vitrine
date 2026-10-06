// Como o sino e a lista de notificações se falam (A-015, etapa 4; RF33): um evento do navegador. O
// sino fica no cabeçalho do painel (layout) e a lista, na página; são árvores de React separadas,
// de modo que um contexto exigiria um provedor no layout. O evento é o mais simples: a lista
// anuncia o `unreadCount` de cada resposta da API, e todo sino da página o adota. Módulo sem React.

/** Nome do evento da janela; o `detail` é `{ unreadCount: number }`. */
export const UNREAD_COUNT_EVENT = "vitrine:notificacoes-nao-lidas";

/**
 * Anuncia o contador de não lidas (o `unreadCount` de uma resposta da API) a quem estiver ouvindo.
 * Valor que não é um inteiro não negativo é ignorado.
 * @param {unknown} unreadCount
 */
export function announceUnreadCount(unreadCount) {
  if (typeof window === "undefined" || !Number.isInteger(unreadCount) || /** @type {number} */ (unreadCount) < 0) return;
  window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT, { detail: { unreadCount } }));
}

/**
 * Passa a ouvir o contador. Devolve a função que para de ouvir.
 * @param {(unreadCount: number) => void} listener
 * @returns {() => void}
 */
export function onUnreadCount(listener) {
  /** @param {Event} event */
  const handler = (event) => {
    const count = /** @type {CustomEvent<{ unreadCount?: unknown }>} */ (event).detail?.unreadCount;
    if (Number.isInteger(count) && /** @type {number} */ (count) >= 0) listener(/** @type {number} */ (count));
  };
  window.addEventListener(UNREAD_COUNT_EVENT, handler);
  return () => window.removeEventListener(UNREAD_COUNT_EVENT, handler);
}
