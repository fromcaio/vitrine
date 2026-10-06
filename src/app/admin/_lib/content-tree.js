// Apoio ao painel de conteúdo (A-014 Parte 3e-1; RF03, RF06, RF07, RF26, RF28): a árvore do dono em uma
// forma que um Componente Cliente aceita, os modelos de endereço que o `ContentTree` da UI usa, a contagem
// por estado da visão geral e o endereço do espaço público. Pasta privada do App Router: não gera rota.

/**
 * Modelo do endereço de edição: o `ContentTree` troca `{id}` pelo identificador (codificado). É texto, e não
 * função, porque uma página de Servidor não passa funções a um Componente Cliente. Bate com
 * `admin/conteudo/[id]/page.js`.
 */
export const EDIT_HREF = "/admin/conteudo/{id}";

/**
 * Modelos dos endereços de criação (a raiz e dentro de uma coleção): `{parentId}` vira o `?pai=` que
 * `admin/conteudo/novo/page.js` confere. Texto, pelo mesmo motivo de `EDIT_HREF`.
 */
export const NEW_HREF = Object.freeze({
  root: "/admin/conteudo/novo",
  child: "/admin/conteudo/novo?pai={parentId}",
});

/**
 * A árvore do dono como JSON puro: o `ContentTree` é um Componente Cliente e descarta o que não é JSON (as
 * datas viram texto ISO, como na API). Mesma ida e volta de `admin/_lib/notifications.js`.
 * @param {import("@/lib/content-tree").ContentNode[]} tree
 * @returns {unknown[]}
 */
export function serializableTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

/**
 * Quantos conteúdos o dono tem, em cada estado (RF26): todos os nós da árvore, em qualquer nível, contados
 * por `status`. Documentos e coleções contam igual (a cota da RN25 também).
 * @param {import("@/lib/content-tree").ContentNode[]} tree
 * @returns {{ contents: number, published: number, drafts: number }}
 */
export function countContents(tree) {
  const counts = { contents: 0, published: 0, drafts: 0 };
  /** @param {import("@/lib/content-tree").ContentNode[]} nodes */
  const walk = (nodes) => {
    for (const node of nodes) {
      counts.contents += 1;
      if (node.status === "PUBLISHED") counts.published += 1;
      else counts.drafts += 1;
      walk(node.children);
    }
  };
  walk(tree);
  return counts;
}

/**
 * Endereço do espaço público do usuário: `/{handle}`, ou `null` sem handle (a UI mostra o aviso).
 * @param {string | null | undefined} handle
 */
export function spaceHrefOf(handle) {
  return typeof handle === "string" && handle !== "" ? `/${handle}` : null;
}
