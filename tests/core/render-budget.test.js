// Orçamento de renderização (A-021, ADR-033; RN25; Cap. 5 §5.12): `checkRenderable` valida, em um
// `worker_threads` encerrado no tempo, que o texto renderiza em 2 s. Aqui: o worker REAL (o pipeline do
// `MarkdownRenderer`) com um documento comum de 64 KiB (aceito) e entradas hostis (recusadas no orçamento),
// o laço de eventos sem bloqueio, o worker que dura e é recriado depois do encerramento, a fila (503) e,
// com workers de mentira (`fixtures/`), as falhas: exceção, morte, silêncio e subida que não acontece.
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_WAITING,
  RENDER_BUDGET_MS,
  RenderBusyError,
  checkRenderable,
  createRenderBudget,
  shutdownRenderWorker,
  stats,
} from "@/lib/render-budget";
import { projectRoot } from "../setup/prisma-cli.js";
import { commonDocument } from "./fixtures/documents.js";

afterAll(async () => {
  await shutdownRenderWorker();
});

const KB = 64 * 1024;
const fixture = (name) => () => path.join(projectRoot, "tests", "core", "fixtures", name);

/**
 * Entradas hostis que passam MUITO do orçamento nesta máquina (medido sem orçamento: 40 s ou mais, ou a pilha
 * estourada em 5,6 s), de modo que a recusa não depende de uma máquina rápida ou lenta.
 */
const HOSTILE = {
  "> repetido (64 KiB; sem orçamento termina em RangeError, 5,6 s)": "> ".repeat(KB / 2),
  "* em torre (64 KiB)": `${"*".repeat(KB / 2 - 1)}a${"*".repeat(KB / 2 - 1)}`,
  "_ em torre (64 KiB)": `${"_".repeat(KB / 2 - 1)}a${"_".repeat(KB / 2 - 1)}`,
  "*_ alternados (64 KiB)": `${"*_".repeat(KB / 4)}a${"_*".repeat(KB / 4 - 1)}`,
  "![ aninhados (18 KB; 13 s sem orçamento)": `${"![".repeat(3000)}a${"](x)".repeat(3000)}`,
};

/**
 * A lista do Arquiteto (R-021), de 64 KiB, que NESTA máquina fica entre 0,9 e 2,9 s: perto do orçamento, a
 * decisão só pode ser conferida contra o próprio orçamento (recusa quando passa dele, aceita quando não).
 */
const NEAR_BUDGET = {
  "$a ": "$a ".repeat(Math.floor(KB / 3)),
  "$$ ": "$$ ".repeat(Math.floor(KB / 3)),
  "crase": "`a ".repeat(Math.floor(KB / 3)),
  "[a](": "[a](".repeat(Math.floor(KB / 4)),
};

/** Quanto o laço de eventos demora, no pior caso, para chamar um temporizador de 20 ms. */
function watchEventLoop() {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 20);
    last = now;
  }, 20);
  return { stop: () => (clearInterval(timer), worst) };
}

describe("o worker real: o pipeline do MarkdownRenderer", () => {
  it("o documento comum de 64 KiB é aceito dentro do orçamento, com folga", async () => {
    const document = commonDocument();
    expect(Buffer.byteLength(document)).toBeLessThanOrEqual(KB);
    await checkRenderable("# aquece o worker"); // a subida do worker não conta no orçamento

    const check = await checkRenderable(document);

    expect(check.renderable).toBe(true);
    expect(check.reason).toBeUndefined();
    // Folga: um documento comum não pode falhar por pouco (a máquina do teste pode ser mais lenta).
    expect(check.ms).toBeLessThan(RENDER_BUDGET_MS * 0.75);
  });

  it("texto curto, vazio e com HTML cru: aceito (o HTML vira texto, RN11)", async () => {
    for (const text of ["", "# Olá\n\nTexto.", "<script>alert(1)</script> e <b>x</b>", "$$\\frac{1}{0}$$ e $\\oops$"]) {
      expect((await checkRenderable(text)).renderable, JSON.stringify(text)).toBe(true);
    }
  });

  it.each(Object.entries(HOSTILE))("hostil de 64 KiB, %s: recusado no orçamento (e decidido logo depois dele)", async (_name, text) => {
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(KB + 8);
    await checkRenderable("# aquece"); // sem a carga do worker no meio da conta

    const check = await checkRenderable(text);

    expect(check.renderable).toBe(false);
    expect(check.reason).toBe("timeout");
    expect(check.ms).toBeGreaterThanOrEqual(RENDER_BUDGET_MS - 50);
    expect(check.ms).toBeLessThan(RENDER_BUDGET_MS + 500);
  }, 30_000);

  it.each(Object.entries(NEAR_BUDGET))("a lista do Arquiteto, %s: a decisão é coerente com o orçamento e sai logo depois dele", async (_name, text) => {
    await checkRenderable("# aquece");

    const check = await checkRenderable(text);

    expect(check.ms).toBeLessThan(RENDER_BUDGET_MS + 500);
    // Recusado só quando passou do orçamento (por tempo); aceito só quando coube nele.
    if (check.renderable) expect(check.ms).toBeLessThan(RENDER_BUDGET_MS);
    else expect(check.ms).toBeGreaterThanOrEqual(RENDER_BUDGET_MS - 50);
  }, 30_000);

  it("a pilha estourada (RangeError) é recusada como erro, e o servidor não cai", async () => {
    // Com um orçamento largo, o aninhamento profundo de citações termina em RangeError (~2,7 s): "error", não "timeout".
    await checkRenderable("# aquece");

    const check = await checkRenderable("> ".repeat(20000) + "x", { budgetMs: 30_000 });

    expect(check).toMatchObject({ renderable: false, reason: "error" });
    expect((await checkRenderable("# depois")).renderable).toBe(true);
  }, 60_000);

  it("o encerramento no tempo é de verdade: depois do estouro, o texto seguinte é aceito logo, em um worker novo", async () => {
    const before = { ...stats };

    const refused = await checkRenderable(HOSTILE["* em torre (64 KiB)"], { budgetMs: 200 });
    const start = performance.now();
    const next = await checkRenderable("# Olá\n\nTexto normal.");
    const total = performance.now() - start;

    expect(refused).toMatchObject({ renderable: false, reason: "timeout" });
    expect(next.renderable).toBe(true);
    expect(stats.terminated).toBe(before.terminated + 1);
    expect(stats.started).toBe(before.started + 1); // o recriado
    // Um worker preso no laço de 30 s ainda estaria ocupado: o texto seguinte só passa com o encerramento.
    expect(total).toBeLessThan(10_000);
  }, 30_000);

  it("o worker dura entre as chamadas: textos seguidos não sobem um worker por chamada", async () => {
    await checkRenderable("# aquece");
    const started = stats.started;
    const times = [];

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      expect((await checkRenderable(`# Texto ${i}`)).renderable).toBe(true);
      times.push(performance.now() - start);
    }

    expect(stats.started).toBe(started);
    expect(Math.max(...times)).toBeLessThan(400); // quente: ~1 ms; subir um worker novo custa ~1 s
  });

  it("o laço de eventos NUNCA bloqueia durante uma validação que estoura o orçamento", async () => {
    await checkRenderable("# aquece");
    const watch = watchEventLoop();

    const check = await checkRenderable(HOSTILE["* em torre (64 KiB)"]);

    const worst = watch.stop();
    expect(check.renderable).toBe(false);
    expect(check.ms).toBeGreaterThanOrEqual(RENDER_BUDGET_MS - 50); // rodou o orçamento inteiro, fora do laço
    expect(worst).toBeLessThan(200);
  }, 30_000);
});

describe("a fila: uma validação por vez, poucas esperando, o resto recebe 503 (BUSY)", () => {
  it("1 rodando + 3 esperando; a quinta lança RenderBusyError com o Retry-After; as outras terminam, em ordem", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-slow-ok.mjs") });
    const order = [];
    const submit = (n) => budget.checkRenderable(`texto ${n}`).then((check) => (order.push(n), check));

    const accepted = [submit(1), submit(2), submit(3), submit(4)];
    const fifth = budget.checkRenderable("texto 5");

    expect(MAX_WAITING).toBe(3);
    await expect(fifth).rejects.toBeInstanceOf(RenderBusyError);
    await expect(fifth).rejects.toMatchObject({ retryAfter: 3 });
    expect((await Promise.all(accepted)).every((check) => check.renderable)).toBe(true);
    expect(order).toEqual([1, 2, 3, 4]); // uma por vez, na ordem de chegada
    // Com a fila vazia de novo, a seguinte é aceita.
    expect((await budget.checkRenderable("texto 6")).renderable).toBe(true);
    await budget.shutdownRenderWorker();
  });

  it("sem uma validação rodando, nenhuma é recusada (o limite é da fila de espera)", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-slow-ok.mjs") });

    expect((await budget.checkRenderable("a")).renderable).toBe(true);
    expect((await budget.checkRenderable("b")).renderable).toBe(true);
    await budget.shutdownRenderWorker();
  });
});

describe("qualquer falha de RENDERIZAÇÃO é \"complexo demais\"; falha de infraestrutura não", () => {
  it("o renderizador lança (pilha estourada, KaTeX): recusado com reason \"error\", e o worker segue", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-error.mjs") });

    expect(await budget.checkRenderable("qualquer texto")).toMatchObject({ renderable: false, reason: "error" });
    expect(await budget.checkRenderable("outro")).toMatchObject({ renderable: false, reason: "error" });
    expect(budget.stats.started).toBe(1);
    await budget.shutdownRenderWorker();
  });

  it("o worker morre no meio: recusado com reason \"error\", e o próximo texto sobe outro worker", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-dies.mjs") });

    expect(await budget.checkRenderable("x")).toMatchObject({ renderable: false, reason: "error" });
    expect(await budget.checkRenderable("y")).toMatchObject({ renderable: false, reason: "error" });
    expect(budget.stats.started).toBe(2);
    await budget.shutdownRenderWorker();
  });

  it("o worker nunca responde: recusado por tempo e ENCERRADO (o próximo sobe outro)", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-silent.mjs") });

    const first = await budget.checkRenderable("x", { budgetMs: 150 });
    const second = await budget.checkRenderable("y", { budgetMs: 150 });

    expect(first).toMatchObject({ renderable: false, reason: "timeout" });
    expect(second).toMatchObject({ renderable: false, reason: "timeout" });
    expect(budget.stats.terminated).toBe(2);
    expect(budget.stats.started).toBe(2);
    await budget.shutdownRenderWorker();
  });

  it("o orçamento passado vale: 150 ms recusam um worker que leva 200 ms, e 5 s o aceitam", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-slow-ok.mjs") });

    expect(await budget.checkRenderable("x", { budgetMs: 40 })).toMatchObject({ renderable: false, reason: "timeout" });
    expect((await budget.checkRenderable("x", { budgetMs: 5000 })).renderable).toBe(true);
    await budget.shutdownRenderWorker();
  });

  it("um worker que não sobe (módulo quebrado) NÃO é do autor: a chamada lança, e a seguinte tenta de novo", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-broken-start.mjs") });

    await expect(budget.checkRenderable("x")).rejects.toThrow(/worker/i);
    await expect(budget.checkRenderable("y")).rejects.toThrow(/worker/i);
    expect(budget.stats.started).toBe(2);
  });

  it("um worker que nunca fica pronto estoura a espera da subida e lança", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-never-ready.mjs"), startupTimeoutMs: 200 });

    await expect(budget.checkRenderable("x")).rejects.toThrow(/pronto a tempo/);
    await budget.shutdownRenderWorker();
  });

  it("uma entrada que não é texto vira texto vazio (aceito); nunca derruba", async () => {
    const budget = createRenderBudget({ workerFile: fixture("render-worker-slow-ok.mjs") });

    expect((await budget.checkRenderable(/** @type {any} */ (undefined))).renderable).toBe(true);
    expect((await budget.checkRenderable(/** @type {any} */ (null))).renderable).toBe(true);
    await budget.shutdownRenderWorker();
  });
});
