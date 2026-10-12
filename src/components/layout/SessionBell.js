"use client";

// O sino das páginas públicas para quem está logado (P-027). Este módulo só é BAIXADO depois de a
// sessão ser confirmada (`SessionActions` o carrega sob demanda, por `lazy`): o visitante anônimo
// nunca baixa o sino, o popout nem o cliente das notificações. Busca o contador
// (`GET /api/notifications?limit=1`) e só então monta o `NotificationBell`, que passa a mantê-lo
// (consulta periódica, evento da lista, volta da aba). Falha de rede, 429, 401 ou 403 na consulta
// inicial: nenhum sino e nenhum erro na tela (ele aparece na próxima visita); o marcador não é apagado.
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { fetchUnreadCount } from "@/components/admin/notification-client";

export default function SessionBell() {
  const [count, setCount] = useState(/** @type {number | null} */ (null));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchUnreadCount();
      if (cancelled) return;
      if (result.ok && result.unreadCount !== null) setCount(result.unreadCount);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null) return null;
  return <NotificationBell initialUnreadCount={count} />;
}
