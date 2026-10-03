// Renderização do conteúdo em Markdown (M08; RF09 a RF11; Cap. 5 §5.8). É o mesmo componente
// na página pública e na pré-visualização do editor: o autor vê o que o leitor verá.
//
// O Markdown vem de autores não confiáveis (ADR-023), por isso:
//  - não há HTML bruto (RN11): sem rehype-raw, o HTML escrito no texto aparece como texto;
//  - vale a transformação padrão de URLs do react-markdown, que descarta javascript:, data: etc.;
//  - o KaTeX roda com `trust` desligado (\href, \url, \includegraphics e \html* não geram
//    marcação) e com limites de tamanho e de expansão de macros.
//
// O componente não tem estado nem efeitos e não é marcado com "use client": importado por um
// Server Component, não envia JavaScript ao navegador; importado pelo editor, roda no cliente.
// Recebe só o Markdown: não conhece o dono do conteúdo nem o tema. As cores vêm dos tokens de
// globals.css, e a variante noturna, da classe .dark no <html> (ADR-025).
import fortran from "highlight.js/lib/languages/fortran";
import haskell from "highlight.js/lib/languages/haskell";
import julia from "highlight.js/lib/languages/julia";
import latex from "highlight.js/lib/languages/latex";
import matlab from "highlight.js/lib/languages/matlab";
import { common } from "lowlight";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
// Folha e fontes do KaTeX: importadas uma única vez, aqui, pelo bundle (nunca por CDN: a CSP só
// aceita folhas e fontes do próprio site; ADR-022).
import "katex/dist/katex.min.css";
import "./markdown.css";

/**
 * Opções do KaTeX para conteúdo não confiável.
 * @type {Readonly<import("rehype-katex").Options>}
 */
export const KATEX_OPTIONS = Object.freeze({
  // Sem comandos que geram marcação com URL, classe, id, estilo ou atributos escolhidos pelo
  // autor: \href, \url, \includegraphics, \htmlClass, \htmlId, \htmlStyle e \htmlData.
  trust: false,
  // Teto, em em, para medidas dadas pelo autor (por exemplo, \rule{9999em}{9999em}).
  maxSize: 30,
  // Teto de expansões de macros por fórmula: interrompe laços como \def\a{\a}\a.
  maxExpand: 1000,
  // Recursos fora do LaTeX estrito (acentos em modo matemático, por exemplo) são aceitos sem
  // registrar um aviso no servidor a cada fórmula.
  strict: "ignore",
  // Cor do trecho que o KaTeX recusa: um token, e não o vermelho fixo do padrão.
  errorColor: "var(--vitrine-danger)",
});

const REMARK_PLUGINS = [remarkGfm, remarkMath];

/**
 * Linguagens do realce (R-002): o conjunto `common` do lowlight (37) mais as cinco que um CMS
 * acadêmico precisa garantir. Outras entram sob pedido: importe a gramática de
 * `highlight.js/lib/languages/<nome>` e acrescente-a aqui, com um teste.
 * Apelidos que o highlight.js já traz: `tex`, `hs`, `f90` e `f95`.
 */
export const HIGHLIGHT_LANGUAGES = Object.freeze({ ...common, latex, matlab, julia, haskell, fortran });

// O KaTeX vem primeiro para consumir os blocos `language-math` antes que o realce tente tratá-los
// como uma linguagem (o resultado seria o mesmo, com uma tentativa inútil). O realce só atua
// quando o bloco declara a linguagem (sem detecção automática) e ignora, sem erro, uma linguagem
// que não conhece.
const REHYPE_PLUGINS = [
  [rehypeKatex, KATEX_OPTIONS],
  rehypeMathErrors,
  [rehypeHighlight, { languages: HIGHLIGHT_LANGUAGES }],
];

/** Textos em português da seção de notas de rodapé (o padrão da biblioteca é em inglês). */
const REMARK_REHYPE_OPTIONS = {
  footnoteLabel: "Notas de rodapé",
  footnoteLabelProperties: { className: ["vitrine-sr-only"] },
  /** @param {number} referenceIndex @param {number} rereferenceIndex */
  footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
    `Voltar à referência ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""}`,
};

/**
 * Plugin do rehype: acrescenta um rótulo visível, em português, às fórmulas que o KaTeX não
 * conseguiu interpretar (Cap. 5 §5.8: mensagem visível, sem derrubar a página). O KaTeX já
 * devolve o texto-fonte, com a mensagem de erro original no atributo `title`.
 */
function rehypeMathErrors() {
  /** @param {any} node */
  function visit(node) {
    if (!Array.isArray(node.children)) return;
    const classes = node.properties?.className;
    if (node.type === "element" && Array.isArray(classes) && classes.includes("katex-error")) {
      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: { className: ["vitrine-math-error-label"] },
        children: [{ type: "text", value: "Fórmula inválida: " }],
      });
      return;
    }
    node.children.forEach(visit);
  }
  return visit;
}

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
