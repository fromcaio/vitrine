// Modelo da árvore do painel (RF03, RF06, RF07, RF26; RN02, RN05, RN06, RN07, RN16, RN25; M10): funções
// puras e imutáveis sobre a árvore que `GET /api/contents` devolve, sem React nem DOM. O servidor é a
// autoridade (RF21): estas funções só calculam o que a tela mostra e o que ela envia antes de o
// servidor responder (a ordem otimista, a lista de destinos de "mover").
//
// Nó: `{ id, title, slug, type: "DOCUMENT" | "COLLECTION", status: "PUBLISHED" | "DRAFT", parentId,
// order, children }`, sem o corpo. Os filhos chegam na ordem da árvore (RN05).
import { slugFromTitle } from "@/components/editor/format";

/**
 * @typedef {object} TreeNode
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {"DOCUMENT" | "COLLECTION"} type
 * @property {"PUBLISHED" | "DRAFT"} status
 * @property {string | null} parentId
 * @property {number} order
 * @property {TreeNode[]} children
 */

/** RN03: letras minúsculas, dígitos e hífens (repete `SLUG_PATTERN` de validators.js; um teste os compara). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** RN03: tamanho máximo do slug. */
export const SLUG_MAX_LENGTH = 80;

/**
 * Árvore saneada: só os campos conhecidos, com os tipos esperados (um nó malformado não derruba a
 * tela). Só uma COLLECTION tem filhos (RN02); a ordem dos irmãos é a recebida.
 * @param {unknown} raw
 * @returns {TreeNode[]}
 */
export function normalizeTree(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {TreeNode[]} */
  const nodes = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id === "") continue;
    const type = item.type === "COLLECTION" ? "COLLECTION" : "DOCUMENT";
    nodes.push({
      id: item.id,
      title: typeof item.title === "string" ? item.title : "",
      slug: typeof item.slug === "string" ? item.slug : "",
      type,
      status: item.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      order: Number.isInteger(item.order) ? item.order : 0,
      children: type === "COLLECTION" ? normalizeTree(item.children) : [],
    });
  }
  return nodes;
}

/**
 * Quantos conteúdos há na árvore, em qualquer estado (a cota da RN25 conta todos).
 * @param {TreeNode[]} roots
 * @returns {number}
 */
export function countNodes(roots) {
  let total = 0;
  for (const node of roots) total += 1 + countNodes(node.children);
  return total;
}

/**
 * Quantos descendentes (filhos, netos...) um nó tem: o que a exclusão leva junto (RN07).
 * @param {TreeNode} node
 * @returns {number}
 */
export function countDescendants(node) {
  return countNodes(node.children);
}

/**
 * Quantos descendentes estão PUBLISHED (e, portanto, sairiam do ar se o nó fosse despublicado, RN16).
 * @param {TreeNode} node
 * @returns {number}
 */
export function countPublishedDescendants(node) {
  let total = 0;
  for (const child of node.children) total += (child.status === "PUBLISHED" ? 1 : 0) + countPublishedDescendants(child);
  return total;
}

/**
 * O nó com este id, com o irmão-lista, o índice, o pai e o nível.
 * @param {TreeNode[]} roots
 * @param {string} id
 * @returns {{ node: TreeNode, siblings: TreeNode[], index: number, parent: TreeNode | null, depth: number } | null}
 */
export function locate(roots, id, parent = /** @type {TreeNode | null} */ (null), depth = 0) {
  for (const [index, node] of roots.entries()) {
    if (node.id === id) return { node, siblings: roots, index, parent, depth };
    const inside = locate(node.children, id, node, depth + 1);
    if (inside) return inside;
  }
  return null;
}

/**
 * O primeiro ancestral em rascunho de um nó, ou `null`: um nó publicado sob ele fica "oculto pelo
 * pai" (RN15, RN16: a coleção em rascunho esconde a subárvore, sem mudar o estado dos filhos).
 * @param {TreeNode[]} roots
 * @param {string} id
 * @returns {TreeNode | null}
 */
export function hidingAncestor(roots, id) {
  /** @type {TreeNode | null} */
  let found = null;
  /** @param {TreeNode[]} nodes @param {TreeNode | null} hider */
  const walk = (nodes, hider) => {
    for (const node of nodes) {
      if (node.id === id) {
        found = hider;
        return true;
      }
      if (walk(node.children, hider ?? (node.status === "DRAFT" ? node : null))) return true;
    }
    return false;
  };
  walk(roots, null);
  return found;
}

/**
 * Árvore com `change` aplicada ao nó. Imutável: só os nós do caminho são recriados.
 * @param {TreeNode[]} roots
 * @param {string} id
 * @param {(node: TreeNode) => TreeNode} change
 * @returns {TreeNode[]}
 */
function update(roots, id, change) {
  return roots.map((node) => {
    if (node.id === id) return change(node);
    if (node.children.length === 0) return node;
    const children = update(node.children, id, change);
    return children === node.children || children.every((child, index) => child === node.children[index]) ? node : { ...node, children };
  });
}

/**
 * Árvore com o estado do nó trocado (publicar ou despublicar; RN16).
 * @param {TreeNode[]} roots
 * @param {string} id
 * @param {"PUBLISHED" | "DRAFT"} status
 */
export function withStatus(roots, id, status) {
  return update(roots, id, (node) => ({ ...node, status }));
}

/**
 * Árvore sem o nó e sem os seus descendentes (RN07).
 * @param {TreeNode[]} roots
 * @param {string} id
 * @returns {TreeNode[]}
 */
export function withoutNode(roots, id) {
  return roots
    .filter((node) => node.id !== id)
    .map((node) => (node.children.length === 0 ? node : { ...node, children: withoutNode(node.children, id) }));
}

/**
 * Sobe ou desce um nó entre os irmãos (RF03, RN05): troca de lugar com o vizinho. Devolve a árvore
 * já trocada (para a tela otimista) e o lote que o servidor recebe: TODOS os irmãos daquele nível,
 * renumerados de 0 a n-1 com o mesmo pai, de modo que a ordem fica inequívoca mesmo se os números
 * gravados tinham lacunas ou empates. `null` se o nó já está na ponta.
 * @param {TreeNode[]} roots
 * @param {string} id
 * @param {-1 | 1} direction `-1` sobe, `1` desce
 * @returns {{ roots: TreeNode[], items: { id: string, parentId: string | null, order: number }[], position: number, total: number } | null}
 */
export function swapWithSibling(roots, id, direction) {
  const where = locate(roots, id);
  if (!where) return null;
  const target = where.index + direction;
  if (target < 0 || target >= where.siblings.length) return null;
  const reordered = [...where.siblings];
  [reordered[where.index], reordered[target]] = [reordered[target], reordered[where.index]];
  const parentId = where.parent ? where.parent.id : null;
  const numbered = reordered.map((node, order) => ({ ...node, order }));
  const next = parentId === null ? numbered : update(roots, parentId, (parent) => ({ ...parent, children: numbered }));
  return {
    roots: next,
    items: numbered.map((node) => ({ id: node.id, parentId, order: node.order })),
    position: target + 1,
    total: reordered.length,
  };
}

/**
 * Destinos de "mover" (RF07, RN06): a raiz do espaço e as COLEÇÕES do próprio usuário (a árvore
 * só tem as dele), menos o próprio nó e os seus descendentes (mover para dentro de si criaria um
 * ciclo) e menos o pai atual (não mudaria nada). Documentos não são destino (RN02).
 * @param {TreeNode[]} roots
 * @param {string} id
 * @returns {{ value: string, label: string, depth: number }[]} `value` vazio é a raiz
 */
export function moveTargets(roots, id) {
  const where = locate(roots, id);
  if (!where) return [];
  const currentParent = where.parent ? where.parent.id : null;
  /** @type {{ value: string, label: string, depth: number }[]} */
  const targets = [];
  if (currentParent !== null) targets.push({ value: "", label: "Raiz do espaço (sem coleção)", depth: 0 });
  /** @param {TreeNode[]} nodes @param {string[]} path @param {number} depth */
  const walk = (nodes, path, depth) => {
    for (const node of nodes) {
      if (node.type !== "COLLECTION" || node.id === id) continue; // o nó e a sua subárvore ficam de fora
      const here = [...path, node.title];
      if (node.id !== currentParent) targets.push({ value: node.id, label: here.join(" › "), depth: depth + 1 });
      walk(node.children, here, depth + 1);
    }
  };
  walk(roots, [], 0);
  return targets;
}

/**
 * Sugestão de slug para um título, livre entre os irmãos: o slug do título e, se já existe, `-2`, `-3`...
 * Vazio se o título não tem letra nem dígito.
 * @param {string} title
 * @param {Iterable<string>} taken slugs que os irmãos já usam
 * @returns {string}
 */
export function suggestSlug(title, taken) {
  const base = slugFromTitle(title);
  if (base === "") return "";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Erros do formulário de nova coleção, por campo (o servidor valida de novo, RF21).
 * @param {{ title: string, slug: string }} values
 * @returns {{ title?: string, slug?: string }}
 */
export function validateNewCollection({ title, slug }) {
  /** @type {{ title?: string, slug?: string }} */
  const errors = {};
  if (title.trim() === "") errors.title = "O título é obrigatório.";
  if (slug === "") errors.slug = "O slug é obrigatório.";
  else if (slug.length > SLUG_MAX_LENGTH) errors.slug = `O slug deve ter no máximo ${SLUG_MAX_LENGTH} caracteres.`;
  else if (!SLUG_PATTERN.test(slug)) errors.slug = "O slug deve conter apenas letras minúsculas, dígitos e hífens.";
  return errors;
}

/**
 * Os slugs dos filhos diretos de um pai (ou das raízes, com `null`).
 * @param {TreeNode[]} roots
 * @param {string | null} parentId
 * @returns {string[]}
 */
export function slugsUnder(roots, parentId) {
  if (parentId === null) return roots.map((node) => node.slug);
  return locate(roots, parentId)?.node.children.map((node) => node.slug) ?? [];
}

/**
 * Todas as coleções que têm filhos (as que se recolhem).
 * @param {TreeNode[]} roots
 * @returns {string[]}
 */
export function expandableIds(roots) {
  /** @type {string[]} */
  const ids = [];
  for (const node of roots) {
    if (node.type === "COLLECTION" && node.children.length > 0) ids.push(node.id);
    ids.push(...expandableIds(node.children));
  }
  return ids;
}
