// O processador do orçamento de renderização (A-021, A-022; ADR-033): monta, a partir das listas de
// `markdown-pipeline.js` (a ÚNICA fonte da configuração do `MarkdownRenderer`), o mesmo pipeline que o
// renderizador roda: `remark-parse`, os plugins do remark, `remark-rehype` com as opções, os plugins do rehype.
// Fica em um módulo próprio, e não dentro do worker, para um teste poder conferir a montagem sem depender do
// tempo da máquina: se o worker validasse um pipeline MAIS BARATO que o do renderizador (sem o GFM e a
// matemática, ou sem o KaTeX e o realce), aceitaria texto que o renderizador leva segundos para renderizar.
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  REMARK_REHYPE_OPTIONS,
} from "../components/markdown/markdown-pipeline.js";

/** O processador completo: parse e `run` (sem React) reproduzem o custo do `react-markdown` do renderizador. */
export function createProcessor() {
  return unified().use(remarkParse).use(REMARK_PLUGINS).use(remarkRehype, REMARK_REHYPE_OPTIONS).use(REHYPE_PLUGINS);
}
