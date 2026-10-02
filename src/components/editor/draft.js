// Rascunho local do editor (M09; RF15, CT20): o texto fica no navegador, no localStorage, até ser
// enviado. A chave é por USUÁRIO e por conteúdo (A-010, nota 10): em um navegador compartilhado,
// o rascunho de um usuário nunca aparece para outro. Os rascunhos são apagados ao sair
// (`clearAllDrafts`, chamado pelo botão "Sair" do painel).
//
// O localStorage pode estar indisponível (janela privada, dados bloqueados) ou cheio: toda
// leitura e escrita é protegida, e o editor continua funcionando sem rascunho.

/** Prefixo de todas as chaves do editor no localStorage. */
export const DRAFT_KEY_PREFIX = "vitrine:rascunho:";

/** Segmento da chave de um conteúdo que ainda não foi criado. */
const NEW_CONTENT = "novo";

/**
 * Campos que o editor altera.
 * @typedef {{ title: string, slug: string, body: string, status: "DRAFT" | "PUBLISHED" }} EditorValues
 */

/**
 * Rascunho guardado. `baseVersion` é a versão do conteúdo no servidor em que o rascunho se
 * baseou (por exemplo, o `updatedAt`); se o conteúdo mudou depois, o rascunho está defasado.
 * @typedef {{ values: EditorValues, baseVersion: string | null, savedAt: string }} Draft
 */

/**
 * Chave do rascunho de um conteúdo de um usuário: `vitrine:rascunho:{userId}:{contentId}`, ou
 * `...:novo` enquanto o conteúdo não existe.
 * @param {string} userId identificador do usuário autenticado
 * @param {string | null | undefined} contentId identificador do conteúdo; vazio para um novo
 * @returns {string}
 */
export function draftStorageKey(userId, contentId) {
  if (typeof userId !== "string" || userId === "") {
    throw new TypeError("O rascunho local exige o identificador do usuário.");
  }
  return `${DRAFT_KEY_PREFIX}${userId}:${contentId || NEW_CONTENT}`;
}

/** O localStorage, ou `null` se o navegador o recusa (até o acesso à propriedade pode lançar). */
function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {value is EditorValues} */
function isEditorValues(value) {
  if (typeof value !== "object" || value === null) return false;
  const { title, slug, body, status } = /** @type {Record<string, unknown>} */ (value);
  return typeof title === "string" && typeof slug === "string" && typeof body === "string" && (status === "DRAFT" || status === "PUBLISHED");
}

/**
 * Lê e valida um rascunho guardado. Dado corrompido ou de outro formato vale como ausente.
 * @param {string | null} raw conteúdo do localStorage
 * @returns {Draft | null}
 */
export function parseDraft(raw) {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || !isEditorValues(data.values)) return null;
    if (typeof data.savedAt !== "string" || Number.isNaN(Date.parse(data.savedAt))) return null;
    if (data.baseVersion !== null && typeof data.baseVersion !== "string") return null;
    const { title, slug, body, status } = data.values;
    return { values: { title, slug, body, status }, baseVersion: data.baseVersion, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

/**
 * Rascunho guardado sob `key`, ou `null` se não há, está corrompido ou o armazenamento falha.
 * @param {string} key
 * @returns {Draft | null}
 */
export function readDraft(key) {
  try {
    return parseDraft(storage()?.getItem(key) ?? null);
  } catch {
    return null;
  }
}

/**
 * Guarda um rascunho. Devolve o rascunho gravado, ou `null` se o navegador recusou (armazenamento
 * indisponível ou cheio).
 * @param {string} key
 * @param {{ values: EditorValues, baseVersion: string | null }} draft
 * @returns {Draft | null}
 */
export function writeDraft(key, { values, baseVersion }) {
  const { title, slug, body, status } = values;
  /** @type {Draft} */
  const stored = { values: { title, slug, body, status }, baseVersion, savedAt: new Date().toISOString() };
  try {
    const area = storage();
    if (!area) return null;
    area.setItem(key, JSON.stringify(stored));
    return stored;
  } catch {
    return null;
  }
}

/** @param {string} key */
export function removeDraft(key) {
  try {
    storage()?.removeItem(key);
  } catch {
    // sem armazenamento: nada a remover
  }
}

/**
 * Apaga todos os rascunhos do editor, de qualquer usuário e conteúdo. É chamada ao encerrar a
 * sessão, para que o texto de um usuário não fique em um navegador compartilhado.
 * @returns {number} quantos rascunhos foram apagados
 */
export function clearAllDrafts() {
  try {
    const area = storage();
    if (!area) return 0;
    // Primeiro coleta as chaves: remover durante a iteração desloca os índices.
    const keys = [];
    for (let index = 0; index < area.length; index += 1) {
      const key = area.key(index);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) area.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}
