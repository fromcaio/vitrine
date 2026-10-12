// Invólucro de leitura do documento (RF11, RF12, RF14; M17): título, texto em Markdown pelo
// MarkdownRenderer e, quando a árvore os dá, os links para o documento anterior e o seguinte.
// Server Component de apresentação: sem dado do banco nem conhecimento do dono; o Core entrega o
// documento já resolvido e os vizinhos (`neighboursOf`). O `<main>` é do SpaceLayout.
import Link from "next/link";
// A folha do KaTeX desde o primeiro desenho: um documento com fórmula não pode aparecer sem estilo (o `MarkdownRenderer`
// não a importa, para a página inicial sem fórmula não pagar por ela; P-032).
import "katex/dist/katex.min.css";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";

/** @typedef {{ title: string, href: string }} DocumentLink */

const PAGER_LINK =
  "flex min-w-0 items-center gap-2 rounded-md border border-border-strong px-4 py-3 text-sm font-medium hover:bg-surface";

/**
 * @param {object} props
 * @param {string} props.title título do documento (o `h1` da página)
 * @param {string | null} [props.body] texto em Markdown; documento sem corpo mostra um bloco vazio
 * @param {DocumentLink | null} [props.previous] documento anterior na ordem da árvore
 * @param {DocumentLink | null} [props.next] documento seguinte
 */
export function DocumentView({ title, body = null, previous = null, next = null }) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold break-words">{title}</h1>
      <MarkdownRenderer markdown={body} />
      {previous || next ? (
        <nav aria-label="Navegação entre documentos" className="grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {previous ? (
            <Link href={previous.href} rel="prev" className={PAGER_LINK}>
              <ArrowLeftIcon />
              <span className="min-w-0">
                <span className="block text-xs font-normal text-muted">Anterior</span>
                <span className="block break-words">{previous.title}</span>
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={next.href} rel="next" className={`${PAGER_LINK} justify-end text-right sm:col-start-2`}>
              <span className="min-w-0">
                <span className="block text-xs font-normal text-muted">Seguinte</span>
                <span className="block break-words">{next.title}</span>
              </span>
              <ArrowRightIcon />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}
