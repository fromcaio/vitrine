"use client";

// Link "Administração" das páginas públicas (portal, espaço, documento; ADR-037, §6.2 do épico): só
// aparece para quem está logado. As páginas públicas são estáticas (ISR) e não sabem quem lê, então
// a decisão é do navegador, depois da hidratação:
//   1. sem o cookie-marcador `vitrine-logado=1`, NADA acontece: nenhuma requisição, nenhum item
//      (o visitante anônimo não paga nada);
//   2. com o marcador, pergunta a `GET /api/auth/get-session` (um `fetch` simples, e não o cliente do
//      better-auth, que pesa no LCP): uma sessão válida mostra o link; `null` ou 401 apaga o marcador
//      (estava velho) e não mostra nada; erro de rede não mostra nada e mantém o marcador.
// O link leva a `/admin`, ou a `/admin/senha` se a conta ainda tem a senha provisória (RN21). Sem
// salto de layout: o item entra à esquerda do botão de modo, no espaço livre da barra.
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearSessionMarker, readSessionMarker } from "./session-marker";

/** Endereço da consulta da sessão. */
export const SESSION_URL = "/api/auth/get-session";

/**
 * A consulta da sessão das páginas públicas (um só `get-session` por montagem). Sem o marcador, não
 * faz nada. Devolve `null` até a sessão ser confirmada (e para sempre se não houver sessão ou a rede
 * falhar); depois, `{ temporary }`: a conta ainda tem a senha provisória (RN21).
 * @returns {{ temporary: boolean } | null}
 */
export function usePublicSession() {
  /** @type {[{ temporary: boolean } | null, (value: { temporary: boolean } | null) => void]} */
  const [session, setSession] = useState(/** @type {{ temporary: boolean } | null} */ (null));

  useEffect(() => {
    if (!readSessionMarker()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(SESSION_URL, { credentials: "same-origin", cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          clearSessionMarker();
          return;
        }
        if (!response.ok) return;
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (body && typeof body === "object" && body.user && typeof body.user === "object") {
          setSession({ temporary: body.user.mustChangePassword === true });
        } else if (body === null) {
          clearSessionMarker();
        }
      } catch {
        // Sem rede: não mostra o link e mantém o marcador para a próxima visita.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}

/**
 * O link em si (apresentação), para quem já sabe que há sessão.
 * @param {object} props
 * @param {boolean} props.temporary a conta tem a senha provisória: o link leva a `/admin/senha`
 * @param {string} [props.className] classes do link
 */
export function AdminAnchor({ temporary, className = "" }) {
  return (
    <Link
      href={temporary ? "/admin/senha" : "/admin"}
      prefetch={false}
      className={`inline-flex min-h-10 items-center rounded-md border border-on-secondary px-2 text-sm font-medium sm:px-3 hover:bg-on-secondary hover:text-secondary ${className}`.trim()}
    >
      Administração
    </Link>
  );
}

/**
 * @param {object} props
 * @param {string} [props.className] classes do link
 */
export function AdminLink({ className = "" }) {
  const session = usePublicSession();
  if (!session) return null;
  return <AdminAnchor temporary={session.temporary} className={className} />;
}
