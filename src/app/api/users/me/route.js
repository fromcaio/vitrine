// /api/users/me (Cap. 5 §5.10): o perfil do próprio usuário (RF28). Permitido com a senha
// provisória (RN21): é como o painel sabe que a troca é obrigatória.
import { updateUserProfile } from "@/lib/db";
import { revalidatePortal } from "@/lib/revalidate";
import { profileUpdateSchema } from "@/lib/validators";
import { ok, parse } from "../../_lib/http";
import { route } from "../../_lib/route";
import { publicUser } from "../../_lib/users";

/** O recurso é o próprio usuário. @param {{ actor: { id: string } }} context */
const self = async ({ actor }) => ({ ownerId: actor.id });

/** GET: o perfil do usuário da sessão. */
export const GET = route({ action: "users:read", load: self }, async ({ actor }) => ok(publicUser(actor)));

/**
 * PATCH: edita o nome de exibição, que o diretório do portal exibe (revalida o portal; RN28). O papel, o
 * handle e a suspensão só o administrador altera.
 */
export const PATCH = route({ action: "profile:update", mutation: true, rate: "users", load: self }, async ({ actor, readJson }) => {
  const { name } = parse(profileUpdateSchema, await readJson());
  const updated = await updateUserProfile(actor.id, { name });
  if (updated.name !== actor.name) revalidatePortal();
  return ok(publicUser(/** @type {any} */ (updated)));
});
