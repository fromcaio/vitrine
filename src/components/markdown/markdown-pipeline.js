// O pipeline do Markdown (M08; RF09 a RF11; Cap. 5 §5.8; ADR-033), SEM React e SEM CSS: os plugins do
// remark e do rehype, as opções do KaTeX e do remark-rehype e as linguagens do realce. É a ÚNICA
// fonte dessa configuração: o `MarkdownRenderer` a importa daqui, e o Core a usa para validar, na
// gravação, que o texto renderiza dentro do orçamento de tempo, em um `worker_threads` do Node, que
// não carrega CSS nem JSX. Qualquer mudança aqui muda, de uma vez só, o HTML da página pública e o
// que a gravação aceita.
//
// O Markdown vem de autores não confiáveis (ADR-023), por isso:
//  - não há HTML bruto (RN11): sem rehype-raw, o HTML escrito no texto aparece como texto;
//  - o KaTeX roda com `trust` desligado (\href, \url, \includegraphics e \html* não geram marcação)
//    e com limites de tamanho e de expansão de macros.
import fortran from "highlight.js/lib/languages/fortran";
import haskell from "highlight.js/lib/languages/haskell";
import julia from "highlight.js/lib/languages/julia";
import latex from "highlight.js/lib/languages/latex";
import matlab from "highlight.js/lib/languages/matlab";
import { common } from "lowlight";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

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

export const REMARK_PLUGINS = [remarkGfm, remarkMath];

/**
 * Linguagens do realce (R-002): o conjunto `common` do lowlight (37) mais as cinco que um CMS
 * acadêmico precisa garantir. Outras entram sob pedido: importe a gramática de
 * `highlight.js/lib/languages/<nome>` e acrescente-a aqui, com um teste.
 * Apelidos que o highlight.js já traz: `tex`, `hs`, `f90` e `f95`.
 */
export const HIGHLIGHT_LANGUAGES = Object.freeze({ ...common, latex, matlab, julia, haskell, fortran });

/**
 * Plugin do rehype: acrescenta um rótulo visível, em português, às fórmulas que o KaTeX não
 * conseguiu interpretar (Cap. 5 §5.8: mensagem visível, sem derrubar a página). O KaTeX já
 * devolve o texto-fonte, com a mensagem de erro original no atributo `title`.
 */
export function rehypeMathErrors() {
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

// O KaTeX vem primeiro para consumir os blocos `language-math` antes que o realce tente tratá-los
// como uma linguagem (o resultado seria o mesmo, com uma tentativa inútil). O realce só atua
// quando o bloco declara a linguagem (sem detecção automática) e ignora, sem erro, uma linguagem
// que não conhece.
export const REHYPE_PLUGINS = [
  [rehypeKatex, KATEX_OPTIONS],
  rehypeMathErrors,
  [rehypeHighlight, { languages: HIGHLIGHT_LANGUAGES }],
];

/** Textos em português da seção de notas de rodapé (o padrão da biblioteca é em inglês). */
export const REMARK_REHYPE_OPTIONS = {
  footnoteLabel: "Notas de rodapé",
  footnoteLabelProperties: { className: ["vitrine-sr-only"] },
  /** @param {number} referenceIndex @param {number} rereferenceIndex */
  footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
    `Voltar à referência ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""}`,
};
