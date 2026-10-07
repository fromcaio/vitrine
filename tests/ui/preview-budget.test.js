// O verificador do orçamento da pré-visualização (A-023; ADR-033): um worker de mentira que responde, que
// falha, que não responde e que nem sobe. O relógio é simulado (nenhum `sleep`). Ambiente node, sem DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_BUDGET_MS,
  PREVIEW_DELAY_MS,
  PREVIEW_STARTUP_MS,
  TOO_COMPLEX_PREVIEW_MESSAGE,
  UNAVAILABLE_PREVIEW_MESSAGE,
  createBudgetChecker,
} from "@/components/editor/preview-budget";

/** Um worker de mentira. `mode` diz o que ele faz com cada texto: responde ok, responde falha ou não responde. */
class FakeWorker {
  /** @type {FakeWorker[]} */
  static instances = [];
  /** @param {{ mode?: "ok" | "fail" | "never", ready?: boolean }} [options] */
  constructor({ mode = "ok", ready = true } = {}) {
    this.mode = mode;
    /** @type {any[]} */
    this.posted = [];
    this.terminated = false;
    /** @type {((event: { data: any }) => void) | null} */
    this.onmessage = null;
    /** @type {((event: unknown) => void) | null} */
    this.onerror = null;
    FakeWorker.instances.push(this);
    if (ready) queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }

  postMessage(/** @type {{ id: number }} */ message) {
    this.posted.push(message);
    if (this.mode === "never") return; // o texto hostil: o worker fica preso e nunca responde
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: this.mode === "ok" } }));
  }

  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const make = (/** @type {ConstructorParameters<typeof FakeWorker>[0]} */ options, extra = {}) =>
  createBudgetChecker({ createWorker: () => /** @type {any} */ (new FakeWorker(options)), budgetMs: 1000, startupMs: 5000, ...extra });

describe("as constantes", () => {
  it("a pausa é curta, o orçamento é de cerca de 1 s (o servidor dá 2 s) e há um prazo para a subida", () => {
    expect(PREVIEW_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(PREVIEW_DELAY_MS).toBeLessThanOrEqual(800);
    expect(PREVIEW_BUDGET_MS).toBe(1000);
    expect(PREVIEW_STARTUP_MS).toBeGreaterThan(PREVIEW_BUDGET_MS);
  });

  it("as mensagens são as do contrato", () => {
    expect(TOO_COMPLEX_PREVIEW_MESSAGE).toBe("A pré-visualização não está disponível: o texto é complexo demais.");
    expect(UNAVAILABLE_PREVIEW_MESSAGE).toMatch(/não está disponível/);
  });
});

describe("createBudgetChecker", () => {
  it("um texto comum: o worker responde ok", async () => {
    const checker = make({ mode: "ok" });
    const result = checker.check("# texto");
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBe("ok");
    expect(FakeWorker.instances[0].posted).toEqual([{ id: 1, markdown: "# texto" }]);
  });

  it("o processamento que FALHA (a pilha estourada, uma exceção do KaTeX) é 'complexo demais'", async () => {
    const checker = make({ mode: "fail" });
    const result = checker.check("> > > >");
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBe("too-complex");
  });

  it("o texto hostil que prende o worker: estoura o orçamento, o worker é ENCERRADO e a resposta é 'complexo demais'", async () => {
    const checker = make({ mode: "never" });
    const result = checker.check("![".repeat(6000));
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWorker.instances[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await result).toBe("too-complex");
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("o orçamento só começa DEPOIS de o worker subir: uma subida lenta não gasta o orçamento do texto", async () => {
    /** @type {FakeWorker | null} */
    let slow = null;
    const checker = createBudgetChecker({
      createWorker: () => {
        slow = new FakeWorker({ mode: "ok", ready: false });
        return /** @type {any} */ (slow);
      },
      budgetMs: 1000,
      startupMs: 8000,
    });
    const result = checker.check("texto");
    await vi.advanceTimersByTimeAsync(5000); // a subida leva 5 s, mais que o orçamento
    expect(slow?.posted).toHaveLength(0);
    slow?.onmessage?.({ data: { type: "ready" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBe("ok");
  });

  it("um worker que nem sobe (a subida passa do prazo): 'unavailable'", async () => {
    const checker = make({ ready: false });
    const result = checker.check("texto");
    await vi.advanceTimersByTimeAsync(5001);
    expect(await result).toBe("unavailable");
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("um erro de carga do worker (o evento error antes do ready): 'unavailable'", async () => {
    const checker = make({ ready: false });
    const result = checker.check("texto");
    FakeWorker.instances[0].onerror?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBe("unavailable");
  });

  it("o navegador recusa criar o worker (a política de segurança): 'unavailable', sem lançar", async () => {
    const checker = createBudgetChecker({
      createWorker: () => {
        throw new Error("recusado pela CSP");
      },
    });
    expect(await checker.check("texto")).toBe("unavailable");
  });

  it("uma exceção solta do worker durante o processamento é 'complexo demais' e encerra o worker", async () => {
    const checker = make({ mode: "never" });
    const result = checker.check("texto");
    await vi.advanceTimersByTimeAsync(0);
    FakeWorker.instances[0].onerror?.({});
    expect(await result).toBe("too-complex");
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("o MESMO worker atende checagens seguidas (subir custa; um por texto somaria isso à digitação)", async () => {
    const checker = make({ mode: "ok" });
    for (const text of ["um", "dois", "três"]) {
      const result = checker.check(text);
      await vi.advanceTimersByTimeAsync(0);
      expect(await result).toBe("ok");
    }
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].posted.map((m) => m.markdown)).toEqual(["um", "dois", "três"]);
  });

  it("depois de estourar o orçamento, a checagem seguinte usa um worker NOVO", async () => {
    let calls = 0;
    const checker = createBudgetChecker({
      createWorker: () => {
        calls += 1;
        return /** @type {any} */ (new FakeWorker({ mode: calls === 1 ? "never" : "ok" }));
      },
      budgetMs: 1000,
    });
    const first = checker.check("hostil");
    await vi.advanceTimersByTimeAsync(1001);
    expect(await first).toBe("too-complex");
    const second = checker.check("comum");
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toBe("ok");
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });

  it("uma checagem nova passa na frente da que corre: a velha é 'superseded' e o worker ocupado é descartado", async () => {
    let calls = 0;
    const checker = createBudgetChecker({
      createWorker: () => {
        calls += 1;
        return /** @type {any} */ (new FakeWorker({ mode: calls === 1 ? "never" : "ok" }));
      },
      budgetMs: 1000,
    });
    const old = checker.check("texto velho que prende o worker");
    await vi.advanceTimersByTimeAsync(10);
    const fresh = checker.check("texto novo");
    await vi.advanceTimersByTimeAsync(0);
    expect(await old).toBe("superseded");
    expect(await fresh).toBe("ok");
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("uma resposta atrasada de uma checagem velha não vale para a nova", async () => {
    const checker = make({ mode: "never" });
    const first = checker.check("a");
    await vi.advanceTimersByTimeAsync(0);
    const stale = FakeWorker.instances[0];
    const second = checker.check("b");
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toBe("superseded");
    stale.onmessage?.({ data: { id: 1, ok: true } }); // tardia: o worker velho já foi descartado
    await vi.advanceTimersByTimeAsync(1001);
    expect(await second).toBe("too-complex"); // a nova, sem resposta, estoura o orçamento dela
  });

  it("dispose encerra o worker e solta a checagem em andamento; o verificador segue usável", async () => {
    const checker = make({ mode: "never" });
    const pending = checker.check("texto");
    await vi.advanceTimersByTimeAsync(0);
    checker.dispose();
    expect(await pending).toBe("superseded");
    expect(FakeWorker.instances[0].terminated).toBe(true);
    const next = createBudgetChecker({ createWorker: () => /** @type {any} */ (new FakeWorker({ mode: "ok" })) });
    const result = next.check("x");
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toBe("ok");
  });

  it("o orçamento configurado é respeitado (500 ms)", async () => {
    const checker = make({ mode: "never" }, { budgetMs: 500 });
    const result = checker.check("texto");
    await vi.advanceTimersByTimeAsync(501);
    expect(await result).toBe("too-complex");
  });
});
