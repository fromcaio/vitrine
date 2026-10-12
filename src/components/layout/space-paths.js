// Caminhos e navegação do espaço público (RF12, RF13, RN04): funções puras sobre a árvore
// (`ContentNode` de src/lib/content-tree.js, já podada pela RN15), sem React nem Next.js, para o
// Core e os componentes compartilharem. Os componentes não conhecem o dono: o prefixo do espaço
// (`/{handle}`, ou "" no portal) chega por parâmetro.

/** @typedef {import("@/lib/content-tree").ContentNode} ContentNode */

/**
 * URL de um conteúdo: o prefixo do espaço e a cadeia de slugs (RN04), cada um codificado.
 * @param {string} basePath prefixo do espaço, sem barra final (por exemplo, `/maria`)
 * @param {string[]} slugs cadeia de slugs da raiz ao conteúdo
 */
export function contentHref(basePath, slugs) {
  const prefix = basePath.replace(/\/+$/, "");
  const path = slugs.map((slug) => encodeURIComponent(slug)).join("/");
  return `${prefix}/${path}`;
}

/**
 * `true` se `path` começa por `prefix` (um nó é ancestral do ativo, ou o próprio).
 * @param {string[]} path
 * @param {string[]} prefix
 */
function startsWith(path, prefix) {
  return prefix.length <= path.length && prefix.every((slug, index) => path[index] === slug);
}

/**
 * Itens da barra superior (RF13): as coleções raiz publicadas, na ordem da árvore. Só as coleções;
 * um documento solto na raiz não vira aba.
 * @param {ContentNode[]} roots raízes publicadas do espaço
 * @param {{ basePath: string, activeSlug?: string | null }} options `activeSlug`: o slug da raiz
 *   que contém a página corrente
 * @returns {{ id: string, label: string, href: string, current: boolean }[]}
 */
export function navItemsOf(roots, { basePath, activeSlug = null }) {
  return roots
    .filter((node) => node.type === "COLLECTION")
    .map((node) => ({
      id: node.id,
      label: node.title,
      href: contentHref(basePath, [node.slug]),
      current: node.slug === activeSlug,
    }));
}

/**
 * Ids dos nós da cadeia ativa: o nó da página corrente e todos os seus ancestrais dentro da
 * coleção. Servem para abrir, por padrão, o caminho até o item ativo.
 * @param {ContentNode} collection coleção raiz corrente
 * @param {string[]} activePath cadeia de slugs da página corrente, a partir da raiz
 * @returns {Set<string>}
 */
export function activeIds(collection, activePath) {
  /** @type {Set<string>} */
  const ids = new Set();
  if (activePath[0] !== collection.slug) return ids;
  ids.add(collection.id);
  let level = collection.children;
  for (const slug of activePath.slice(1)) {
    const node = level.find((candidate) => candidate.slug === slug);
    if (!node) break;
    ids.add(node.id);
    level = node.children;
  }
  return ids;
}

/**
 * A trilha de títulos da coleção até a página corrente (P-026, rodada 2): o título da coleção e, abaixo dele, o de
 * cada nó da cadeia `activePath` até o corrente. Serve ao botão do menu lateral do celular ("AEDS I › P1 ›
 * Introdução"). Sem página aberta na coleção (`activePath` vazio), ou se algum slug não bate com a árvore (a
 * cadeia é de outra coleção ou está desatualizada), a trilha é só o título da coleção.
 * @param {ContentNode} collection coleção raiz corrente
 * @param {string[]} activePath cadeia de slugs da página corrente, a partir da raiz
 * @returns {string[]} os títulos, da coleção ao corrente (nunca vazio)
 */
export function trailOf(collection, activePath) {
  if (activePath[0] !== collection.slug) return [collection.title];
  const titles = [collection.title];
  let level = collection.children;
  for (const slug of activePath.slice(1)) {
    const node = level.find((candidate) => candidate.slug === slug);
    if (!node) return [collection.title];
    titles.push(node.title);
    level = node.children;
  }
  return titles;
}

/**
 * Documento anterior e seguinte (RF12): a ordem de leitura é a da árvore em profundidade, só com
 * os documentos (coleções não entram). Sem página corrente (ou se ela for uma coleção, ou não
 * estiver na árvore), os dois são nulos.
 * @param {ContentNode} collection coleção raiz corrente
 * @param {string[]} activePath cadeia de slugs da página corrente, a partir da raiz
 * @param {string} basePath prefixo do espaço
 * @returns {{ previous: { title: string, href: string } | null, next: { title: string, href: string } | null }}
 */
export function neighboursOf(collection, activePath, basePath) {
  /** @type {{ title: string, slugs: string[] }[]} */
  const documents = [];
  /** @param {ContentNode[]} nodes @param {string[]} parents */
  const walk = (nodes, parents) => {
    for (const node of nodes) {
      const slugs = [...parents, node.slug];
      if (node.type === "DOCUMENT") documents.push({ title: node.title, slugs });
      walk(node.children, slugs);
    }
  };
  walk(collection.children, [collection.slug]);

  const index = documents.findIndex(({ slugs }) => slugs.length === activePath.length && startsWith(activePath, slugs));
  if (index === -1) return { previous: null, next: null };
  /** @param {{ title: string, slugs: string[] } | undefined} entry */
  const link = (entry) => (entry ? { title: entry.title, href: contentHref(basePath, entry.slugs) } : null);
  return { previous: link(documents[index - 1]), next: link(documents[index + 1]) };
}
