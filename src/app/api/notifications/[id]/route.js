// /api/notifications/:id (Cap. 5 §5.10, RF33, RN26): marca como lida ou dispensa uma notificação do
// PRÓPRIO usuário. A de outro usuário responde 404, como se não existisse: a rota não revela quais
// identificadores existem (a autorização do recurso é pelo dono da sessão, e a busca só enxerga as
// do dono).
import { countUnread, dismiss, getNotification, markRead } from "@/lib/db";
import { notificationUpdateSchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../../_lib/http";
import { route } from "../../_lib/route";

/** O recurso é uma notificação do próprio ator; a existência é conferida abaixo. @param {{ actor: { id: string } }} context */
const own = async ({ actor }) => ({ ownerId: actor.id });

/**
 * PATCH: `{ "read": true }` marca como lida (idempotente: uma já lida continua lida) e
 * `{ "dismissed": true }` a dispensa (exclui). Responde `{ data: { id, read | dismissed: true },
 * unreadCount }`.
 */
export const PATCH = route(
  { action: "notifications:update", mutation: true, rate: "notifications", load: own },
  async ({ actor, params, readJson }) => {
    const action = parse(notificationUpdateSchema, await readJson());
    if (!(await getNotification(actor.id, params.id))) {
      throw new ApiError(404, "NOT_FOUND", "Notificação não encontrada.", [{ field: "id", value: params.id }]);
    }

    if (action.dismissed) await dismiss(actor.id, params.id);
    else await markRead(actor.id, [params.id]);

    return ok(
      { id: params.id, ...(action.dismissed ? { dismissed: true } : { read: true }) },
      { extra: { unreadCount: await countUnread(actor.id) } },
    );
  },
);
