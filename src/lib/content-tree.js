// Hierarquia de conteúdo (Cap. 5 §5.5.3): montagem da árvore em memória e resolução de caminho.
// Módulo puro: não importa o Prisma nem o Next.js, e por isso é testável sem banco.
//
// Com vários usuários (M15; ADR-024, ADR-028), cada árvore tem um só dono: as funções daqui
// recebem sempre as linhas, ou a floresta, de UM dono (db.js filtra por `authorId`), de modo que
// dois donos podem ter raízes com o mesmo slug e o caminho começa pelo handle do dono (RN04).

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
 * Caminhos públicos (RN04, RN15) de um nó e de seus descendentes, ou de toda a árvore: cada caminho
 * é a cadeia de slugs da raiz ao nó, em pré-ordem (o nó vem antes dos filhos, que seguem a ordem
 * da árvore). Serve à revalidação por caminhos literais antes e depois de uma escrita (ADR-030).
 *
 * Recebe a floresta **já podada** (`buildTree` com `onlyPublished`): um nó fora dela não é público.
 * Por isso devolve `[]` quando `nodeId` não está na floresta (inexistente, rascunho, ou sob um
 * ancestral em rascunho). Sem `nodeId`, devolve os caminhos da floresta inteira (o espaço todo).
 * A suspensão do dono não entra aqui: quem a altera chama a função antes e depois.
 *
 * @param {ContentNode[]} publishedRoots floresta de UM dono, podada pela RN15
 * @param {string | null} [nodeId] nó de partida; `null` ou omitido = a floresta inteira
 * @returns {string[][]}
 */
export function collectPublicPaths(publishedRoots, nodeId = null) {
  /** @type {string[][]} */
  const paths = [];

  /** @param {ContentNode} node @param {string[]} parentPath */
  const walk = (node, parentPath) => {
    const path = [...parentPath, node.slug];
    paths.push(path);
    for (const child of node.children) walk(child, path);
  };

  if (nodeId === null || nodeId === undefined) {
    for (const root of publishedRoots) walk(root, []);
    return paths;
  }

  /**
   * Busca o nó guardando o caminho dos ancestrais.
   * @param {ContentNode[]} level @param {string[]} parentPath
   * @returns {boolean}
   */
  const find = (level, parentPath) => {
    for (const node of level) {
      if (node.id === nodeId) {
        walk(node, parentPath);
        return true;
      }
      if (find(node.children, [...parentPath, node.slug])) return true;
    }
    return false;
  };
  find(publishedRoots, []);
  return paths;
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
