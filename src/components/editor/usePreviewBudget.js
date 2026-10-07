"use client";

// Gancho do orçamento da pré-visualização (A-023; ADR-033): decide QUANDO e SE o texto do editor é
// renderizado na thread principal. Ver `preview-budget.js` para o porquê.
//   - oculto (`visible` falso): não se checa nem se renderiza nada;
//   - visível: só depois de uma PAUSA na digitação (`delayMs`; a primeira vez é imediata);
//   - o texto passa por um worker com um orçamento curto: se estoura, `status` vira `too-complex` e o
//     texto NÃO é renderizado; se cabe, vira `ready` e `approved` é o texto aprovado.
// O texto digitado nunca é alterado nem guardado aqui: `approved` é só uma cópia do que passou.
// Sem `Worker` (o jsdom dos testes, navegadores muito antigos) não há como medir fora da thread
// principal: o gancho então não interfere e devolve o texto como estava (a pré-visualização de antes).
import { useEffect, useRef, useState } from "react";
import { PREVIEW_BUDGET_MS, PREVIEW_DELAY_MS, createBudgetChecker, workersSupported } from "./preview-budget";

/**
 * @typedef {"hidden" | "waiting" | "checking" | "ready" | "too-complex" | "unavailable"} PreviewStatus
 * @typedef {object} PreviewState
 * @property {string | null} checkedFor o texto cuja checagem terminou
 * @property {"ok" | "too-complex" | "unavailable" | null} outcome o resultado dela
 * @property {string} approved o último texto aprovado
 * @property {boolean} checking há uma checagem em andamento
 */

/**
 * @param {object} options
 * @param {string} options.markdown o texto que o autor digitou
 * @param {boolean} [options.visible] a pré-visualização está à mostra (oculta, nada é checado nem renderizado)
 * @param {number} [options.delayMs] a pausa depois da última digitação
 * @param {number} [options.budgetMs] o orçamento do worker
 * @param {() => import("./preview-budget").WorkerLike} [options.createWorker] o worker, injetável (testes)
 * @returns {{ status: PreviewStatus, approved: string, pending: boolean }}
 */
export function usePreviewBudget({ markdown, visible = true, delayMs = PREVIEW_DELAY_MS, budgetMs = PREVIEW_BUDGET_MS, createWorker }) {
  const gated = createWorker !== undefined || workersSupported();
  const [checker] = useState(() => (gated ? createBudgetChecker({ createWorker, budgetMs }) : null));
  const [state, setState] = useState(/** @type {PreviewState} */ ({ checkedFor: null, outcome: null, approved: "", checking: false }));
  const checkedRef = useRef(/** @type {string | null} */ (null));
  const firstRef = useRef(true);
  const blank = markdown.trim() === "";

  // Ao sair da tela, encerra o worker.
  useEffect(() => () => checker?.dispose(), [checker]);

  useEffect(() => {
    if (!checker || !visible || blank) return undefined;
    if (checkedRef.current === markdown) return undefined;
    let cancelled = false;
    const delay = firstRef.current ? 0 : delayMs;
    firstRef.current = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setState((previous) => ({ ...previous, checking: true }));
      const status = await checker.check(markdown);
      if (cancelled || status === "superseded") return;
      checkedRef.current = markdown;
      setState((previous) => ({
        checkedFor: markdown,
        outcome: status,
        approved: status === "ok" ? markdown : previous.approved,
        checking: false,
      }));
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown, visible, blank, checker, delayMs]);

  if (!visible) return { status: "hidden", approved: "", pending: false };
  if (!checker) return { status: "ready", approved: markdown, pending: false };
  if (blank) return { status: "ready", approved: "", pending: false };
  const fresh = state.checkedFor === markdown;
  if (fresh) return { status: state.outcome === "ok" ? "ready" : (state.outcome ?? "ready"), approved: state.approved, pending: false };
  // O texto mudou e a nova checagem ainda não terminou: continua à mostra o que valia (o texto aprovado
  // ou o aviso), marcado como pendente.
  if (state.outcome === "too-complex" || state.outcome === "unavailable") return { status: state.outcome, approved: state.approved, pending: true };
  return { status: state.checking ? "checking" : "waiting", approved: state.approved, pending: true };
}
