// Regras das rotas de conteúdo que precisam olhar a árvore: sugestão de slug em caso de conflito
// (UC05, fluxo A1). As consultas são sempre de src/lib/db.js e sempre da árvore de UM dono (RN13):
// o slug da raiz fica sob `/{handle}`, de modo que não há nomes reservados nele (RN03).
import { getContentTree } from "@/lib/db";
import { suggestSlug } from "@/lib/validators";
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
 * Executa uma escrita e, se ela falhar por slug duplicado, responde 409 com o slug recusado e
 * uma sugestão livre entre os irmãos do pai de destino, na árvore do dono.
 * @template T
 * @param {{ slug: string, parentId: string | null, ownerId: string }} target slug, pai e dono resultantes
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export async function withSlugSuggestion(target, write) {
  try {
    return await write();
  } catch (error) {
    if (!isDataError(error) || error.code !== "SLUG_CONFLICT") throw error;

    const tree = await getContentTree({ ownerId: target.ownerId });
    const siblings = target.parentId === null ? tree : (findNode(tree, target.parentId)?.children ?? []);
    const suggestion = suggestSlug(
      target.slug,
      siblings.map((node) => node.slug),
    );

    const { status, code, message } = mapDataError(error);
    throw new ApiError(status, code, message, [
      { field: "slug", value: target.slug, ...(suggestion ? { suggestion } : {}) },
    ]);
  }
}
