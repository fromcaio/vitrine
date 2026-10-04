// PATCH /api/contents/reorder (Cap. 5 §5.10): move e reordena conteúdos em lote (UC07), sempre na
// árvore do dono da sessão. Um item de outro dono recusa o lote INTEIRO com 403 (RN19), mesmo para o
// administrador: reordenar não é uma ação de moderação.
import { authorize } from "@/lib/authz";
import { getContentById, getContentTree, reorderContents } from "@/lib/db";
import { revalidateContentTree } from "@/lib/revalidate";
import { contentReorderSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../_lib/http";
import { currentLimits } from "../../_lib/limits";
import { route } from "../../_lib/route";

/**
 * Aplica o lote `[{ id, parentId?, order }]` em uma única transação (RN05, RN06): um item
 * inválido rejeita o lote inteiro. Revalida o layout raiz e devolve a árvore atualizada do dono.
 *
 * O recurso desta rota é a árvore do próprio usuário (`load`); cada item do lote é autorizado
 * abaixo, antes de qualquer escrita, e um pai de outro dono é recusado pela camada de dados
 * (`OWNER_MISMATCH`, 422 `INVALID_PARENT`, indistinguível do pai inexistente).
 */
export const PATCH = route(
  { action: "content:reorder", mutation: true, rate: "content", load: async ({ actor }) => ({ ownerId: actor.id }) },
  async ({ actor, readJson }) => {
    const items = parse(contentReorderSchema, await readJson());
    if (items.length > currentLimits().maxContentsPerUser) {
      throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
        { field: "", message: "O lote tem itens demais." },
      ]);
    }

    // Autoriza item a item antes de alterar qualquer coisa: o primeiro item alheio recusa tudo.
    for (const [index, item] of items.entries()) {
      const content = await getContentById(item.id);
      if (!content) throw new ApiError(404, "NOT_FOUND", "Conteúdo não encontrado.", [{ field: `${index}.id`, value: item.id }]);
      const decision = authorize(actor, "content:reorder", { ownerId: content.authorId });
      if (!decision.allowed) throw new ApiError(decision.status, decision.code, "Você não tem permissão para esta operação.");
      if (decision.foreign) throw new ApiError(403, "FORBIDDEN", "Você não tem permissão para esta operação.");
    }

    await reorderContents(items, { ownerId: actor.id });

    revalidateContentTree();
    return ok(await getContentTree({ ownerId: actor.id }));
  },
);
