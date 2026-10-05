// /api/notifications (Cap. 5 §5.10, RF33, RN26, ADR-026): a lista de notificações do PRÓPRIO usuário,
// também para o administrador (a matriz não lhe dá as alheias; RN19). O texto sai em português,
// montado a partir de `type` e `data`.
import { countUnread, listNotifications } from "@/lib/db";
import { notificationListQuerySchema } from "@/lib/validators";
import { ok, parse } from "../_lib/http";
import { publicNotification } from "../_lib/notifications";
import { route } from "../_lib/route";

/**
 * GET: as notificações do usuário da sessão, das mais recentes às mais antigas.
 * `?unread=1` traz só as não lidas e não resolvidas; `?limit=` de 1 a 100 (padrão 20); `?cursor=` é o
 * `nextCursor` da página anterior. Ao lado de `data` vêm `unreadCount` (o contador do sino, de todas
 * as não lidas, não só desta página) e `nextCursor` (`null` na última página).
 */
export const GET = route({ action: "notifications:list" }, async ({ actor, request }) => {
  const { unread, limit, cursor } = parse(notificationListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));

  // Uma a mais que o pedido, só para saber se há próxima página.
  const rows = await listNotifications(actor.id, { unreadOnly: unread, take: limit + 1, cursor });
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1].id : null;

  return ok(page.map(publicNotification), { extra: { unreadCount: await countUnread(actor.id), nextCursor } });
});
