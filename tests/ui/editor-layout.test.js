// @vitest-environment jsdom
// P-024, item 8: o bloco de edição (a barra de ferramentas, o espaço entre ela e o texto, e o texto) e a
// pré-visualização têm EXATAMENTE a mesma altura. O que o jsdom consegue afirmar é o leiaute: a mesma classe de
// altura nos dois lados, o texto com `flex-1 min-h-0` (ocupa o que a barra deixa, qualquer que seja a altura
// dela), sem `resize-y` (desfaria a igualdade), e as dicas, o erro e o aviso de http:// FORA do bloco. As alturas
// medidas de verdade (`getBoundingClientRect`) estão no ensaio sobre o build de produção.
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RendererStub, body, renderEditor, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

afterEach(cleanup);

const classesOf = (/** @type {Element} */ node) => [...node.classList];
const HEIGHTS = ["h-[26rem]", "md:h-[34rem]"];

/** O bloco de edição: o pai do texto. */
const block = () => /** @type {HTMLElement} */ (body().parentElement);
const previewRegion = () => screen.getByRole("region", { name: "Pré-visualização do documento" });

describe("Editor: a mesma altura dos dois lados (item 8)", () => {
  it("o bloco de edição e a pré-visualização levam as MESMAS classes de altura (26rem e, no md, 34rem)", () => {
    renderEditor();
    expect(classesOf(block())).toEqual(expect.arrayContaining(HEIGHTS));
    expect(classesOf(previewRegion())).toEqual(expect.arrayContaining(HEIGHTS));
    const heightClasses = (/** @type {Element} */ node) => classesOf(node).filter((name) => /^(md:)?h-/.test(name)).sort();
    expect(heightClasses(block())).toEqual(heightClasses(previewRegion()));
  });

  it("o texto ocupa o que a barra deixa: flex-1 e min-h-0, sem altura própria", () => {
    renderEditor();
    const area = classesOf(body());
    expect(area).toEqual(expect.arrayContaining(["flex-1", "min-h-0"]));
    expect(area.some((name) => /^(md:)?h-/.test(name)), "o texto não tem altura própria").toBe(false);
    expect(classesOf(block())).toEqual(expect.arrayContaining(["flex", "flex-col", "min-h-0", "gap-2"]));
  });

  it("sem resize-y (o redimensionamento desfaria a igualdade): resize-none", () => {
    renderEditor();
    expect(classesOf(body())).not.toContain("resize-y");
    expect(classesOf(body())).toContain("resize-none");
  });

  it("a barra é a primeira do bloco e não encolhe (shrink-0), por mais que quebre em linhas", () => {
    renderEditor();
    const first = /** @type {HTMLElement} */ (block().firstElementChild);
    expect(classesOf(first)).toContain("shrink-0");
    expect(within(first).getByRole("toolbar")).toBeTruthy();
  });

  it("a grade tem items-stretch e duas colunas no md; os dois lados são filhos dela", () => {
    renderEditor();
    const grid = /** @type {HTMLElement} */ (screen.getByRole("region", { name: "Edição" }).parentElement);
    expect(classesOf(grid)).toEqual(expect.arrayContaining(["grid", "md:grid-cols-2", "md:items-stretch"]));
    expect(previewRegion().closest("section")?.parentElement).toBe(grid);
  });

  it("as dicas ficam FORA do bloco, depois dele (não entram na conta da altura)", () => {
    renderEditor();
    const hint = screen.getByText(/Markdown com tabelas e listas de tarefas/);
    expect(block().contains(hint)).toBe(false);
    expect(block().compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o aviso de http:// também fica fora do bloco", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "![x](http://exemplo.test/a.png)", status: "PUBLISHED" } });
    const warning = /** @type {HTMLElement} */ (screen.getByText((text) => text.includes("Uma imagem usa um endereço http://")).closest("p"));
    expect(warning.getAttribute("role")).toBe("status");
    expect(block().contains(warning)).toBe(false);
  });

  it("o texto continua rotulado e ligado às dicas (aria-describedby), agora dentro do bloco", () => {
    renderEditor();
    expect(body().getAttribute("aria-describedby")).toBeTruthy();
    for (const id of /** @type {string} */ (body().getAttribute("aria-describedby")).split(" ")) {
      expect(document.getElementById(id), id).toBeTruthy();
    }
    type(body(), "novo texto");
    expect(body().value).toBe("novo texto");
  });
});

