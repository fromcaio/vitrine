"use client";

// Lista de notificações do painel (RF33, RN26, RNF05, RNF06; M19): título, texto, data e gravidade
// (ícone E texto, nunca só a cor), o filtro "só as não lidas", marcar como lida, dispensar, marcar
// todas e "carregar mais" pelo cursor. Recebe a primeira página por props (o Core a lê) e fala com
// `/api/notifications` por fetch; não lê o banco nem a sessão.
//
// O texto que o servidor manda (inclusive o motivo de uma moderação) é TEXTO PURO: aparece como nó
// de texto do React, sempre escapado. O `unreadCount` de cada resposta é anunciado ao sino por um
// evento do navegador (`notification-events.js`). Um 404 (já dispensada em outra aba) remove o
// item; um 422 do cursor (um item dispensado entre duas páginas) recarrega a lista do início.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AlertIcon, CheckCircleIcon, CriticalIcon, InfoIcon, WarningIcon } from "@/components/ui/icons";
import {
  PAGE_SIZE,
  dismissNotification,
  listNotifications,
  markAllRead,
  markRead,
  normalizeNotification,
} from "./notification-client";
import { announceUnreadCount } from "./notification-events";

/** @typedef {import("./notification-client").PublicNotification} PublicNotification */
/** @typedef {import("./notification-client").Failure} Failure */

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** @param {string} iso */
function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

/** Gravidade: o nome, o ícone e o tom (tokens). @type {Record<string, { label: string, Icon: (props: { className?: string }) => import("react").ReactElement, tone: string }>} */
const SEVERITY = {
  INFO: { label: "Informação", Icon: InfoIcon, tone: "" },
  WARNING: { label: "Aviso", Icon: WarningIcon, tone: "" },
  CRITICAL: { label: "Crítico", Icon: CriticalIcon, tone: "text-danger" },
};

/**
 * Primeira página, como `GET /api/notifications` a devolve.
 * @typedef {object} InitialNotifications
 * @property {unknown[]} items `data` da resposta (cada item é saneado aqui)
 * @property {number} unreadCount `unreadCount` da resposta
 * @property {string | null} [nextCursor] `nextCursor` da resposta
 */

/**
 * @param {object} props
 * @param {InitialNotifications} props.initial a primeira página já lida pelo Core
 * @param {number} [props.pageSize] itens por página (1 a 100); o padrão é 20
 */
export function NotificationList({ initial, pageSize = PAGE_SIZE }) {
  const base = useId();
  const [items, setItems] = useState(() => /** @type {PublicNotification[]} */ (initial.items.map(normalizeNotification).filter(Boolean)));
  const [unreadCount, setUnreadCount] = useState(initial.unreadCount);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor ?? null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  // Para onde vai o foco depois de uma remoção (o item removido leva o foco com ele).
  const focusAfter = useRef(/** @type {string | null} */ (null));

  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const element = document.getElementById(`${base}-${target}`);
    const focusable = element?.matches("button, input") ? element : element?.querySelector("button:not(:disabled)");
    /** @type {HTMLElement | null} */ (focusable ?? document.getElementById(`${base}-filtro`))?.focus();
  }, [items, base]);

  /** Adota o contador de uma resposta e o anuncia ao sino. @param {number | null} count */
  function adoptCount(count) {
    if (count === null) return;
    setUnreadCount(count);
    announceUnreadCount(count);
  }

  /** @param {Failure} failure */
  function fail(failure) {
    setInfo("");
    setError(failure.message);
  }

  /** @param {string} id o item que sai da lista; o foco vai para o seguinte (ou o anterior) */
  function removeItem(id) {
    const index = items.findIndex((item) => item.id === id);
    const neighbour = items[index + 1] ?? items[index - 1];
    focusAfter.current = neighbour ? `item-${neighbour.id}` : "filtro";
    setItems((current) => current.filter((item) => item.id !== id));
  }

  /** Recarrega a lista a partir da primeira página. @param {boolean} unread */
  async function reload(unread) {
    const result = await listNotifications({ unread, limit: pageSize });
    if (!result.ok) return fail(result);
    focusAfter.current = null;
    setItems(result.items);
    setNextCursor(result.nextCursor);
    adoptCount(result.unreadCount);
  }

  /** @param {boolean} unread */
  async function changeFilter(unread) {
    setOnlyUnread(unread);
    setError("");
    setInfo("");
    setPending(true);
    await reload(unread);
    setPending(false);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setError("");
    setInfo("");
    setPending(true);
    const result = await listNotifications({ unread: onlyUnread, cursor: nextCursor, limit: pageSize });
    if (result.ok) {
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(result.nextCursor);
      adoptCount(result.unreadCount);
    } else if (result.kind === "stale-cursor") {
      // Um item foi dispensado entre as duas páginas: recomeça pela primeira.
      await reload(onlyUnread);
      setInfo(result.message);
    } else {
      fail(result);
    }
    setPending(false);
  }

  /** @param {PublicNotification} item */
  async function read(item) {
    setError("");
    setInfo("");
    setPending(true);
    const result = await markRead(item.id);
    if (result.ok) {
      adoptCount(result.unreadCount);
      if (onlyUnread) removeItem(item.id);
      else setItems((current) => current.map((one) => (one.id === item.id ? { ...one, readAt: one.readAt ?? new Date().toISOString() } : one)));
      setInfo("Notificação marcada como lida.");
    } else if (result.kind === "not-found") {
      removeItem(item.id);
      fail(result);
    } else {
      fail(result);
    }
    setPending(false);
  }

  /** @param {PublicNotification} item */
  async function dismiss(item) {
    setError("");
    setInfo("");
    setPending(true);
    const result = await dismissNotification(item.id);
    if (result.ok) {
      adoptCount(result.unreadCount);
      removeItem(item.id);
      setInfo("Notificação dispensada.");
    } else if (result.kind === "not-found") {
      removeItem(item.id);
      fail(result);
    } else {
      fail(result);
    }
    setPending(false);
  }

  async function readAll() {
    setError("");
    setInfo("");
    setPending(true);
    const result = await markAllRead();
    if (result.ok) {
      adoptCount(result.unreadCount);
      if (onlyUnread) {
        focusAfter.current = "filtro";
        setItems([]);
        setNextCursor(null);
      } else {
        const now = new Date().toISOString();
        setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      }
      setInfo(result.count === 0 ? "Nenhuma notificação estava não lida." : `${result.count} ${result.count === 1 ? "notificação marcada" : "notificações marcadas"} como lida${result.count === 1 ? "" : "s"}.`);
    } else {
      fail(result);
    }
    setPending(false);
  }

  return (
    <section aria-label="Notificações" aria-busy={pending} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <input
            id={`${base}-filtro`}
            type="checkbox"
            checked={onlyUnread}
            disabled={pending}
            onChange={(event) => changeFilter(event.target.checked)}
            className="size-5 cursor-pointer"
          />
          <label htmlFor={`${base}-filtro`} className="text-sm font-medium">
            Mostrar só as não lidas
          </label>
        </div>
        <p className="text-sm text-muted">{unreadCount === 0 ? "Nenhuma não lida." : `${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}.`}</p>
        <Button variant="outline" onClick={readAll} disabled={pending || unreadCount === 0} className="sm:ml-auto">
          Marcar todas como lidas
        </Button>
      </div>

      <div role="alert" className="empty:hidden">
        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}
              {error.startsWith("Sua sessão expirou") ? (
                <>
                  {" "}
                  <Link href="/login" className="font-medium underline underline-offset-2">
                    Ir para o login
                  </Link>
                  .
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>
      <div role="status" className="empty:hidden">
        {info ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            {info}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
          {onlyUnread ? "Nenhuma notificação não lida." : "Nenhuma notificação."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const severity = SEVERITY[item.severity] ?? SEVERITY.INFO;
            const unread = item.readAt === null;
            return (
              <li
                key={item.id}
                id={`${base}-item-${item.id}`}
                data-severity={item.severity}
                className={`flex flex-col gap-2 rounded-md border p-4 ${unread ? "border-foreground bg-surface" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${severity.tone}`.trim()}>
                    <severity.Icon className="size-4 shrink-0" />
                    {severity.label}
                  </span>
                  {unread ? <span className="rounded-full border border-foreground px-2 py-0.5 text-xs font-semibold">Não lida</span> : null}
                  {item.resolvedAt ? <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs">Resolvida</span> : null}
                  <time dateTime={item.createdAt} className="text-muted sm:ml-auto">
                    {formatDate(item.createdAt)}
                  </time>
                </div>
                {/* h2: a página tem o h1 e a lista de notificações vem logo abaixo, sem h2 no meio (o axe, `heading-order`). */}
                <h2 className="font-semibold break-words">{item.title}</h2>
                <p className="break-words whitespace-pre-line">{item.text}</p>
                <div className="flex flex-wrap gap-2">
                  {unread ? (
                    <Button variant="outline" onClick={() => read(item)} disabled={pending} aria-label={`Marcar como lida: ${item.title}`}>
                      Marcar como lida
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => dismiss(item)} disabled={pending} aria-label={`Dispensar: ${item.title}`}>
                    Dispensar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <div>
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
