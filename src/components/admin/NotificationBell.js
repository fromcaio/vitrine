"use client";

// Sino de notificações do cabeçalho do painel (RF33, RNF05; M19): o contador de não lidas, o link
// para a lista e a atualização leve. Recebe o valor inicial por props (o Core o lê no servidor) e o
// mantém por três vias:
//   1. o evento do navegador que a lista emite a cada resposta da API (`notification-events.js`);
//   2. a volta da janela ao primeiro plano (foco ou aba visível), no máximo uma consulta a cada 10 s;
//   3. uma consulta periódica (`GET /api/notifications?limit=1`), só com a aba visível: o limite de
//      leituras da API é de 60 por minuto, e uma por minuto fica muito abaixo.
// A consulta PARA com a sessão encerrada (401 e 403) e pula uma rodada depois de um 429. O rótulo
// acessível inclui o contador; uma região `aria-live="polite"` anuncia o AUMENTO. Só tokens de tema.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { fetchUnreadCount } from "./notification-client";
import { onUnreadCount } from "./notification-events";

/** Tempo entre as consultas periódicas, em ms. */
export const POLL_INTERVAL_MS = 60_000;
/** Intervalo mínimo entre duas consultas por volta da janela ao primeiro plano, em ms. */
const MIN_GAP_MS = 10_000;

/**
 * Rótulo acessível do link, com o contador.
 * @param {number} count
 */
export function bellLabel(count) {
  if (count === 0) return "Notificações, nenhuma não lida";
  return `Notificações, ${count} ${count === 1 ? "não lida" : "não lidas"}`;
}

/**
 * Texto anunciado quando o contador aumenta.
 * @param {number} count
 */
export function bellAnnouncement(count) {
  return count === 1 ? "Você tem 1 notificação não lida." : `Você tem ${count} notificações não lidas.`;
}

/**
 * @param {object} props
 * @param {number} props.initialUnreadCount contador de não lidas no momento em que a página foi montada
 * @param {string} [props.href] a página da lista
 * @param {number} [props.intervalMs] tempo entre as consultas periódicas; o padrão é 60 s
 */
export function NotificationBell({ initialUnreadCount, href = "/admin/notificacoes", intervalMs = POLL_INTERVAL_MS }) {
  const [count, setCount] = useState(initialUnreadCount);
  // `seq` troca o nó de texto: o mesmo aviso, repetido, volta a ser anunciado.
  const [announcement, setAnnouncement] = useState({ text: "", seq: 0 });
  const latest = useRef(initialUnreadCount);

  useEffect(() => {
    let stopped = false;
    let lastRun = 0;
    let skipNext = false;

    /** Adota um contador novo e anuncia só o aumento. @param {number} next */
    const adopt = (next) => {
      if (stopped || next === latest.current) return;
      const increased = next > latest.current;
      latest.current = next;
      setCount(next);
      if (increased) setAnnouncement((current) => ({ text: bellAnnouncement(next), seq: current.seq + 1 }));
    };

    const poll = async () => {
      if (stopped) return;
      lastRun = Date.now();
      const result = await fetchUnreadCount();
      if (stopped) return;
      if (result.ok) {
        if (result.unreadCount !== null) adopt(result.unreadCount);
      } else if (result.kind === "unauthenticated" || result.kind === "forbidden") {
        stopped = true; // a sessão acabou (ou a conta exige a troca de senha): não adianta insistir
      } else if (result.kind === "rate-limited") {
        skipNext = true;
      }
    };

    /** Consulta ao voltar ao primeiro plano, sem repetir a que acabou de acontecer. */
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRun < MIN_GAP_MS) return;
      void poll();
    };
    const tick = () => {
      if (document.visibilityState !== "visible") return; // aba oculta: nenhuma consulta
      if (skipNext) {
        skipNext = false;
        return;
      }
      void poll();
    };

    const timer = setInterval(tick, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const unsubscribe = onUnreadCount(adopt);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      unsubscribe();
    };
  }, [intervalMs]);

  return (
    <div className="relative">
      <Link
        href={href}
        aria-label={bellLabel(count)}
        className="relative inline-flex size-10 items-center justify-center rounded-md border border-on-secondary hover:bg-on-secondary hover:text-secondary"
      >
        <BellIcon />
        {count > 0 ? (
          <span
            aria-hidden="true"
            data-testid="contador-nao-lidas"
            className="absolute -top-1.5 -right-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-secondary bg-background px-1 text-xs font-bold text-foreground"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>
      {/* Anúncio do aumento: texto só para o leitor de tela, sempre presente. */}
      <span role="status" aria-live="polite" className="sr-only">
        <span key={announcement.seq}>{announcement.text}</span>
      </span>
    </div>
  );
}
