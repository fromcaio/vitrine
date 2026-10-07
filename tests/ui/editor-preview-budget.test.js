// @vitest-environment jsdom
// O editor com o orçamento da pré-visualização (A-023): em tela estreita, a pré-visualização oculta (aba
// "Editar") não renderiza nada nem cria worker; na aba "Pré-visualizar" ou em tela larga, renderiza depois
// da pausa; o texto hostil vira o aviso, sem travar o campo e sem perder o que foi digitado.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@/components/editor/Editor";
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
  /** @type {"ok" | "never"} */
  static mode = "ok";
  constructor() {
    this.mode = FakeWorker.mode;
    this.terminated = false;
    /** @type {((event: { data: any }) => void) | null} */
    this.onmessage = null;
    /** @type {((event: unknown) => void) | null} */
    this.onerror = null;
    FakeWorker.instances.push(this);
    queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }

  postMessage(/** @type {{ id: number }} */ message) {
    if (this.mode === "never") return;
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true } }));
  }

  terminate() {
    this.terminated = true;
  }
}

/** `matchMedia` de mentira: a tela é larga ou estreita. @param {boolean} wide */
function stubScreen(wide) {
  vi.stubGlobal("matchMedia", (/** @type {string} */ query) => ({
    matches: /min-width/.test(query) ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  rendered.length = 0;
  FakeWorker.instances = [];
  FakeWorker.mode = "ok";
  localStorage.clear();
  vi.stubGlobal("Worker", FakeWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const INITIAL = { title: "Aula", slug: "aula", body: "", status: /** @type {const} */ ("PUBLISHED") };
const mount = () => render(<Editor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" onSubmit={vi.fn(async () => ({ ok: /** @type {const} */ (true), id: "c1", version: "v2" }))} />);
const area = () => /** @type {HTMLTextAreaElement} */ (screen.getByLabelText("Texto do documento (Markdown)"));
const type = (/** @type {string} */ value) => fireEvent.change(area(), { target: { value } });
const tick = (/** @type {number} */ ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const previewText = () => screen.getByRole("region", { name: "Pré-visualização do documento" }).textContent ?? "";

describe("tela estreita: a pré-visualização oculta não renderiza", () => {
  it("na aba 'Editar', digitar não cria worker nem renderiza nada, por mais que se espere", async () => {
    stubScreen(false);
    mount();
    type("# texto digitado com a pré-visualização oculta");
    await tick(PREVIEW_DELAY_MS + PREVIEW_BUDGET_MS + 3000);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(rendered).toHaveLength(0);
  });

  it("o texto hostil digitado na aba 'Editar' não faz nada (nem chega ao worker)", async () => {
    stubScreen(false);
    FakeWorker.mode = "never";
    mount();
    type("![".repeat(6000));
    await tick(10_000);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(area().value).toBe("![".repeat(6000));
  });

  it("na aba 'Pré-visualizar', o texto é checado e renderizado", async () => {
    stubScreen(false);
    mount();
    type("# o texto");
    await tick(2000);
    expect(rendered).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    await tick(10);
    expect(screen.getByTestId("renderizado").textContent).toBe("# o texto");
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("voltar à aba 'Editar' para de renderizar", async () => {
    stubScreen(false);
    mount();
    type("# o texto");
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    await tick(10);
    expect(screen.queryByTestId("renderizado")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await tick(10);
    expect(screen.queryByTestId("renderizado")).toBeNull();
  });
});

describe("tela larga: renderiza depois da pausa", () => {
  it("digitar rápido renderiza só o texto final", async () => {
    stubScreen(true);
    mount();
    await tick(10);
    rendered.length = 0;
    for (const text of ["a", "ab", "abc"]) {
      type(text);
      await tick(PREVIEW_DELAY_MS - 100);
    }
    expect(rendered.some((text) => text === "ab" || text === "abc")).toBe(false); // nenhum dos intermediários
    await tick(200);
    expect(screen.getByTestId("renderizado").textContent).toBe("abc");
  });

  it("o texto hostil: o aviso aparece, o campo segue com o texto inteiro e aceita mais digitação", async () => {
    stubScreen(true);
    FakeWorker.mode = "never";
    mount();
    const hostile = "![".repeat(6000);
    type(hostile);
    await tick(PREVIEW_DELAY_MS + PREVIEW_BUDGET_MS + 200);
    expect(previewText()).toContain("A pré-visualização não está disponível: o texto é complexo demais.");
    expect(rendered).not.toContain(hostile);
    expect(area().value).toBe(hostile);
    type(`${hostile}x`); // o campo continua aceitando digitação
    expect(area().value).toBe(`${hostile}x`);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("o texto hostil não impede o envio: o servidor decide (o botão segue habilitado)", async () => {
    stubScreen(true);
    FakeWorker.mode = "never";
    mount();
    type("![".repeat(6000));
    await tick(PREVIEW_DELAY_MS + PREVIEW_BUDGET_MS + 200);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Enviar nova versão" })).disabled).toBe(false);
  });
});
