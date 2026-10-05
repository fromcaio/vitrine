// PATCH /api/contents/reorder (Cap. 5 §5.10): move e reordena conteúdos em lote (UC07), sempre na
// árvore do dono da sessão. Um item de outro dono recusa o lote INTEIRO com 403 (RN19), mesmo para o
// administrador: reordenar não é uma ação de moderação.
import { authorize } from "@/lib/authz";
import { getContentById, getContentTree, reorderContents } from "@/lib/db";
import { contentReorderSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../_lib/http";
import { currentLimits } from "../../_lib/limits";
import { captureSpace, revalidateStructure } from "../../_lib/revalidation";
import { route } from "../../_lib/route";

/**
 * Aplica o lote `[{ id, parentId?, order }]` em uma única transação (RN05, RN06): um item
 * inválido rejeita o lote inteiro. Revalida a página inicial do espaço e os caminhos públicos do dono,
 * de antes e de depois (RN10, ADR-030; o lote não tem um nó só, então vale o espaço inteiro), e
 * devolve a árvore atualizada do dono.
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
    let directory = false;
    for (const [index, item] of items.entries()) {
      const content = await getContentById(item.id);
      if (!content) throw new ApiError(404, "NOT_FOUND", "Conteúdo não encontrado.", [{ field: `${index}.id`, value: item.id }]);
      const decision = authorize(actor, "content:reorder", { ownerId: content.authorId });
      if (!decision.allowed) throw new ApiError(decision.status, decision.code, "Você não tem permissão para esta operação.");
      if (decision.foreign) throw new ApiError(403, "FORBIDDEN", "Você não tem permissão para esta operação.");
      // Entrar na raiz ou sair dela muda o diretório do portal (RN28).
      if (item.parentId !== undefined && item.parentId !== content.parentId && (item.parentId === null || content.parentId === null)) {
        directory = true;
      }
    }

    const snapshot = await captureSpace(actor.id);
    await reorderContents(items, { ownerId: actor.id });

    await revalidateStructure({ ownerId: actor.id, before: snapshot, directory });
    return ok(await getContentTree({ ownerId: actor.id }));
  },
);
