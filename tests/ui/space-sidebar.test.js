// @vitest-environment jsdom
// Sidebar do espaço (RF12, RNF05, RNF06; M17): item ativo, recolher e expandir níveis e o menu de
// tela estreita com aria-expanded. O ativo vem da prop activePath, não da rota.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { sampleCollection } from "./space-helpers";

afterEach(cleanup);

const BASE = "/maria";
const DEEP = ["algoritmos", "estruturas", "listas", "encadeadas", "nos", "ponteiros-duplos"];

function setup(activePath = /** @type {string[]} */ ([])) {
  const collection = sampleCollection();
  const view = render(<Sidebar collection={collection} basePath={BASE} activePath={activePath} />);
  const rerender = (/** @type {string[]} */ path) => view.rerender(<Sidebar collection={collection} basePath={BASE} activePath={path} />);
  return { collection, rerender };
}

const toggle = (/** @type {string} */ title) => screen.getByRole("button", { name: `Subitens de ${title}` });
const link = (/** @type {string} */ name) => screen.queryByRole("link", { name });
const menuButton = () => screen.getByRole("button", { name: /^Menu:/ });

describe("estrutura e landmarks", () => {
  it("é uma navegação rotulada com o título da coleção", () => {
    setup();
    expect(screen.getByRole("navigation", { name: "Coleção Algoritmos e Estruturas de Dados" })).toBeTruthy();
  });

  it("os links levam a /{handle}/{cadeia de slugs}", () => {
    setup(["algoritmos", "introducao", "o-que-e-c"]);
    expect(link("O que é C")?.getAttribute("href")).toBe("/maria/algoritmos/introducao/o-que-e-c");
    expect(link("Variáveis")?.getAttribute("href")).toBe("/maria/algoritmos/variaveis");
    expect(link("Introdução")?.getAttribute("href")).toBe("/maria/algoritmos/introducao");
  });
});

describe("item ativo (RF12)", () => {
  it("só o item da página corrente leva aria-current=page", () => {
    setup(["algoritmos", "introducao", "historia"]);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["História de C"]);
  });

  it("o item ativo usa os tokens de destaque (primária e texto sobre ela), e não cores fixas", () => {
    setup(["algoritmos", "variaveis"]);
    const active = /** @type {HTMLElement} */ (link("Variáveis"));
    expect(active.className).toMatch(/bg-primary/);
    expect(active.className).toMatch(/text-on-primary/);
    expect(link("Arquivos")?.className).not.toMatch(/bg-primary/);
    expect(document.body.innerHTML).not.toMatch(/text-white|bg-white|bg-black/);
  });

  it("uma coleção ativa se marca; um ancestral do ativo não", () => {
    setup(["algoritmos", "introducao"]);
    expect(link("Introdução")?.getAttribute("aria-current")).toBe("page");
    cleanup();
    setup(["algoritmos", "introducao", "historia"]);
    expect(link("Introdução")?.getAttribute("aria-current")).toBeNull();
  });

  it("sem página corrente, nenhum item é marcado", () => {
    setup([]);
    expect(screen.getAllByRole("link").some((a) => a.hasAttribute("aria-current"))).toBe(false);
  });

  it("acompanha a navegação: o novo activePath move a marca", () => {
    const { rerender } = setup(["algoritmos", "variaveis"]);
    rerender(["algoritmos", "arquivos"]);
    expect(link("Arquivos")?.getAttribute("aria-current")).toBe("page");
    expect(link("Variáveis")?.getAttribute("aria-current")).toBeNull();
  });
});

describe("recolher e expandir níveis (RF12)", () => {
  it("por padrão só a cadeia do item ativo está aberta", () => {
    setup(["algoritmos", "introducao", "o-que-e-c"]);
    expect(toggle("Introdução").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("Estruturas").getAttribute("aria-expanded")).toBe("false");
    expect(link("O que é C")).toBeTruthy();
    expect(link("Listas")).toBeNull();
  });

  it("o botão alterna aria-expanded e mostra ou esconde os filhos, sem navegar", () => {
    setup(["algoritmos", "variaveis"]);
    expect(link("Listas")).toBeNull();
    fireEvent.click(toggle("Estruturas"));
    expect(toggle("Estruturas").getAttribute("aria-expanded")).toBe("true");
    expect(link("Listas")).toBeTruthy();
    fireEvent.click(toggle("Estruturas"));
    expect(toggle("Estruturas").getAttribute("aria-expanded")).toBe("false");
    expect(link("Listas")).toBeNull();
  });

  it("o botão controla a lista dos filhos (aria-controls aponta para um elemento existente)", () => {
    setup(["algoritmos", "introducao", "historia"]);
    const controls = toggle("Introdução").getAttribute("aria-controls");
    const panel = document.getElementById(/** @type {string} */ (controls));
    expect(panel).toBeTruthy();
    expect(within(/** @type {HTMLElement} */ (panel)).getByRole("link", { name: "O que é C" })).toBeTruthy();
  });

  it("o leitor pode recolher a cadeia do item ativo, e a escolha dele vale enquanto ele navega", () => {
    const { rerender } = setup(["algoritmos", "introducao", "historia"]);
    fireEvent.click(toggle("Introdução"));
    expect(link("O que é C")).toBeNull();
    rerender(["algoritmos", "introducao", "o-que-e-c"]);
    expect(toggle("Introdução").getAttribute("aria-expanded")).toBe("false");
  });

  it("uma nova navegação abre o caminho até o novo item ativo", () => {
    const { rerender } = setup(["algoritmos", "variaveis"]);
    expect(link("Ponteiros duplos")).toBeNull();
    rerender(DEEP);
    for (const title of ["Estruturas", "Listas", "Listas encadeadas", "Nós"]) {
      expect(toggle(title).getAttribute("aria-expanded"), title).toBe("true");
    }
    expect(link("Ponteiros duplos")?.getAttribute("aria-current")).toBe("page");
  });

  it("documentos não têm botão de recolher", () => {
    setup(["algoritmos", "variaveis"]);
    expect(screen.queryByRole("button", { name: "Subitens de Variáveis" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subitens de Arquivos" })).toBeNull();
  });

  it("aguenta cinco níveis com nomes longos, que quebram em vez de estourar a largura", () => {
    setup(DEEP);
    const deepest = /** @type {HTMLElement} */ (link("Ponteiros duplos"));
    expect(deepest.className).toMatch(/break-words/);
    expect(deepest.closest("div")?.getAttribute("style") ?? "").toMatch(/padding-inline-start: 3rem/);
  });
});

describe("menu em tela estreita (RNF06)", () => {
  it("o botão começa fechado e liga aria-expanded ao painel de navegação", () => {
    setup(["algoritmos", "variaveis"]);
    const button = menuButton();
    const nav = screen.getByRole("navigation", { hidden: true });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(nav.id);
    expect(nav.className).toMatch(/\bhidden\b/);
    expect(nav.className).toMatch(/md:block/);
  });

  it("abre e fecha, e o painel só aparece enquanto aberto", () => {
    setup(["algoritmos", "variaveis"]);
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation", { name: /^Coleção/ }).className).not.toMatch(/\bhidden\b/);
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("navigation", { hidden: true }).className).toMatch(/\bhidden\b/);
  });

  it("fecha sozinho ao navegar para outra página", () => {
    const { rerender } = setup(["algoritmos", "variaveis"]);
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    rerender(["algoritmos", "arquivos"]);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("o botão é só para tela estreita (some a partir de 768 px) e mostra o título da coleção", () => {
    setup([]);
    expect(menuButton().parentElement?.className).toMatch(/md:hidden/);
    expect(menuButton().textContent).toContain("Algoritmos e Estruturas de Dados");
  });

  it("o teclado alcança o botão do menu, o dos níveis e os links na ordem do documento", () => {
    setup(["algoritmos", "introducao", "historia"]);
    const order = [...document.querySelectorAll("button, a")].map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(order.slice(0, 4)).toEqual([expect.stringMatching(/^Menu:/), "Subitens de Introdução", "Introdução", "O que é C"]);
  });
});
