// /api/users/:id/ban (Cap. 5 §5.10, RN22, RN23, ADR-029): suspende e reativa uma conta. A suspensão
// exige o motivo, que o usuário vê ao tentar entrar com a senha correta e na notificação, e aceita
// um prazo (`expiresAt`); vencido o prazo, a conta volta sozinha. Suspender REVOGA as sessões. O
// último administrador ativo não é suspenso, e ninguém suspende a si mesmo. O usuário é notificado
// (RN26). As páginas do espaço passam a responder 404 com o M17 (revalidação por espaço, ADR-030).
import { auth, findUserById } from "@/lib/auth";
import { notify, updateUserProfile } from "@/lib/db";
import { banSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../../_lib/http";
import { route } from "../../../_lib/route";
import { authCall, publicUser } from "../../../_lib/users";

/** @param {{ params: Record<string, string> }} context */
const target = async ({ params }) => ({ ownerId: params.id });

/** @param {string} id */
async function requireUser(id) {
  const user = await findUserById(id);
  if (!user) throw new ApiError(404, "NOT_FOUND", "Usuário não encontrado.", [{ field: "id", value: id }]);
  return user;
}

/** POST: suspende a conta (`reason` obrigatório; `expiresAt` opcional, ISO 8601 no futuro). */
export const POST = route(
  { action: "users:ban", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ actor, params, request, readJson }) => {
    const { reason, expiresAt } = parse(banSchema, await readJson());
    await requireUser(params.id);
    if (params.id === actor.id) {
      throw new ApiError(409, "LAST_ADMIN", "Você não pode suspender a própria conta.", [{ userId: actor.id }]);
    }

    // A regra do último administrador ativo é da transação de db.js (o `ban-user` do pacote não a tem).
    const updated = await updateUserProfile(params.id, {
      banned: true,
      banReason: reason,
      banExpires: expiresAt ?? null,
    });
    await authCall(() => auth.api.revokeUserSessions({ headers: request.headers, body: { userId: params.id } }));
    await notify({
      userId: params.id,
      type: "MODERATION",
      severity: "WARNING",
      data: { event: "ACCOUNT_SUSPENDED", reason, expiresAt: expiresAt ?? null },
    });

    return ok(publicUser(/** @type {any} */ (updated)));
  },
);

/** DELETE: reativa a conta (limpa a suspensão, o motivo e o prazo). */
export const DELETE = route(
  { action: "users:ban", mutation: true, rate: "users", load: target, allowForeign: true },
  async ({ params }) => {
    await requireUser(params.id);
    const updated = await updateUserProfile(params.id, { banned: false, banReason: null, banExpires: null });
    await notify({ userId: params.id, type: "ACCOUNT", severity: "INFO", data: { event: "ACCOUNT_REACTIVATED" } });
    return ok(publicUser(/** @type {any} */ (updated)));
  },
);
