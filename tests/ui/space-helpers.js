// Auxiliares dos testes do espaço público (não é um arquivo de teste): uma árvore fictícia de cinco
// níveis, no formato do ContentNode de src/lib/content-tree.js, e um construtor de nós.

let counter = 0;

/**
 * @param {string} title
 * @param {string} slug
 * @param {"DOCUMENT" | "COLLECTION"} type
 * @param {import("@/lib/content-tree").ContentNode[]} [children]
 * @returns {import("@/lib/content-tree").ContentNode}
 */
export function node(title, slug, type, children = []) {
  counter += 1;
  return { id: `n${counter}`, title, slug, type, status: "PUBLISHED", order: counter, parentId: null, createdAt: new Date(2026, 9, 1), children };
}

/**
 * Coleção "Algoritmos e Estruturas de Dados" (slug `algoritmos`):
 *   Introdução (coleção): O que é C · História de C
 *   Variáveis (documento)
 *   Estruturas (coleção) > Listas > Listas encadeadas > Nós > Ponteiros duplos (5 níveis)
 *   Arquivos (documento)
 */
export function sampleCollection() {
  const deep = node("Ponteiros duplos", "ponteiros-duplos", "DOCUMENT");
  const nos = node("Nós", "nos", "COLLECTION", [deep]);
  const encadeadas = node("Listas encadeadas", "encadeadas", "COLLECTION", [nos]);
  const listas = node("Listas", "listas", "COLLECTION", [encadeadas]);
  return node("Algoritmos e Estruturas de Dados", "algoritmos", "COLLECTION", [
    node("Introdução", "introducao", "COLLECTION", [node("O que é C", "o-que-e-c", "DOCUMENT"), node("História de C", "historia", "DOCUMENT")]),
    node("Variáveis", "variaveis", "DOCUMENT"),
    node("Estruturas", "estruturas", "COLLECTION", [listas]),
    node("Arquivos", "arquivos", "DOCUMENT"),
  ]);
}
