// PATCH /api/contents/reorder (Cap. 5 §5.10): move e reordena conteúdos em lote (UC07).
import { getContentTree, reorderContents } from "@/lib/db";
import { revalidateContentTree } from "@/lib/revalidate";
import { contentReorderSchema } from "@/lib/validators";
import { assertSlugAllowed, findNode } from "../../_lib/contents";
import { ok, parse, readJson, route } from "../../_lib/http";

/**
 * Aplica o lote `[{ id, parentId?, order }]` em uma única transação (RN05, RN06): um item
 * inválido rejeita o lote inteiro. Revalida o layout raiz e devolve a árvore atualizada.
 */
export const PATCH = route(
  async ({ request }) => {
    const items = parse(contentReorderSchema, await readJson(request));

    // RN03: um conteúdo movido para a raiz não pode ter slug reservado.
    const movedToRoot = items.filter((item) => item.parentId === null);
    if (movedToRoot.length > 0) {
      const tree = await getContentTree();
      for (const item of movedToRoot) {
        const node = findNode(tree, item.id);
        if (node) assertSlugAllowed(node.slug, null, `${items.indexOf(item)}.parentId`);
      }
    }

    await reorderContents(items);

    revalidateContentTree();
    return ok(await getContentTree());
  },
  { mutation: true },
);
