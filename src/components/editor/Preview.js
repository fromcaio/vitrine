"use client";

// Pré-visualização do editor (M09; RF08, CT19): usa o MESMO MarkdownRenderer da página pública,
// de modo que o autor vê o que o leitor verá. O componente é carregado sob demanda (A-010, nota
// 14): ele traz o processador de Markdown, o KaTeX e o realce de código, cerca de 172 kB
// comprimidos, e só esta página precisa deles; o resto do editor fica interativo antes.
//
// ORÇAMENTO (A-023; ADR-033): um texto hostil congelaria a aba do próprio autor, então a pré-visualização
// (1) não renderiza nada enquanto está OCULTA, (2) só renderiza depois de uma PAUSA na digitação e (3) só
// renderiza o texto que um worker, fora da thread principal, processou dentro de um orçamento curto
// (`usePreviewBudget`). O que estoura o orçamento mostra "A pré-visualização não está disponível: o texto é
// complexo demais."; o texto do autor segue intacto no campo, e o servidor continua recusando o envio.
import dynamic from "next/dynamic";
import { TOO_COMPLEX_PREVIEW_MESSAGE, UNAVAILABLE_PREVIEW_MESSAGE } from "./preview-budget";
import { usePreviewBudget } from "./usePreviewBudget";

const MarkdownRenderer = dynamic(
  () => import("@/components/markdown/MarkdownRenderer").then((module) => module.MarkdownRenderer),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted">Carregando a pré-visualização…</p>,
  },
);

/**
 * @param {object} props
 * @param {string} props.markdown o texto digitado; a pausa e o orçamento são daqui
 * @param {boolean} [props.visible] a pré-visualização está à mostra; oculta, nada é checado nem renderizado
 * @param {boolean} [props.pending] força o estado "ainda não acompanha o texto" (além do que o orçamento já sabe)
 * @param {string} [props.className] classes de leiaute (altura e rolagem)
 * @param {() => import("./preview-budget").WorkerLike} [props.createWorker] o worker, injetável (testes)
 * @param {number} [props.delayMs] a pausa antes de checar (testes)
 * @param {number} [props.budgetMs] o orçamento (testes)
 */
export function Preview({ markdown, visible = true, pending = false, className = "", createWorker, delayMs, budgetMs }) {
  const budget = usePreviewBudget({ markdown, visible, createWorker, delayMs, budgetMs });
  const busy = pending || budget.pending;
  const tooComplex = budget.status === "too-complex";
  const unavailable = budget.status === "unavailable";
  const waitingFirst = (budget.status === "waiting" || budget.status === "checking") && budget.approved === "";
  return (
    <div
      // Região rolável: recebe foco pelo teclado para que quem não usa o mouse a role.
      role="region"
      aria-label="Pré-visualização do documento"
      tabIndex={0}
      aria-busy={busy}
      className={`overflow-auto rounded-md border border-border bg-background p-4 ${className}`.trim()}
    >
      {markdown.trim() === "" ? (
        <p className="mb-2 text-sm text-muted">A pré-visualização do texto aparece aqui.</p>
      ) : null}
      {budget.status === "hidden" ? null : tooComplex || unavailable ? (
        <p role="status" className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-medium">
          {tooComplex ? TOO_COMPLEX_PREVIEW_MESSAGE : UNAVAILABLE_PREVIEW_MESSAGE}
        </p>
      ) : waitingFirst ? (
        <p className="text-sm text-muted">Carregando a pré-visualização…</p>
      ) : (
        // Montado mesmo sem texto: o carregamento do componente já começa.
        <MarkdownRenderer markdown={budget.approved} />
      )}
    </div>
  );
}
