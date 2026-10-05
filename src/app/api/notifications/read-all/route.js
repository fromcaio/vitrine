// /api/notifications/read-all (Cap. 5 §5.10, RF33, RN26): marca como lidas todas as notificações do
// PRÓPRIO usuário.
import { countUnread, markRead } from "@/lib/db";
import { ok } from "../../_lib/http";
import { route } from "../../_lib/route";

/** O recurso é o conjunto de notificações do próprio ator. @param {{ actor: { id: string } }} context */
const own = async ({ actor }) => ({ ownerId: actor.id });

/** POST: marca todas como lidas. Responde `{ data: { count }, unreadCount }`. */
export const POST = route(
  { action: "notifications:update", mutation: true, rate: "notifications", load: own },
  async ({ actor }) => {
    const { count } = await markRead(actor.id);
    return ok({ count }, { extra: { unreadCount: await countUnread(actor.id) } });
  },
);
