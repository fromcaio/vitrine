// Modelo do motivo e do prazo da moderação (RF27, RF34; RN19, RN23, RN26): funções puras, sem React.
// O servidor é a autoridade (RF21): estas regras repetem as de `validators.js` (`reasonSchema`,
// `banSchema`) só para poupar uma ida ao servidor e dar a mensagem junto do campo.

/** RN19, RN26: tamanho máximo do motivo, depois de aparado (repete `REASON_MAX_LENGTH` de validators.js; um teste os compara). */
export const REASON_MAX_LENGTH = 500;

/**
 * Valida o motivo de uma ação do administrador: de 1 a 500 caracteres DEPOIS de aparado (vazio ou só
 * de espaços é recusado). Devolve o motivo já aparado, que é o que se envia.
 * @param {string} raw o que foi digitado
 * @returns {{ reason: string, error: string | null }}
 */
export function validateReason(raw) {
  const reason = String(raw ?? "").trim();
  if (reason === "") return { reason, error: "Informe o motivo." };
  if (reason.length > REASON_MAX_LENGTH) return { reason, error: `O motivo deve ter no máximo ${REASON_MAX_LENGTH} caracteres.` };
  return { reason, error: null };
}

/**
 * O prazo de uma suspensão, de um campo `datetime-local` (hora local, sem fuso) para ISO 8601 (UTC),
 * que é o que a API recebe. Vazio é "sem prazo" (dura até reativar). Recusa data inválida e prazo que
 * não está no futuro (RN23).
 * @param {string} value o valor do campo, como `2026-10-20T18:30`
 * @param {number} [now] o instante atual em milissegundos (os testes o fixam)
 * @returns {{ iso: string | null, error: string | null }}
 */
export function deadlineFromLocal(value, now = Date.now()) {
  const text = String(value ?? "").trim();
  if (text === "") return { iso: null, error: null };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) return { iso: null, error: "Informe uma data e uma hora válidas." };
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return { iso: null, error: "Informe uma data e uma hora válidas." };
  if (time <= now) return { iso: null, error: "O prazo da suspensão deve estar no futuro." };
  return { iso: new Date(time).toISOString(), error: null };
}

/**
 * O menor valor que o campo `datetime-local` aceita (o minuto seguinte), na hora local.
 * @param {number} [now]
 * @returns {string}
 */
export function minDeadlineLocal(now = Date.now()) {
  const date = new Date(now + 60_000);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
