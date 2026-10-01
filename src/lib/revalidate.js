// Regras de revalidação sob demanda do cache ISR (RN10, RN16; Cap. 5 §5.7.2, Tabela de eventos).
// Chamado SOMENTE pelos Route Handlers, depois que a escrita no banco foi confirmada:
// src/lib/db.js não revalida, e `revalidatePath` não funciona em Componentes Cliente nem no Proxy.
import { revalidatePath } from "next/cache";

/**
 * Campos cuja mudança altera a árvore de navegação ou o conjunto de páginas públicas. O tipo não
 * consta da RN10, mas trocar DOCUMENT por COLLECTION muda a navegação; é tratado como estrutural.
 */
export const STRUCTURAL_FIELDS = /** @type {const} */ (["title", "slug", "parentId", "order", "status", "type"]);

/**
 * Alvo de uma revalidação: o layout raiz (todas as páginas) ou uma página.
 * @typedef {{ path: string, type?: "layout" }} RevalidationTarget
 */

/** Layout raiz: a sidebar, a barra superior e o rodapé estão em todas as páginas. */
export const ROOT_LAYOUT = /** @type {RevalidationTarget} */ ({ path: "/", type: "layout" });

/**
 * RN04: URL pública de um conteúdo, da cadeia de slugs da raiz ao nó.
 * @param {string[]} slugs
 */
export function publicPath(slugs) {
  return `/${slugs.join("/")}`;
}

/**
 * Cadeia de slugs da raiz até o nó `id`, ou `null` se ele não está na árvore.
 * @param {Array<{ id: string, slug: string, children?: any[] }>} roots árvore de getContentTree()
 * @param {string} id
 * @returns {string[] | null}
 */
export function findSlugPath(roots, id) {
  for (const node of roots) {
    if (node.id === id) return [node.slug];
    const below = findSlugPath(node.children ?? [], id);
    if (below) return [node.slug, ...below];
  }
  return null;
}

/**
 * RN10 e RN16: o que revalidar depois de atualizar um conteúdo.
 * - título, slug, pai, ordem, estado ou tipo mudaram: layout raiz;
 * - só o corpo mudou (ou nada mudou): apenas a página do documento.
 * @param {Record<string, unknown>} before conteúdo antes da atualização
 * @param {Record<string, unknown>} after conteúdo depois da atualização
 * @param {string[] | null} slugs cadeia de slugs do conteúdo atualizado
 * @returns {RevalidationTarget}
 */
export function contentUpdateTarget(before, after, slugs) {
  const structural = STRUCTURAL_FIELDS.some((field) => before[field] !== after[field]);
  // Sem o caminho não há como apontar a página: o layout raiz cobre todas.
  if (structural || !slugs || slugs.length === 0) return ROOT_LAYOUT;
  return { path: publicPath(slugs) };
}

/**
 * Marca o alvo para revalidação. Uma falha aqui não pode desfazer nem mascarar a escrita já
 * confirmada no banco (RNF10): é registrada, e o `revalidate` das páginas é a rede de segurança.
 * @param {RevalidationTarget} target
 * @returns {RevalidationTarget}
 */
function apply(target) {
  try {
    if (target.type) revalidatePath(target.path, target.type);
    else revalidatePath(target.path);
  } catch (error) {
    console.error(`[revalidate] falha ao revalidar ${target.path}`, error);
  }
  return target;
}

/** Criar, excluir, mover ou reordenar conteúdo: a árvore de navegação mudou. */
export function revalidateContentTree() {
  return apply(ROOT_LAYOUT);
}

/**
 * Atualização de um conteúdo (ver `contentUpdateTarget`).
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {string[] | null} slugs
 */
export function revalidateContentUpdate(before, after, slugs) {
  return apply(contentUpdateTarget(before, after, slugs));
}

/** Configuração (nome, logotipo, cores, links sociais): aparece em todas as páginas. */
export function revalidateConfiguration() {
  return apply(ROOT_LAYOUT);
}
