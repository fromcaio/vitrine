// O Web Worker da pré-visualização do editor (A-023; ADR-033): roda NO NAVEGADOR, fora da thread principal, o
// MESMO processador que o servidor usa para validar o texto na gravação (`render-processor.mjs`, montado
// com as listas de `markdown-pipeline.js`, a fonte única). Não renderiza nada: só mede se o texto
// processa, para a thread principal decidir se o renderiza. Quem o encerra é `preview-budget.js`, ao
// estourar o orçamento (`terminate` para até um laço síncrono, que um `try` não pega).
//
// Protocolo: ao terminar de carregar, envia `{ type: "ready" }`; para cada `{ id, markdown }` recebido,
// responde `{ id, ok: true }` ou `{ id, ok: false }`. Qualquer exceção (a pilha estourada por um
// aninhamento profundo, uma falha do KaTeX) volta como `ok: false`. Não conhece o DOM, o usuário nem o tema.
// O shim vem PRIMEIRO: o pipeline só carrega com ele (ver o arquivo).
import "./preview-worker-shim";
import { createProcessor } from "@/lib/render-processor.mjs";

const processor = createProcessor();

self.onmessage = async (/** @type {MessageEvent<{ id: number, markdown: string }>} */ { data }) => {
  try {
    await processor.run(processor.parse(data.markdown));
    self.postMessage({ id: data.id, ok: true });
  } catch {
    self.postMessage({ id: data.id, ok: false });
  }
};

self.postMessage({ type: "ready" });
