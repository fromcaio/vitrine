"use client";

// Ações de quem está logado na barra das páginas públicas (P-027; ADR-037): [Administração] [sino].
// As páginas públicas são estáticas (ISR) e não sabem quem lê, então a decisão é do navegador:
//   - sem o cookie-marcador, NADA acontece (nenhuma requisição, nenhum item, nenhum código novo);
//   - com ele, o MESMO `get-session` do `AdminLink` (`usePublicSession`, uma só chamada) confirma a
//     sessão: o link aparece; e, se a conta NÃO tem a senha provisória, o sino é carregado sob demanda
//     (`lazy`: o trecho do sino só é baixado agora, nunca para o anônimo). Com a senha provisória, só o
//     link (que leva a `/admin/senha`), como no painel.
// Os itens são filhos diretos da linha flexível da barra: entram no espaço livre, depois da
// hidratação, à esquerda do botão de modo.
import { Suspense, lazy } from "react";
import { AdminAnchor, usePublicSession } from "./AdminLink";

const SessionBell = lazy(() => import("./SessionBell"));

export function SessionActions() {
  const session = usePublicSession();
  if (!session) return null;
  return (
    <>
      <AdminAnchor temporary={session.temporary} />
      {session.temporary ? null : (
        <Suspense fallback={null}>
          <SessionBell />
        </Suspense>
      )}
    </>
  );
}
