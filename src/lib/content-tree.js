// Hierarquia de conteúdo (Cap. 5 §5.5.3): montagem da árvore em memória e resolução de caminho.
// Módulo puro: não importa o Prisma nem o Next.js, e por isso é testável sem banco.

/**
 * Linha de conteúdo sem o corpo, como devolvida pela consulta da árvore.
 * @typedef {Object} ContentRow
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {string} type "DOCUMENT" ou "COLLECTION"
 * @property {"DRAFT" | "PUBLISHED"} status
 * @property {number} order
 * @property {string | null} parentId
 * @property {Date} createdAt
 */

/**
 * @typedef {ContentRow & { children: ContentNode[] }} ContentNode
 */

/**
 * Compara irmãos: ordem crescente (RN05) e, em empate, data de criação; o id desempata
 * de forma determinística quando as datas também coincidem.
 * @param {ContentNode} a
 * @param {ContentNode} b
 */
function compareSiblings(a, b) {
  return (
    a.order - b.order ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Monta a floresta de conteúdos a partir das linhas planas, em tempo linear.
 *
 * Com `onlyPublished` (RN15), um nó DRAFT é removido junto com toda a sua subárvore: um
 * descendente PUBLISHED de um ancestral em rascunho também não aparece. Linhas cujo pai não
 * está nas linhas recebidas (órfãs) são descartadas. As linhas de entrada não são alteradas.
 *
 * @param {ContentRow[]} rows
 * @param {{ onlyPublished?: boolean }} [options]
 * @returns {ContentNode[]} nós raiz, com `children` ordenados em todos os níveis
 */
export function buildTree(rows, { onlyPublished = false } = {}) {
  /** @type {Map<string, ContentNode>} */
  const byId = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
  /** @type {ContentNode[]} */
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId === null || node.parentId === undefined) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent) parent.children.push(node);
  }

  /** @param {ContentNode[]} list @returns {ContentNode[]} */
  const finish = (list) =>
    list
      .filter((node) => !onlyPublished || node.status === "PUBLISHED")
      .sort(compareSiblings)
      .map((node) => ({ ...node, children: finish(node.children) }));

  return finish(roots);
}

/**
 * Resolve uma cadeia de slugs (RN04) a partir dos nós raiz.
 * @param {ContentNode[]} roots
 * @param {string[]} slugs
 * @returns {ContentNode | null} o nó, ou `null` se algum slug não existir (404; RF14, RN15)
 */
export function resolvePath(roots, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return null;
  let level = roots;
  /** @type {ContentNode | null} */
  let node = null;
  for (const slug of slugs) {
    node = level.find((candidate) => candidate.slug === slug) ?? null;
    if (!node) return null;
    level = node.children;
  }
  return node;
}

/**
 * RN06: mover `nodeId` para baixo de `newParentId` cria ciclo se o destino for o próprio nó
 * ou um de seus descendentes. Sobe a cadeia de ancestrais do destino procurando `nodeId`.
 * @param {Map<string, string | null>} parentOf mapa id → parentId do estado atual
 * @param {string} nodeId nó que será movido
 * @param {string | null} newParentId novo pai (`null` = raiz, nunca cria ciclo)
 * @returns {boolean}
 */
export function wouldCreateCycle(parentOf, nodeId, newParentId) {
  /** @type {Set<string>} */
  const seen = new Set();
  let current = newParentId;
  while (current !== null && current !== undefined && !seen.has(current)) {
    if (current === nodeId) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}
