// PUT /api/users/:id/password (Cap. 5 §5.10, RN21, ADR-029): o administrador redefine a senha de
// uma conta. A nova senha é provisória (gerada, ou a informada de 8 a 128 caracteres), exibida uma
// única vez e nunca registrada; revoga TODAS as sessões da conta (o `set-user-password` do pacote
// não as revoga) e liga a troca obrigatória. O usuário é notificado (RN26).
import { auth, findUserById } from "@/lib/auth";
import { notify, setMustChangePassword } from "@/lib/db";
import { passwordResetSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../../_lib/http";
import { route } from "../../../_lib/route";
import { authCall, generateTemporaryPassword } from "../../../_lib/users";

export const PUT = route(
  {
    action: "users:reset-password",
    mutation: true,
    rate: "password",
    load: async ({ params }) => ({ ownerId: params.id }),
    allowForeign: true,
  },
  async ({ params, request, readJson }) => {
    const { password: informed } = parse(passwordResetSchema, await readJson());
    if (!(await findUserById(params.id))) {
      throw new ApiError(404, "NOT_FOUND", "Usuário não encontrado.", [{ field: "id", value: params.id }]);
    }

    const generated = informed === undefined;
    const password = informed ?? generateTemporaryPassword();

    // O marcador vem ANTES da senha: se a gravação da senha falhar, a conta fica obrigada a trocá-la,
    // e nunca com uma senha do administrador sem a troca obrigatória.
    await setMustChangePassword(params.id, true);
    await authCall(() =>
      auth.api.setUserPassword({ headers: request.headers, body: { userId: params.id, newPassword: password } }),
    );
    await authCall(() => auth.api.revokeUserSessions({ headers: request.headers, body: { userId: params.id } }));
    await notify({ userId: params.id, type: "ACCOUNT", severity: "WARNING", data: { event: "PASSWORD_RESET" } });

    return ok({ id: params.id, temporaryPassword: generated ? password : null });
  },
);
