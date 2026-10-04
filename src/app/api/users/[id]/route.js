// /api/users/:id (Cap. 5 §5.10, ADR-029): detalhe, edição e exclusão de uma conta. Só o
// administrador (RF27, RN19), com as proteções da RN22 e da RN24. O usuário comum lê o próprio
// registro (a matriz o permite) e recebe 403 no de outro.
//
// O recurso é carregado SEM consultar o banco (o dono é o próprio identificador): assim, quem não é
// administrador recebe 403 tanto para um usuário que existe quanto para um que não existe, e a rota
// não revela quais identificadores existem. O 404 vem depois da autorização.
import { findUserById } from "@/lib/auth";
import { deleteUser, updateUserProfile } from "@/lib/db";
import { revalidatePortal, revalidateSnapshots } from "@/lib/revalidate";
import { userDeleteQuerySchema, userUpdateSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../_lib/http";
import { captureSpace, revalidateWholeSpace } from "../../_lib/revalidation";
import { route } from "../../_lib/route";
import { publicUser } from "../../_lib/users";

/** @param {{ params: Record<string, string> }} context */
const target = async ({ params }) => ({ ownerId: params.id });

/** @param {string} id */
async function requireUser(id) {
  const user = await findUserById(id);
  if (!user) throw new ApiError(404, "NOT_FOUND", "Usuário não encontrado.", [{ field: "id", value: id }]);
  return user;
}

/** GET: detalhe da conta. */
export const GET = route({ action: "users:read", load: target, allowForeign: true }, async ({ params }) =>
  ok(publicUser(await requireUser(params.id))),
);

/**
 * PATCH: edita nome, handle e papel (RF27). O último administrador ativo não é rebaixado (409
 * `LAST_ADMIN`, na transação); handle repetido: 409 `USER_CONFLICT`. Mudar o handle quebra as URLs do
 * espaço, sem redirecionamento (RN20, ADR-024): o espaço inteiro é revalidado, com o handle antigo e o
 * novo, e o portal (RN10, ADR-030). Mudar só o nome revalida o portal, que o exibe no diretório.
 */
export const PATCH = route(
  { action: "users:update", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ params, readJson }) => {
    const patch = parse(userUpdateSchema, await readJson());
    const current = await requireUser(params.id);
    const before = patch.handle !== undefined ? await captureSpace(params.id) : null;
    const updated = await updateUserProfile(params.id, patch);

    if (before && (current.handle ?? null) !== (updated.handle ?? null)) {
      await revalidateWholeSpace({ ownerId: params.id, before: [before], directory: true });
    } else if (patch.name !== undefined && updated.name !== current.name) {
      revalidatePortal();
    }
    return ok(publicUser(/** @type {any} */ (updated)));
  },
);

/**
 * DELETE: exclui a conta (RN24). Com conteúdo, é preciso escolher `?content=transfer&to=<id>` (com
 * `&onConflict=rename` para renomear a raiz de slug repetido; o padrão recusa tudo) ou
 * `?content=delete`; sem a escolha, 409 `USER_HAS_CONTENT`. A operação é atômica. Ninguém exclui a
 * si mesmo (403 `FORBIDDEN`), e o último administrador ativo não é excluído (409 `LAST_ADMIN`).
 * Responde 200 com `data: { id, content, roots, renamed }` (exceção à convenção do 204: o administrador
 * vê as raízes renomeadas na transferência; R-009). O espaço do excluído e o do destino da
 * transferência são revalidados, e o portal também (RN10, ADR-030).
 */
export const DELETE = route(
  { action: "users:remove", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, request }) => {
    const options = parse(userDeleteQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    if (params.id === actor.id) {
      throw new ApiError(403, "FORBIDDEN", "Você não pode excluir a própria conta.");
    }
    const target = await requireUser(params.id);
    /** @type {import("@/lib/revalidate").SpaceSnapshot | null} */
    let destinationBefore = null;
    if (options.content === "transfer") {
      if (options.to === params.id) {
        throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
          { field: "to", message: "O destino não pode ser o usuário excluído." },
        ]);
      }
      await requireUser(/** @type {string} */ (options.to));
      destinationBefore = await captureSpace(/** @type {string} */ (options.to));
    }

    // Os caminhos do espaço que vai sair do ar, de antes da exclusão.
    const before = await captureSpace(params.id);
    const result = await deleteUser(params.id, options);

    revalidateSnapshots(before);
    if (target.handle) revalidatePortal();
    if (destinationBefore) {
      await revalidateWholeSpace({ ownerId: /** @type {string} */ (options.to), before: [destinationBefore], directory: true });
    }
    return ok(result);
  },
);
