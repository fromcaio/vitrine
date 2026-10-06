// Cotas por usuário (RN25, ADR-023, ADR-028 item 5): módulo puro, sem Prisma nem Next.js, que serve
// de padrão para `createContent` e `updateContent` de db.js. Em produção, o Core lê as variáveis
// MAX_CONTENTS_PER_USER e MAX_BODY_BYTES e passa os valores por parâmetro (`{ limits }`); db.js
// nunca lê variáveis de ambiente.

/** Máximo de conteúdos de um usuário, em qualquer estado (RN25). */
export const DEFAULT_MAX_CONTENTS_PER_USER = 500;

/** Máximo do corpo de um conteúdo, em bytes UTF-8 (RN25, ADR-033): 64 KiB (era 256 KiB; o renderizador tem custo superlinear). */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * @typedef {Object} Limits
 * @property {number} maxContentsPerUser conteúdos por usuário, em qualquer estado
 * @property {number} maxBodyBytes bytes UTF-8 de cada corpo
 */

/** @type {Readonly<Limits>} */
export const DEFAULT_LIMITS = Object.freeze({
  maxContentsPerUser: DEFAULT_MAX_CONTENTS_PER_USER,
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
});

/**
 * Tamanho de um corpo em **bytes** UTF-8 (RN25), e não em caracteres: "ação" tem 4 caracteres e 6
 * bytes, e o `length()` do SQLite conta caracteres. Usa `TextEncoder`, presente no Node e no
 * navegador (o editor pode mostrar o consumo da cota com a mesma função).
 * @param {string | null | undefined} body
 * @returns {number} 0 para corpo ausente
 */
export function bodyBytes(body) {
  if (body === null || body === undefined) return 0;
  return new TextEncoder().encode(body).length;
}

/**
 * Completa os limites recebidos com os padrões. Valores que não são inteiros positivos são
 * ignorados, para que uma variável de ambiente malformada nunca desligue a cota.
 * @param {Partial<Limits> | undefined} limits
 * @returns {Limits}
 */
export function resolveLimits(limits) {
  /** @param {unknown} value @param {number} fallback */
  const positive = (value, fallback) => (Number.isInteger(value) && /** @type {number} */ (value) > 0 ? /** @type {number} */ (value) : fallback);
  return {
    maxContentsPerUser: positive(limits?.maxContentsPerUser, DEFAULT_LIMITS.maxContentsPerUser),
    maxBodyBytes: positive(limits?.maxBodyBytes, DEFAULT_LIMITS.maxBodyBytes),
  };
}
