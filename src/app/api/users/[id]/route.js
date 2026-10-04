// /api/users/:id (Cap. 5 §5.10, ADR-029): detalhe, edição e exclusão de uma conta. Só o
// administrador (RF27, RN19), com as proteções da RN22 e da RN24. O usuário comum lê o próprio
// registro (a matriz o permite) e recebe 403 no de outro.
//
// O recurso é carregado SEM consultar o banco (o dono é o próprio identificador): assim, quem não é
// administrador recebe 403 tanto para um usuário que existe quanto para um que não existe, e a rota
// não revela quais identificadores existem. O 404 vem depois da autorização.
import { findUserById } from "@/lib/auth";
import { deleteUser, updateUserProfile } from "@/lib/db";
import { userDeleteQuerySchema, userUpdateSchema } from "@/lib/validators";
import { ApiError, noContent, ok, parse } from "../../_lib/http";
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
 * espaço, sem redirecionamento (RN20, ADR-024).
 */
export const PATCH = route(
  { action: "users:update", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ params, readJson }) => {
    const patch = parse(userUpdateSchema, await readJson());
    await requireUser(params.id);
    const updated = await updateUserProfile(params.id, patch);
    return ok(publicUser(/** @type {any} */ (updated)));
  },
);

/**
 * DELETE: exclui a conta (RN24). Com conteúdo, é preciso escolher `?content=transfer&to=<id>` (com
 * `&onConflict=rename` para renomear a raiz de slug repetido; o padrão recusa tudo) ou
 * `?content=delete`; sem a escolha, 409 `USER_HAS_CONTENT`. A operação é atômica. Ninguém exclui a
 * si mesmo, e o último administrador ativo não é excluído (409 `LAST_ADMIN`). Responde 204.
 */
export const DELETE = route(
  { action: "users:remove", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, request }) => {
    const options = parse(userDeleteQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    await requireUser(params.id);
    if (params.id === actor.id) {
      throw new ApiError(409, "LAST_ADMIN", "Você não pode excluir a própria conta.", [{ userId: actor.id }]);
    }
    if (options.content === "transfer") {
      if (options.to === params.id) {
        throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
          { field: "to", message: "O destino não pode ser o usuário excluído." },
        ]);
      }
      await requireUser(/** @type {string} */ (options.to));
    }

    await deleteUser(params.id, options);
    return noContent();
  },
);
