// POST /api/users/me/password (Cap. 5 §5.10, RN21, ADR-029): troca a senha do próprio usuário.
// Recusa a senha igual à atual, revoga as OUTRAS sessões e só depois limpa o marcador de senha
// provisória, de modo que uma troca que falha nunca libera a conta.
import { auth } from "@/lib/auth";
import { clearMustChangePassword } from "@/lib/db";
import { passwordChangeSchema } from "@/lib/validators";
import { ok, parse } from "../../../_lib/http";
import { route } from "../../../_lib/route";
import { authCall } from "../../../_lib/users";

export const POST = route(
  {
    action: "profile:change-password",
    mutation: true,
    rate: "password",
    load: async ({ actor }) => ({ ownerId: actor.id }),
  },
  async ({ actor, request, readJson }) => {
    const { current, next } = parse(passwordChangeSchema, await readJson());

    await authCall(() =>
      auth.api.changePassword({
        headers: request.headers,
        body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      }),
    );
    await clearMustChangePassword(actor.id);

    return ok({ changed: true });
  },
);
