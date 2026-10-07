// @vitest-environment jsdom
// A pré-visualização com orçamento (A-023; ADR-033): oculta não renderiza, visível renderiza depois de uma
// pausa, o texto hostil nunca chega ao renderizador, e o texto comum renderiza. Worker de mentira e relógio
// simulado; o MarkdownRenderer é trocado por um que mostra o texto que recebeu e conta as renderizações.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Preview } from "@/components/editor/Preview";
import { PREVIEW_BUDGET_MS, PREVIEW_DELAY_MS } from "@/components/editor/preview-budget";

const rendered = vi.hoisted(() => /** @type {string[]} */ ([]));
vi.mock("@/components/markdown/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ markdown }) => {
    rendered.push(markdown);
    return <div data-testid="renderizado">{markdown}</div>;
  },
}));

class FakeWorker {
  /** @type {FakeWorker[]} */
  static instances = [];
  /** @type {"ok" | "fail" | "never"} */
  static mode = "ok";
  constructor() {
    this.mode = FakeWorker.mode;
    /** @type {any[]} */
    this.posted = [];
    this.terminated = false;
    /** @type {((event: { data: any }) => void) | null} */
    this.onmessage = null;
    /** @type {((event: unknown) => void) | null} */
    this.onerror = null;
    FakeWorker.instances.push(this);
    queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }

  postMessage(/** @type {{ id: number }} */ message) {
    this.posted.push(message);
    if (this.mode === "never") return;
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: this.mode === "ok" } }));
  }

  terminate() {
    this.terminated = true;
  }
}
const makeWorker = () => /** @type {any} */ (new FakeWorker());

beforeEach(() => {
  rendered.length = 0;
  FakeWorker.instances = [];
  FakeWorker.mode = "ok";
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Avança o relógio simulado e deixa as promessas assentarem. @param {number} ms */
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const shown = () => screen.queryByTestId("renderizado")?.textContent ?? null;
const regionText = () => screen.getByRole("region", { name: "Pré-visualização do documento" }).textContent ?? "";

describe("oculta: não se renderiza o que está oculto", () => {
  it("visible=false: nenhum worker, nenhuma renderização, nem depois de muito tempo", async () => {
    render(<Preview markdown="# texto" visible={false} createWorker={makeWorker} />);
    await tick(PREVIEW_DELAY_MS + PREVIEW_BUDGET_MS + 5000);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(rendered).toHaveLength(0);
    expect(shown()).toBeNull();
  });

  it("o texto hostil digitado com a pré-visualização oculta também não faz nada", async () => {
    FakeWorker.mode = "never";
    render(<Preview markdown={"![".repeat(6000)} visible={false} createWorker={makeWorker} />);
    await tick(10_000);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(rendered).toHaveLength(0);
  });

  it("ao ficar visível, o texto é checado e renderizado", async () => {
    const { rerender } = render(<Preview markdown="# texto" visible={false} createWorker={makeWorker} />);
    await tick(2000);
    rerender(<Preview markdown="# texto" visible createWorker={makeWorker} />);
    await tick(10);
    expect(shown()).toBe("# texto");
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("ao esconder de novo, para de renderizar e solta o texto da tela", async () => {
    const { rerender } = render(<Preview markdown="# texto" createWorker={makeWorker} />);
    await tick(10);
    expect(shown()).toBe("# texto");
    rerender(<Preview markdown="# texto" visible={false} createWorker={makeWorker} />);
    await tick(10);
    expect(shown()).toBeNull();
  });
});

describe("visível: renderiza depois de uma pausa na digitação", () => {
  it("a primeira renderização é imediata (não há o que esperar)", async () => {
    render(<Preview markdown="# um" createWorker={makeWorker} />);
    await tick(0);
    expect(shown()).toBe("# um");
  });

  it("a cada digitação a pausa recomeça: só o texto final é checado e renderizado", async () => {
    const { rerender } = render(<Preview markdown="a" createWorker={makeWorker} />);
    await tick(10);
    rendered.length = 0;
    FakeWorker.instances[0].posted.length = 0;
    for (const text of ["ab", "abc", "abcd", "abcde"]) {
      rerender(<Preview markdown={text} createWorker={makeWorker} />);
      await tick(PREVIEW_DELAY_MS - 50); // menos que a pausa: ainda digitando
    }
    expect(FakeWorker.instances[0].posted).toHaveLength(0);
    expect(rendered.every((text) => text === "a")).toBe(true); // só o texto antigo, nenhum dos digitados
    await tick(100); // a pausa passou
    expect(FakeWorker.instances[0].posted.map((m) => m.markdown)).toEqual(["abcde"]);
    expect(shown()).toBe("abcde");
  });

  it("enquanto o texto novo não foi aprovado, continua à mostra o anterior, marcado como pendente (aria-busy)", async () => {
    const { rerender } = render(<Preview markdown="primeiro" createWorker={makeWorker} />);
    await tick(10);
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("false");
    rerender(<Preview markdown="segundo" createWorker={makeWorker} />);
    await tick(10);
    expect(shown()).toBe("primeiro");
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
    await tick(PREVIEW_DELAY_MS);
    expect(shown()).toBe("segundo");
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("false");
  });

  it("antes da primeira aprovação, o aviso 'Carregando'", async () => {
    FakeWorker.mode = "never";
    render(<Preview markdown="texto" createWorker={makeWorker} />);
    await tick(10);
    expect(regionText()).toMatch(/Carregando a pré-visualização/);
  });
});

describe("o texto comum renderiza", () => {
  it("renderiza o texto aprovado e mais nada", async () => {
    render(<Preview markdown={"# Título\n\n**negrito** e $x^2$"} createWorker={makeWorker} />);
    await tick(10);
    expect(shown()).toBe("# Título\n\n**negrito** e $x^2$");
    expect(regionText()).not.toMatch(/complexo demais/);
  });

  it("texto em branco: a dica, sem worker", async () => {
    render(<Preview markdown="   " createWorker={makeWorker} />);
    await tick(2000);
    expect(regionText()).toMatch(/A pré-visualização do texto aparece aqui/);
    expect(FakeWorker.instances).toHaveLength(0);
  });
});

describe("o texto hostil não chega ao renderizador nem trava a aba", () => {
  const HOSTILE = "![".repeat(6000);

  it("um worker que não responde: depois da pausa e do orçamento, a mensagem; o texto NUNCA é renderizado", async () => {
    FakeWorker.mode = "never";
    render(<Preview markdown={HOSTILE} createWorker={makeWorker} />);
    await tick(PREVIEW_BUDGET_MS - 100);
    expect(regionText()).not.toMatch(/complexo demais/);
    await tick(200);
    expect(regionText()).toContain("A pré-visualização não está disponível: o texto é complexo demais.");
    expect(rendered).not.toContain(HOSTILE);
    expect(rendered.every((text) => text !== HOSTILE)).toBe(true);
    expect(shown()).toBeNull();
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("um worker que responde 'falhou' (a pilha estourada): a mensagem na hora, sem esperar o orçamento", async () => {
    FakeWorker.mode = "fail";
    render(<Preview markdown={"> ".repeat(20000)} createWorker={makeWorker} />);
    await tick(10);
    expect(regionText()).toContain("o texto é complexo demais");
    expect(shown()).toBeNull();
  });

  it("a mensagem é um aviso para leitor de tela (role=status)", async () => {
    FakeWorker.mode = "fail";
    render(<Preview markdown={HOSTILE} createWorker={makeWorker} />);
    await tick(10);
    expect(screen.getByRole("status").textContent).toContain("complexo demais");
  });

  it("depois do hostil, um texto comum volta a renderizar (com um worker novo)", async () => {
    FakeWorker.mode = "never";
    const { rerender } = render(<Preview markdown={HOSTILE} createWorker={makeWorker} />);
    await tick(PREVIEW_BUDGET_MS + 100);
    expect(regionText()).toMatch(/complexo demais/);
    FakeWorker.mode = "ok";
    rerender(<Preview markdown="# de novo" createWorker={makeWorker} />);
    await tick(PREVIEW_DELAY_MS + 10);
    expect(shown()).toBe("# de novo");
    expect(regionText()).not.toMatch(/complexo demais/);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("enquanto o texto muda e a checagem nova não terminou, o aviso anterior continua (pendente)", async () => {
    FakeWorker.mode = "fail";
    const { rerender } = render(<Preview markdown={HOSTILE} createWorker={makeWorker} />);
    await tick(10);
    FakeWorker.mode = "ok";
    rerender(<Preview markdown={`${HOSTILE}x`} createWorker={makeWorker} />);
    await tick(10);
    expect(regionText()).toMatch(/complexo demais/);
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
  });

  it("o worker é encerrado quando a pré-visualização sai da tela", async () => {
    FakeWorker.mode = "never";
    const { unmount } = render(<Preview markdown={HOSTILE} createWorker={makeWorker} />);
    await tick(10);
    unmount();
    expect(FakeWorker.instances[0]?.terminated ?? true).toBe(true);
  });
});

describe("worker indisponível", () => {
  it("o navegador recusa o worker: avisa que a pré-visualização não está disponível e NÃO renderiza no processo principal", async () => {
    render(
      <Preview
        markdown={"![".repeat(6000)}
        createWorker={() => {
          throw new Error("recusado");
        }}
      />,
    );
    await tick(10);
    expect(regionText()).toContain("A pré-visualização não está disponível neste navegador.");
    expect(rendered).toHaveLength(0);
  });

  it("sem Worker no ambiente (o jsdom, navegadores antigos): renderiza como antes, na hora", () => {
    vi.useRealTimers();
    render(<Preview markdown="# sem worker" />);
    expect(shown()).toBe("# sem worker");
  });
});
