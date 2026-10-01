// Regras das rotas de conteúdo que precisam olhar a árvore: slug reservado na raiz (RN03) e
// sugestão de slug em caso de conflito (UC05, fluxo A1). As consultas são sempre de src/lib/db.js.
import { getContentTree } from "@/lib/db";
import { isReservedRootSlug, reservedSlugMessage, suggestSlug } from "@/lib/validators";
import { ApiError, isDataError, mapDataError } from "./http";

/**
 * Nó da árvore com o identificador `id`, ou `null`.
 * @param {import("@/lib/content-tree").ContentNode[]} roots
 * @param {string} id
 * @returns {import("@/lib/content-tree").ContentNode | null}
 */
export function findNode(roots, id) {
  for (const node of roots) {
    if (node.id === id) return node;
    const below = findNode(node.children, id);
    if (below) return below;
  }
  return null;
}

/**
 * RN03 (D-05): `admin`, `api`, `login` e `_next` são reservados no nível raiz.
 * @param {string} slug
 * @param {string | null | undefined} parentId pai resultante da operação
 * @param {string} [field] campo indicado em `details`
 */
export function assertSlugAllowed(slug, parentId, field = "slug") {
  if (isReservedRootSlug(slug, parentId)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
      { field, message: reservedSlugMessage(slug) },
    ]);
  }
}

/**
 * Executa uma escrita e, se ela falhar por slug duplicado, responde 409 com o slug recusado e
 * uma sugestão livre entre os irmãos do pai de destino.
 * @template T
 * @param {{ slug: string, parentId: string | null }} target slug e pai resultantes da operação
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export async function withSlugSuggestion(target, write) {
  try {
    return await write();
  } catch (error) {
    if (!isDataError(error) || error.code !== "SLUG_CONFLICT") throw error;

    const tree = await getContentTree();
    const siblings = target.parentId === null ? tree : (findNode(tree, target.parentId)?.children ?? []);
    const taken = siblings.map((node) => node.slug);
    // Na raiz, os slugs reservados também não podem ser sugeridos.
    let suggestion = suggestSlug(target.slug, taken);
    if (suggestion && isReservedRootSlug(suggestion, target.parentId)) suggestion = null;

    const { status, code, message } = mapDataError(error);
    throw new ApiError(status, code, message, [
      { field: "slug", value: target.slug, ...(suggestion ? { suggestion } : {}) },
    ]);
  }
}
