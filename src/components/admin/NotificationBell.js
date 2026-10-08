"use client";

// Sino de notificações do cabeçalho do painel (RF33, RNF05; M19, A-027): o contador de não lidas, o
// POPOUT com as notificações recentes e a atualização leve. O sino é um botão de divulgação
// (*disclosure*: `aria-expanded` e `aria-controls`, SEM `aria-modal`): abre um painel NÃO modal, ancorado
// ao botão, com até 8 notificações (`GET /api/notifications?limit=8`), ler e dispensar em cada uma,
// "Marcar todas como lidas" e o link "Ver todas" para a página. Esc fecha e devolve o foco ao sino;
// o clique fora e a saída do foco para fora do painel fecham; Tab não fica preso. Abaixo de 640 px o
// painel ocupa a largura da tela. O painel é absoluto: abrir ou fechar não desloca nada. A lista é a
// `NotificationList` em modo compacto (a mesma da página). Recebe o valor inicial por props (o Core o
// lê no servidor) e o mantém por três vias:
//   1. o evento do navegador que a lista emite a cada resposta da API (`notification-events.js`);
//   2. a volta da janela ao primeiro plano (foco ou aba visível), no máximo uma consulta a cada 10 s;
//   3. uma consulta periódica (`GET /api/notifications?limit=1`), só com a aba visível: o limite de
//      leituras da API é de 60 por minuto, e uma por minuto fica muito abaixo.
// A consulta PARA com a sessão encerrada (401 e 403) e pula uma rodada depois de um 429. O rótulo
// acessível inclui o contador; uma região `aria-live="polite"` anuncia o AUMENTO. Só tokens de tema.
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AlertIcon, BellIcon } from "@/components/ui/icons";
import { NotificationList } from "./NotificationList";
import { fetchUnreadCount, listNotifications } from "./notification-client";
import { announceUnreadCount, onUnreadCount } from "./notification-events";

/** Tempo entre as consultas periódicas, em ms. */
export const POLL_INTERVAL_MS = 60_000;
/** Intervalo mínimo entre duas consultas por volta da janela ao primeiro plano, em ms. */
const MIN_GAP_MS = 10_000;
/** Quantas notificações recentes o popout mostra. */
export const POPOUT_SIZE = 8;

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
 * @param {string} [props.href] a página da lista (o destino de "Ver todas")
 * @param {number} [props.intervalMs] tempo entre as consultas periódicas; o padrão é 60 s
 */
export function NotificationBell({ initialUnreadCount, href = "/admin/notificacoes", intervalMs = POLL_INTERVAL_MS }) {
  const [count, setCount] = useState(initialUnreadCount);
  // `seq` troca o nó de texto: o mesmo aviso, repetido, volta a ser anunciado.
  const [announcement, setAnnouncement] = useState({ text: "", seq: 0 });
  const latest = useRef(initialUnreadCount);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(/** @type {any} */ ({ status: "loading" }));
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  // Cada abertura é uma rodada: a resposta de uma rodada já encerrada (fechou ou reabriu) é descartada.
  const round = useRef(0);

  /** Busca as notificações recentes e as entrega ao painel. */
  const load = useCallback(async () => {
    const mine = ++round.current;
    setPanel({ status: "loading" });
    const result = await listNotifications({ limit: POPOUT_SIZE });
    if (mine !== round.current) return;
    if (!result.ok) {
      setPanel({ status: "error", message: result.message });
      return;
    }
    if (result.unreadCount !== null) announceUnreadCount(result.unreadCount);
    setPanel({
      status: "ready",
      stamp: mine,
      initial: { items: result.items, unreadCount: result.unreadCount ?? latest.current, nextCursor: null },
    });
  }, []);

  /** @param {boolean} focusButton devolve o foco ao sino (Esc) */
  const close = useCallback((focusButton) => {
    round.current += 1;
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  function toggle() {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    void load();
  }

  // Clique fora fecha; Esc fecha e devolve o foco ao sino.
  useEffect(() => {
    if (!open) return undefined;
    /** @param {PointerEvent} event */
    const outside = (event) => {
      if (rootRef.current && !rootRef.current.contains(/** @type {Node} */ (event.target))) close(false);
    };
    /** @param {KeyboardEvent} event */
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

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
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Tab para fora do painel o fecha; um clique em área sem foco (relatedTarget nulo) não.
        const next = event.relatedTarget;
        if (open && next instanceof Node && rootRef.current && !rootRef.current.contains(next)) close(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={bellLabel(count)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="relative inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-on-secondary hover:bg-on-secondary hover:text-secondary"
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
      </button>
      {/* O painel: sempre no DOM (o `aria-controls` aponta para ele), oculto quando fechado. Absoluto, não
          desloca a barra; abaixo de 640 px ocupa a largura da tela. */}
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-20 mt-2 max-h-[70vh] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border-strong bg-background p-3 text-foreground shadow-lg max-sm:fixed max-sm:inset-x-0 max-sm:top-auto max-sm:w-auto max-sm:max-w-none max-sm:rounded-none"
      >
        {open ? (
          <div className="flex flex-col gap-3">
            {panel.status === "loading" ? (
              <p role="status" className="px-1 py-2 text-sm text-muted">
                Carregando as notificações…
              </p>
            ) : null}
            {panel.status === "error" ? (
              <div role="alert" className="flex flex-col gap-2">
                <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
                  <AlertIcon className="mt-0.5 size-4 shrink-0" />
                  {panel.message}
                </p>
                <div>
                  <Button variant="outline" onClick={() => void load()}>
                    Tentar de novo
                  </Button>
                </div>
              </div>
            ) : null}
            {panel.status === "ready" ? (
              <NotificationList key={panel.stamp} initial={panel.initial} pageSize={POPOUT_SIZE} compact />
            ) : null}
            <Link
              href={href}
              onClick={() => close(false)}
              className="self-start rounded-sm text-sm font-medium underline underline-offset-4"
            >
              Ver todas
            </Link>
          </div>
        ) : null}
      </div>
      {/* Anúncio do aumento: texto só para o leitor de tela, sempre presente. */}
      <span role="status" aria-live="polite" className="sr-only">
        <span key={announcement.seq}>{announcement.text}</span>
      </span>
    </div>
  );
}
