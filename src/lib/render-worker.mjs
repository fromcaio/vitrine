// Worker do orçamento de renderização (A-021, ADR-033; Cap. 5 §5.12): roda DENTRO de um `worker_threads`
// iniciado por `render-budget.js`, nunca no processo do servidor. Executa o MESMO pipeline do
// `MarkdownRenderer` (a configuração vem de `markdown-pipeline.js`, a única fonte: nada é copiado aqui):
// `remark-parse`, os plugins do remark, `remark-rehype` com as opções e os plugins do rehype; parse e
// `run`, sem React. Não conhece o banco, a sessão nem o ambiente.
//
// Protocolo: ao terminar de carregar, envia `{ type: "ready" }`; para cada `{ id, markdown }` recebido,
// responde `{ id, ok: true }` ou `{ id, ok: false, error }`. Qualquer exceção (a pilha estourada por um
// aninhamento profundo, uma falha do KaTeX) volta como `ok: false`: quem decide é o orçamento.
//
// Extensão `.mjs` de propósito: é ESM sem exigir `"type": "module"` no `package.json` (que mudaria todos
// os `.js` do repositório). O `markdown-pipeline.js` é ESM em um pacote sem `type`: o Node o relê como
// ESM e avisa (`MODULE_TYPELESS_PACKAGE_JSON`, inofensivo); `render-budget.js` desliga esse aviso só aqui.
import { parentPort } from "node:worker_threads";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  REMARK_REHYPE_OPTIONS,
} from "../components/markdown/markdown-pipeline.js";

const port = /** @type {import("node:worker_threads").MessagePort} */ (parentPort);

const processor = unified().use(remarkParse).use(REMARK_PLUGINS).use(remarkRehype, REMARK_REHYPE_OPTIONS).use(REHYPE_PLUGINS);

port.on("message", async (/** @type {{ id: number, markdown: string }} */ { id, markdown }) => {
  try {
    await processor.run(processor.parse(markdown));
    port.postMessage({ id, ok: true });
  } catch (error) {
    port.postMessage({ id, ok: false, error: error instanceof Error ? error.name : "erro" });
  }
});

port.postMessage({ type: "ready" });
