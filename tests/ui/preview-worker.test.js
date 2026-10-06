// O Web Worker REAL da pré-visualização (A-023; ADR-033), carregado em Node com um `self` de mentira: o mesmo
// processador do servidor (`render-processor.mjs`), de verdade, com o texto de verdade. Prova que o worker
// aprova o texto comum (com matemática, código e tabela), recusa o que estoura a pilha e entrega o protocolo
// (`ready`, `{ id, ok }`). O comportamento no Chromium (as builds "browser" e o shim) é verificado no navegador.
// Ambiente node, sem DOM.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** @type {{ type?: string, id?: number, ok?: boolean }[]} */
const sent = [];
/** @type {any} */
let worker;

beforeAll(async () => {
  /** @type {any} */ (globalThis).self = {
    postMessage: (/** @type {any} */ message) => sent.push(message),
  };
  await import("@/components/editor/preview-worker");
  worker = /** @type {any} */ (globalThis).self;
}, 60_000);

afterAll(() => {
  delete (/** @type {any} */ (globalThis).self);
  vi.restoreAllMocks();
});

/** Manda um texto ao worker e espera a resposta com o mesmo id. @param {number} id @param {string} markdown */
async function ask(id, markdown) {
  await worker.onmessage({ data: { id, markdown } });
  return sent.find((message) => message.id === id);
}

describe("o worker da pré-visualização", () => {
  it("avisa que está pronto ao terminar de carregar", () => {
    expect(sent[0]).toEqual({ type: "ready" });
  });

  it("aprova um texto comum", async () => {
    expect(await ask(1, "# Título\n\nUm parágrafo com **negrito** e `código`.\n\n- um\n- dois\n")).toEqual({ id: 1, ok: true });
  });

  it("aprova matemática, código e tabela (o pipeline completo, com o KaTeX e o realce)", async () => {
    const text = [
      "## Fórmulas",
      "",
      "Em linha $\\frac{a}{b} + \\sqrt{x}$ e em bloco:",
      "",
      "$$\\sum_{k=0}^{n} k^2$$",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
    ].join("\n");
    expect(await ask(2, text)).toEqual({ id: 2, ok: true });
  });

  it("uma fórmula inválida não derruba o worker (o KaTeX mostra o erro, sem lançar)", async () => {
    expect(await ask(3, "$\\frac{$ e $$\\badcommand$$")).toMatchObject({ id: 3 });
  });

  it("um aninhamento que estoura a pilha vira ok:false (e não uma exceção solta)", async () => {
    expect(await ask(4, `${"> ".repeat(20_000)}x`)).toEqual({ id: 4, ok: false });
  });

  it("responde SEMPRE com o id recebido (a checagem velha não vale para a nova)", async () => {
    await ask(10, "um");
    await ask(11, "dois");
    expect(sent.filter((message) => message.id === 10 || message.id === 11).map((message) => message.id)).toEqual([10, 11]);
  });

  it("texto vazio e só de espaços também são aprovados", async () => {
    expect(await ask(20, "")).toEqual({ id: 20, ok: true });
    expect(await ask(21, "   \n  ")).toEqual({ id: 21, ok: true });
  });

  it("entidades, HTML bruto (que não vira HTML) e URLs perigosas não derrubam", async () => {
    expect(await ask(30, "&amp; &copy; <script>alert(1)</script> [x](javascript:alert(1)) ![](data:text/html,x)")).toEqual({ id: 30, ok: true });
  });
});
