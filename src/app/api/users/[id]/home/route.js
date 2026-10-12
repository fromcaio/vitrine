// /api/users/:id/home (Cap. 5 §5.10; RF43, RN19, RN26, RN37, ADR-040): o administrador MODERA a página inicial
// de outro usuário: despublica (`PATCH` com `{ status: "DRAFT", reason }`) ou apaga o texto (`DELETE
// ?reason=`). Nunca a reescreve: `GET` e `PUT` não existem (405). O motivo (1 a 500 caracteres) é obrigatório
// (422 sem ele), e o dono recebe a notificação `MODERATION` (`HOME_UNPUBLISHED` ou `HOME_REMOVED`, com o
// motivo) gravada na MESMA transação da ação (`unpublishHome` e `removeHome`, do Dados): se uma falha, a outra
// não acontece. 404 se o usuário não existe, ou se a página já está fora do ar (`PATCH`) ou vazia (`DELETE`);
// 403 ao usuário comum e ao administrador sobre a PRÓPRIA página (esse a edita em /api/home). Revalida a
// página inicial do espaço do dono.
import { findUserById } from "@/lib/auth";
import { removeHome, unpublishHome } from "@/lib/db";
import { homeModerationSchema, homeRemovalQuerySchema } from "@/lib/validators";
import { ApiError, noContent, ok, parse } from "../../../_lib/http";
import { revalidateSpaceHome } from "../../../_lib/revalidation";
import { route } from "../../../_lib/route";

/** @param {{ params: Record<string, string> }} context */
const target = async ({ params }) => ({ ownerId: params.id });

/**
 * Confere o alvo da moderação, depois do motivo: nunca a própria página (403) e só um usuário que existe (404).
 * @param {string} id
 * @param {{ id: string }} actor
 */
async function assertModeratable(id, actor) {
  if (id === actor.id) {
    throw new ApiError(403, "FORBIDDEN", "Para alterar a sua página inicial, use a página Página inicial do painel.");
  }
  if (!(await findUserById(id))) {
    throw new ApiError(404, "NOT_FOUND", "Usuário não encontrado.", [{ field: "id", value: id }]);
  }
}

/** PATCH: despublica (`homeStatus` passa a `DRAFT`); 200 com o estado novo da página (`HomeView`). */
export const PATCH = route(
  { action: "home:moderate", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, readJson }) => {
    const { reason } = parse(homeModerationSchema, await readJson());
    await assertModeratable(params.id, actor);
    const home = await unpublishHome(params.id, { notification: { data: { reason } } });
    await revalidateSpaceHome(params.id);
    return ok(home);
  },
);

/** DELETE: apaga o texto (`homeBody` vira `null`; mantém o estado e o interruptor); 204. */
export const DELETE = route(
  { action: "home:moderate", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, request }) => {
    const { reason } = parse(homeRemovalQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    await assertModeratable(params.id, actor);
    await removeHome(params.id, { notification: { data: { reason } } });
    await revalidateSpaceHome(params.id);
    return noContent();
  },
);
