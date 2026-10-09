// /api/users/:id/avatar (Cap. 5 §5.10, tab:api-v1; RF36, RN19, RN26, RN29): o administrador REMOVE o avatar de outro
// usuário (nunca o troca: a imagem de outro só sai, RN19). O motivo (`?reason=`, 1 a 500 caracteres) é obrigatório
// (422 sem ele), e o dono recebe a notificação `MODERATION` com o evento `AVATAR_REMOVED` e o motivo, gravada na
// MESMA transação em que a imagem é apagada (`removeAvatar`, do Dados): se uma falha, a outra não acontece.
// 404 se o usuário não existe ou não tem avatar; 403 ao usuário comum e ao administrador sobre o PRÓPRIO avatar
// (esse se remove em /api/users/me/avatar, sem motivo nem aviso a si mesmo). Revalida o espaço do dono e o
// portal, onde o avatar aparece no diretório (ADR-030).
import { findUserById } from "@/lib/auth";
import { removeAvatar } from "@/lib/db";
import { avatarRemovalQuerySchema } from "@/lib/validators";
import { ApiError, noContent, parse } from "../../../_lib/http";
import { revalidateWholeSpace } from "../../../_lib/revalidation";
import { route } from "../../../_lib/route";

/** @param {{ params: Record<string, string> }} context */
const target = async ({ params }) => ({ ownerId: params.id });

export const DELETE = route(
  { action: "users:update", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, request }) => {
    const { reason } = parse(avatarRemovalQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    if (params.id === actor.id) {
      throw new ApiError(403, "FORBIDDEN", "Para remover o seu avatar, use a sua página de perfil.");
    }
    if (!(await findUserById(params.id))) {
      throw new ApiError(404, "NOT_FOUND", "Usuário não encontrado.", [{ field: "id", value: params.id }]);
    }
    await removeAvatar(params.id, { notification: { data: { reason } } });
    await revalidateWholeSpace({ ownerId: params.id, directory: true });
    return noContent();
  },
);
