"use client";

// Pré-visualização do editor (M09; RF08, CT19): usa o MESMO MarkdownRenderer da página pública,
// de modo que o autor vê o que o leitor verá. O componente é carregado sob demanda (A-010, nota
// 14): ele traz o processador de Markdown, o KaTeX e o realce de código, cerca de 172 kB
// comprimidos, e só esta página precisa deles; o resto do editor fica interativo antes.
import dynamic from "next/dynamic";

const MarkdownRenderer = dynamic(
  () => import("@/components/markdown/MarkdownRenderer").then((module) => module.MarkdownRenderer),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted">Carregando a pré-visualização…</p>,
  },
);

/**
 * @param {object} props
 * @param {string} props.markdown texto a mostrar; o editor passa o valor adiado (`useDeferredValue`)
 * @param {boolean} [props.pending] verdadeiro enquanto a pré-visualização ainda não acompanha o texto
 * @param {string} [props.className] classes de leiaute (altura e rolagem)
 */
export function Preview({ markdown, pending = false, className = "" }) {
  return (
    <div
      // Região rolável: recebe foco pelo teclado para que quem não usa o mouse a role.
      role="region"
      aria-label="Pré-visualização do documento"
      tabIndex={0}
      aria-busy={pending}
      className={`overflow-auto rounded-md border border-border bg-background p-4 ${className}`.trim()}
    >
      {markdown.trim() === "" ? (
        <p className="mb-2 text-sm text-muted">A pré-visualização do texto aparece aqui.</p>
      ) : null}
      {/* Montado mesmo sem texto: o carregamento do componente já começa. */}
      <MarkdownRenderer markdown={markdown} />
    </div>
  );
}
