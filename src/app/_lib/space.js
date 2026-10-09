// Leitura do espaço público de um usuário (RF29, RN04, RN14, RN15, RN23; ADR-024, ADR-030): o que o
// layout e as páginas de `/{handle}` precisam, em funções de servidor. Pasta privada do App Router:
// não gera rota. Toda leitura do banco passa pela guarda do `next build` (ADR-021): no build não há
// banco, e `generateStaticParams` devolve `[]`.
import { cache } from "react";
import { resolvePath } from "@/lib/content-tree";
import { getContentByPath, getContentTree, getEffectiveAppearance, getPublicPaths, getUserByHandle, listPublicSpaces } from "@/lib/db";
import { getSiteConfiguration } from "./site";

/** @typedef {import("@/lib/content-tree").ContentNode} ContentNode */

/** O `next build` não consulta o banco (ADR-021): o estágio de build da imagem Docker não o tem. */
export const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

/**
 * O espaço público de um `handle`, ou `null` (404): handle inexistente, sem `handle`, de usuário
 * suspenso (RN23) ou no `next build`. O `handle` deve estar na forma canônica (minúsculas): a
 * consulta é exata, e `/Ana` não é o espaço de `ana`. Com o `cache` do React, o layout, a página e o
 * `generateMetadata` compartilham uma única leitura por requisição. A árvore vem podada pela RN15
 * (só publicados, sem subárvore de rascunho). A `appearance` é a EFETIVA (ADR-038): a do dono sobre a
 * do sistema, mesclada aqui, na geração da página (o espaço segue estático com ISR); o nome é o dela
 * (o do dono, ou o do sistema se ele não definiu um; ADR-038, item 8). `modeIconPair` é do sistema.
 * @param {string} handle
 */
export const getSpace = cache(async (handle) => {
  if (isBuildPhase()) return null;
  const owner = await getUserByHandle(handle);
  if (!owner || !owner.handle) return null;
  const [appearance, tree, site] = await Promise.all([
    getEffectiveAppearance(owner.id),
    getContentTree({ ownerId: owner.id, onlyPublished: true }),
    getSiteConfiguration(),
  ]);
  if (!appearance) return null;
  return {
    owner: /** @type {typeof owner & { handle: string }} */ (owner),
    appearance,
    tree,
    basePath: `/${owner.handle}`,
    name: appearance.siteName,
    modeIconPair: site?.modeIconPair ?? undefined,
  };
});

/**
 * Decodifica um segmento de URL; um segmento malformado nunca é um slug (RN03), então vira `null`.
 * @param {string} segment
 * @returns {string | null}
 */
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * O conteúdo publicado em `/{handle}/{...slug}` (RN04, RN15): o registro, com o corpo, e o nó da
 * árvore podada (com os filhos). `null` para o que não existe, é rascunho ou está sob um rascunho,
 * de modo que todos respondem o mesmo 404 (RF14).
 * @param {string} handle
 * @param {string[]} segments segmentos da URL depois do handle
 */
export const getPublicPage = cache(async (handle, segments) => {
  const space = await getSpace(handle);
  if (!space) return null;
  const slugs = segments.map(decodeSegment);
  if (slugs.length === 0 || slugs.some((slug) => slug === null)) return null;
  const path = /** @type {string[]} */ (slugs);
  const content = await getContentByPath(space.owner.id, path, { onlyPublished: true });
  const node = resolvePath(space.tree, path);
  if (!content || !node) return null;
  return { space, content, node, slugs: path };
});

/**
 * Caminho (cadeia de slugs) do primeiro documento descendente da coleção, na ORDEM DA ÁRVORE, em
 * profundidade: o primeiro filho que seja documento ou, se for coleção, o primeiro documento dentro
 * dela antes de passar ao irmão seguinte (RN14). `null` se não há documento publicado.
 * @param {ContentNode} collection nó da árvore podada (só publicados)
 * @param {string[]} path cadeia de slugs da coleção
 * @returns {string[] | null}
 */
export function firstDocumentPath(collection, path) {
  for (const child of collection.children) {
    const here = [...path, child.slug];
    if (child.type === "DOCUMENT") return here;
    const below = firstDocumentPath(child, here);
    if (below) return below;
  }
  return null;
}

/**
 * Parâmetros estáticos de `[handle]`: os espaços ativos com ao menos uma raiz publicada (RN28). Sem
 * dado no `next build` (ADR-021): as páginas nascem sob demanda e entram no cache (`dynamicParams`).
 * @returns {Promise<{ handle: string }[]>}
 */
export async function publicHandleParams() {
  if (isBuildPhase()) return [];
  return (await listPublicSpaces()).map(({ handle }) => ({ handle }));
}

/**
 * Parâmetros estáticos de `[handle]/[...slug]`: os caminhos públicos de cada espaço ativo. Sem dado no
 * `next build` (ADR-021).
 * @returns {Promise<{ handle: string, slug: string[] }[]>}
 */
export async function publicSlugParams() {
  if (isBuildPhase()) return [];
  const params = [];
  for (const space of await listPublicSpaces()) {
    for (const slug of await getPublicPaths(space.id)) params.push({ handle: space.handle, slug });
  }
  return params;
}
