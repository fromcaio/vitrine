// Renderização do conteúdo em Markdown (M08; RF09 a RF11; Cap. 5 §5.8). É o mesmo componente
// na página pública e na pré-visualização do editor: o autor vê o que o leitor verá.
//
// O Markdown vem de autores não confiáveis (ADR-023), por isso:
//  - não há HTML bruto (RN11): sem rehype-raw, o HTML escrito no texto aparece como texto;
//  - vale a transformação padrão de URLs do react-markdown, que descarta javascript:, data: etc.;
//  - o KaTeX roda com `trust` desligado e com limites de tamanho e de expansão de macros (a
//    configuração do pipeline mora em markdown-pipeline.js).
//
// O componente não tem estado nem efeitos e não é marcado com "use client": importado por um
// Server Component, não envia JavaScript ao navegador; importado pelo editor, roda no cliente.
// Recebe só o Markdown: não conhece o dono do conteúdo nem o tema. As cores vêm dos tokens de
// globals.css, e a variante noturna, da classe .dark no <html> (ADR-025).
//
// Os plugins, as opções do KaTeX e as linguagens do realce vêm de markdown-pipeline.js, SEM React e
// SEM CSS: é a fonte única, que o Core também carrega em um `worker_threads` para validar, na
// gravação, que o texto renderiza dentro do orçamento de tempo (ADR-033).
import Markdown from "react-markdown";
import {
  HIGHLIGHT_LANGUAGES,
  KATEX_OPTIONS,
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  REMARK_REHYPE_OPTIONS,
} from "./markdown-pipeline";
// Folha e fontes do KaTeX: importadas uma única vez, aqui, pelo bundle (nunca por CDN: a CSP só
// aceita folhas e fontes do próprio site; ADR-022).
import "katex/dist/katex.min.css";
import "./markdown.css";

// Os testes e outros módulos importam estes dois do renderizador; a fonte é markdown-pipeline.js.
export { HIGHLIGHT_LANGUAGES, KATEX_OPTIONS };


/**
 * Link do conteúdo. Uma URL recusada pela transformação de URLs (javascript:, data: etc.) chega
 * vazia: nesse caso fica só o texto, sem um link que apontaria para a própria página.
 * @param {import("react").ComponentProps<"a"> & { node?: unknown }} props
 */
function MarkdownLink({ node: _node, href, children, ...props }) {
  if (!href) return children;
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

/**
 * Imagem do conteúdo. Uma URL recusada pela transformação de URLs chega vazia: nesse caso fica
 * só o texto alternativo. As demais carregam sob demanda e sem enviar o endereço da página ao
 * servidor da imagem.
 * @param {import("react").ComponentProps<"img"> & { node?: unknown }} props
 */
function MarkdownImage({ node: _node, src, alt = "", ...props }) {
  if (!src) return alt;
  // eslint-disable-next-line @next/next/no-img-element -- URL externa escolhida pelo autor (D-10)
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

/**
 * Tabela dentro de uma região com rolagem horizontal, alcançável pelo teclado (RNF05, RNF06).
 * @param {import("react").ComponentProps<"table"> & { node?: unknown }} props
 */
function MarkdownTable({ node: _node, ...props }) {
  return (
    <div className="vitrine-markdown-table" role="region" aria-label="Tabela" tabIndex={0}>
      <table {...props} />
    </div>
  );
}

/**
 * Bloco de código: rola na horizontal, por isso recebe foco pelo teclado.
 * @param {import("react").ComponentProps<"pre"> & { node?: unknown }} props
 */
function MarkdownPre({ node: _node, ...props }) {
  return <pre {...props} tabIndex={0} />;
}

/**
 * Caixa das listas de tarefas (GFM): só leitura, com o estado dito por extenso.
 * @param {import("react").ComponentProps<"input"> & { node?: unknown }} props
 */
function MarkdownInput({ node: _node, ...props }) {
  if (props.type !== "checkbox") return <input {...props} />;
  return <input {...props} aria-label={props.checked ? "Tarefa concluída" : "Tarefa pendente"} />;
}

const COMPONENTS = {
  a: MarkdownLink,
  img: MarkdownImage,
  input: MarkdownInput,
  pre: MarkdownPre,
  table: MarkdownTable,
};

/**
 * @param {object} props
 * @param {string | null | undefined} props.markdown texto em Markdown (GFM), com fórmulas em
 *   `$...$` e `$$...$$`; qualquer outro valor rende um bloco vazio
 * @param {string} [props.className] classes de leiaute de quem usa o componente
 */
export function MarkdownRenderer({ markdown, className }) {
  return (
    <div className={className ? `vitrine-markdown ${className}` : "vitrine-markdown"}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        remarkRehypeOptions={REMARK_REHYPE_OPTIONS}
        components={COMPONENTS}
      >
        {typeof markdown === "string" ? markdown : ""}
      </Markdown>
    </div>
  );
}
