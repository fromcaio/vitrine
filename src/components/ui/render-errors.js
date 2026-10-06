// Mensagens das duas recusas novas da gravação de texto (ADR-033; A-021): o texto que o
// *pipeline* de renderização não processa a tempo (422 `CONTENT_TOO_COMPLEX`) e a fila de validação
// cheia (503 `BUSY`, com `Retry-After`). Em português, num só lugar, para o editor e o formulário do
// portal dizerem a mesma coisa. Módulo sem React.

/** A mensagem exata do 422 `CONTENT_TOO_COMPLEX`, que aparece junto do campo do texto. */
export const TOO_COMPLEX_MESSAGE = "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.";

/**
 * A mensagem do 503 `BUSY`, com o tempo de espera do cabeçalho `Retry-After` (em segundos), se vier.
 * @param {string | null | undefined} retryAfter valor do cabeçalho
 * @returns {string}
 */
export function busyMessage(retryAfter) {
  const seconds = Number.parseInt(retryAfter ?? "", 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return "O servidor está ocupado agora. Tente de novo em instantes.";
  return `O servidor está ocupado agora. Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.`;
}
