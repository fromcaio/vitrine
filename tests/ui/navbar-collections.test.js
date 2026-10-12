// @vitest-environment jsdom
// P-026: a barra de coleções do `Navbar` (`NavbarCollections`): uma só linha, de altura fixa, rolável na horizontal,
// com os links no HTML do servidor, setas, arrastar, roda do mouse sem prender a página, item ativo centralizado,
// movimento reduzido e o realce pela cor primária do tema. O jsdom não tem layout: as medidas de rolagem
// (`scrollWidth`, `clientWidth`, `scrollLeft`) e os retângulos são simulados; as medidas de verdade ficam para o
// ensaio no navegador sobre o build de produção.
import { readFileSync } from "node:fs";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

import { PalettePreview } from "@/components/admin/PalettePreview";
import { Navbar } from "@/components/layout/Navbar";
import { DRAG_THRESHOLD, FOCUS_MARGIN, HOLD_INTERVAL, NavbarCollections, centeredScrollLeft, keepInViewScrollLeft } from "@/components/layout/NavbarCollections";

const ITEMS = [
  { id: "a", label: "Cálculo", href: "/maria/calculo", current: false },
  { id: "b", label: "Álgebra Linear e Geometria Analítica", href: "/maria/algebra", current: true },
  { id: "c", label: "Probabilidade", href: "/maria/prob", current: false },
];
const LEFT = { name: "Rolar as coleções para a esquerda" };
const RIGHT = { name: "Rolar as coleções para a direita" };

const classesOf = (/** @type {Element} */ node) => [...node.classList];
const list = () => /** @type {HTMLUListElement} */ (screen.getByRole("list"));

/** Metade da simulação de layout: o que o jsdom não calcula. */
const metrics = { scrollWidth: 1000, clientWidth: 300 };
const original = {
  scrollWidth: Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth"),
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth"),
  rect: Element.prototype.getBoundingClientRect,
};
/** Retângulos simulados: a faixa (UL) e o item ativo; o resto, zero. */
const rects = { list: { left: 0, width: 300 }, active: { left: 500, width: 100 } };

beforeEach(() => {
  metrics.scrollWidth = 1000;
  metrics.clientWidth = 300;
  Object.defineProperty(Element.prototype, "scrollWidth", { configurable: true, get() { return this.tagName === "UL" ? metrics.scrollWidth : 0; } });
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return this.tagName === "UL" ? metrics.clientWidth : 0; } });
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const box = this.tagName === "UL" ? rects.list : this.getAttribute?.("aria-current") === "page" ? rects.active : { left: 0, width: 0 };
    return /** @type {DOMRect} */ ({ ...box, right: box.left + box.width, top: 0, bottom: 0, height: 0, x: box.left, y: 0, toJSON: () => ({}) });
  };
  // jsdom não rola elementos: os dois métodos viram espiões que também movem o `scrollLeft`.
  Element.prototype.scrollBy = vi.fn(function scrollBy(options) {
    this.scrollLeft += options.left;
  });
  Element.prototype.scrollTo = vi.fn(function scrollTo(options) {
    this.scrollLeft = options.left;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (original.scrollWidth) Object.defineProperty(Element.prototype, "scrollWidth", original.scrollWidth);
  if (original.clientWidth) Object.defineProperty(Element.prototype, "clientWidth", original.clientWidth);
  Element.prototype.getBoundingClientRect = original.rect;
  delete (/** @type {any} */ (Element.prototype)).scrollBy;
  delete (/** @type {any} */ (Element.prototype)).scrollTo;
});

/** Um evento de ponteiro com os campos que o jsdom não preenche (PointerEvent). */
function pointer(/** @type {"pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel" | "pointerLeave"} */ type, /** @type {Element} */ target, init = {}) {
  const event = createEvent[type](target, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ button: 0, pointerType: "mouse", pointerId: 1, clientX: 0, ...init })) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  fireEvent(target, event);
  return event;
}

/** O ciclo do React depois de uma rolagem simulada. */
function scrolled(/** @type {number} */ to) {
  const node = list();
  node.scrollLeft = to;
  fireEvent.scroll(node);
}

const afterFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

describe("o HTML do servidor: os links já estão lá", () => {
  const html = renderToString(<NavbarCollections items={ITEMS} />);

  it("os links, na ordem, com aria-current no corrente, dentro de <nav aria-label=Coleções><ul><li><a>", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nav = doc.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Coleções");
    const links = [...doc.querySelectorAll("nav ul li > a")];
    expect(links.map((a) => a.textContent)).toEqual(ITEMS.map((item) => item.label));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(ITEMS.map((item) => item.href));
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("não são abas: sem role=tab nem tablist", () => {
    expect(html).not.toContain('role="tab');
    expect(html).not.toContain("tablist");
  });

  it("as duas setas já ocupam o lugar, desativadas e só de sm em diante (sem salto de layout)", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const arrows = [...doc.querySelectorAll("nav button")];
    expect(arrows.map((b) => b.getAttribute("aria-label"))).toEqual([LEFT.name, RIGHT.name]);
    for (const arrow of arrows) {
      expect(arrow.hasAttribute("disabled")).toBe(true);
      expect(arrow.getAttribute("type")).toBe("button");
      expect(arrow.classList.contains("hidden")).toBe(true);
      expect(arrow.classList.contains("sm:flex")).toBe(true);
      expect(arrow.classList.contains("size-9")).toBe(false);
      for (const name of ["h-7", "w-9", "rounded-full", "mx-2", "self-center"]) expect(arrow.classList.contains(name), name).toBe(true);
    }
  });

  it("as setas são translúcidas, derivadas do on-secondary (nada de par de cores novo), e pressionadas enchem com a primária", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const arrow of doc.querySelectorAll("nav button")) {
      const names = [...arrow.classList];
      expect(names).toEqual(expect.arrayContaining(["border", "border-on-secondary/30", "bg-on-secondary/10", "text-on-secondary"]));
      expect(names).toEqual(expect.arrayContaining(["enabled:hover:bg-on-secondary/20", "enabled:hover:border-on-secondary/50", "enabled:active:bg-primary", "enabled:active:text-on-primary"]));
      expect(names).toEqual(expect.arrayContaining(["disabled:opacity-40", "disabled:pointer-events-none"]));
      // O foco: contorno de 2 px em on-secondary, FORA da pílula.
      expect(names).toEqual(expect.arrayContaining(["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-on-secondary"]));
      expect(names.join(" ")).not.toMatch(/text-white|#[0-9a-f]{3,8}|\[#/i);
    }
  });
});

describe("uma só linha, de altura fixa (item 1)", () => {
  it("a faixa é flex-nowrap, rolável, sem barra visível e sem flex-wrap; os itens, shrink-0", () => {
    render(<NavbarCollections items={ITEMS} />);
    const ul = classesOf(list());
    expect(ul).toEqual(expect.arrayContaining(["flex", "flex-nowrap", "overflow-x-auto", "vitrine-sem-barra"]));
    expect(ul).not.toContain("flex-wrap");
    // A rolagem do JavaScript escolhe o comportamento (o movimento reduzido); o CSS não força a suave.
    expect(ul).not.toContain("scroll-smooth");
    for (const li of screen.getAllByRole("listitem")) expect(classesOf(li)).toContain("shrink-0");
  });

  it("a estética da referência: a faixa e o <nav> SEM gap, SEM padding e SEM folga em volta; os itens se encostam", () => {
    const { container } = render(<NavbarCollections items={ITEMS} />);
    const ul = classesOf(list());
    expect(ul.filter((name) => /^(gap|p|px|py|pt|pb|pl|pr|space)-/.test(name))).toEqual([]);
    expect(ul).toEqual(expect.arrayContaining(["items-stretch", "flex-1", "min-w-0"]));
    const nav = /** @type {HTMLElement} */ (container.querySelector("nav"));
    expect(nav.className).toBe("");
    expect(nav.firstElementChild?.className).toBe("flex items-stretch");
    expect(container.querySelector("[data-fade]")).toBeNull();
  });

  it("cada item: da referência (flex min-w-32 px-5 py-2 text-sm font-semibold), CANTOS RETOS, sem borda e sem anel; o título longo trunca e vai inteiro no title", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const item of ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      const names = classesOf(link);
      expect(names).toEqual(expect.arrayContaining(["flex", "min-w-32", "flex-1", "items-center", "justify-center", "px-5", "py-2", "text-sm", "font-semibold"]));
      expect(names.filter((name) => /(^|:)(rounded|border|ring|gap|shadow(?!-none))/.test(name)), item.label).toEqual([]);
      expect(link.getAttribute("title")).toBe(item.label);
      expect(classesOf(/** @type {HTMLElement} */ (link.firstElementChild))).toContain("truncate");
      const li = /** @type {HTMLElement} */ (link.parentElement);
      expect(classesOf(li)).toEqual(expect.arrayContaining(["flex", "max-w-64", "shrink-0"]));
    }
  });

  it("os estados (repouso, ativo, hover, foco) têm o mesmo tamanho e a mesma forma: só a cor e o sublinhado do ativo mudam", () => {
    render(<NavbarCollections items={ITEMS} />);
    const shape = (/** @type {string} */ label) =>
      classesOf(screen.getByRole("link", { name: label })).filter((name) => /^(flex|min-w|items|justify|px-|py-|text-sm|font-|transition)/.test(name)).sort();
    expect(shape("Cálculo")).toEqual(shape("Álgebra Linear e Geometria Analítica"));
  });

  it("sem coleções, a Navbar não monta a barra", () => {
    render(<Navbar name="X" homeHref="/x" adminLink={false} />);
    expect(screen.queryByRole("navigation", { name: "Coleções" })).toBeNull();
    expect(screen.queryByRole("button", { name: LEFT.name })).toBeNull();
  });

  it("a linha da marca da Navbar: py-1 (rodada 2); o flex-wrap, o mr-auto e o min-w-0 dela ficam", () => {
    render(<Navbar name="Espaço" homeHref="/maria" items={ITEMS} adminLink={false} />);
    const row = /** @type {HTMLElement} */ (screen.getByRole("banner").firstElementChild);
    expect(row.className).toBe("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-1");
    expect(screen.getByRole("link", { name: "Espaço" }).className).toBe("mr-auto flex min-w-0 items-center gap-3 rounded-sm");
    // E a barra de coleções é o componente novo, depois dela.
    expect(row.nextElementSibling?.getAttribute("aria-label")).toBe("Coleções");
  });
});

describe("o realce pela cor primária do tema (item 3)", () => {
  const link = (/** @type {string} */ label) => screen.getByRole("link", { name: label });

  it("o ativo: aria-current, enchido com a primária, em negrito e com sublinhado grosso (não só a cor)", () => {
    render(<NavbarCollections items={ITEMS} />);
    const active = link("Álgebra Linear e Geometria Analítica");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(classesOf(active)).toEqual(expect.arrayContaining(["bg-primary", "text-on-primary", "font-semibold", "underline", "decoration-2", "underline-offset-4"]));
  });

  it("os demais: em repouso só o texto on-secondary; no hover E no foco por Tab enchem com a primária (o mesmo par de tokens do ativo)", () => {
    render(<NavbarCollections items={ITEMS} />);
    const idle = classesOf(link("Cálculo"));
    expect(idle).not.toContain("bg-primary");
    expect(idle).not.toContain("text-on-primary");
    expect(idle).toEqual(expect.arrayContaining(["text-on-secondary/70", "font-semibold", "hover:bg-primary", "hover:text-on-primary", "focus-visible:bg-primary", "focus-visible:text-on-primary"]));
  });

  it("o sublinhado é SÓ do ativo: nenhum outro item o tem, em repouso, hover ou foco; o ativo mantém o negrito", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const label of ["Cálculo", "Probabilidade"]) {
      expect(classesOf(link(label)).filter((name) => name.includes("underline")), label).toEqual([]);
    }
    const active = classesOf(link("Álgebra Linear e Geometria Analítica"));
    expect(active).toEqual(expect.arrayContaining(["underline", "decoration-2", "underline-offset-4", "font-semibold"]));
    expect(active.filter((name) => name.includes(":"))).not.toContain("hover:underline");
  });

  it("sem anel nem borda em nenhum estado (o Chefe aceita o primary ≈ secondary sem pista no hover)", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const item of ITEMS) {
      expect(classesOf(link(item.label)).filter((name) => /(^|:)(ring|border)/.test(name)), item.label).toEqual([]);
    }
  });

  it("o foco por teclado: o mesmo enchimento e um contorno INTERNO de 2 px em on-primary, sem a sombra externa do foco global", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const item of ITEMS) {
      expect(classesOf(link(item.label))).toEqual(
        expect.arrayContaining(["focus-visible:bg-primary", "focus-visible:text-on-primary", "focus-visible:outline-2", "focus-visible:-outline-offset-2", "focus-visible:outline-on-primary", "focus-visible:shadow-none"]),
      );
    }
  });

  it("só tokens do tema: nada de text-white, de cor fixa nem de valor arbitrário de cor", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const item of ITEMS) {
      const names = classesOf(screen.getByRole("link", { name: item.label })).join(" ");
      expect(names).not.toMatch(/text-white|bg-white|#[0-9a-f]{3,8}|\[#|rgb\(/i);
    }
  });

  it("a transição acaba com o movimento reduzido (motion-reduce:transition-none)", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(classesOf(link("Cálculo"))).toEqual(expect.arrayContaining(["transition-colors", "motion-reduce:transition-none"]));
  });
});

describe("as setas (estado simulado)", () => {
  it("sem overflow, as duas ficam desativadas", () => {
    metrics.scrollWidth = 300;
    render(<NavbarCollections items={ITEMS} />);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", LEFT)).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", RIGHT)).disabled).toBe(true);
  });

  it("com overflow: no início só a da direita; no meio as duas; no fim só a da esquerda", () => {
    render(<NavbarCollections items={ITEMS} />);
    const left = () => /** @type {HTMLButtonElement} */ (screen.getByRole("button", LEFT));
    const right = () => /** @type {HTMLButtonElement} */ (screen.getByRole("button", RIGHT));
    // A centralização inicial já moveu a faixa (o ativo está no meio): volta ao começo.
    act(() => scrolled(0));
    expect([left().disabled, right().disabled]).toEqual([true, false]);
    act(() => scrolled(350));
    expect([left().disabled, right().disabled]).toEqual([false, false]);
    act(() => scrolled(700));
    expect([left().disabled, right().disabled]).toEqual([false, true]);
  });

  it("sem esmaecimento sobre os itens encostados: a pista é a das setas (e, abaixo de sm, o item cortado)", () => {
    const { container } = render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(0));
    expect(container.querySelector("[data-fade]")).toBeNull();
    expect(container.innerHTML).not.toContain("from-secondary");
  });

  it("o clique rola um passo (60% da largura visível), suave; para a esquerda, negativo", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(350));
    fireEvent.click(screen.getByRole("button", RIGHT));
    expect(Element.prototype.scrollBy).toHaveBeenLastCalledWith({ left: 180, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", LEFT));
    expect(Element.prototype.scrollBy).toHaveBeenLastCalledWith({ left: -180, behavior: "smooth" });
  });

  it("com o movimento reduzido a rolagem NÃO é suave (behavior auto)", () => {
    vi.stubGlobal("matchMedia", (/** @type {string} */ query) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }));
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(350));
    fireEvent.click(screen.getByRole("button", RIGHT));
    expect(Element.prototype.scrollBy).toHaveBeenLastCalledWith({ left: 180, behavior: "auto" });
  });

  it("mouse pressionado: um passo e a repetição a cada HOLD_INTERVAL até soltar; o clique que segue não rola de novo", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(0));
    const right = screen.getByRole("button", RIGHT);
    const before = vi.mocked(Element.prototype.scrollBy).mock.calls.length;
    pointer("pointerDown", right);
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before + 1);
    vi.advanceTimersByTime(HOLD_INTERVAL * 2);
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before + 3);
    pointer("pointerUp", right);
    // O clique do mouse vem logo depois do soltar: é ignorado (o passo já foi dado).
    fireEvent.click(right);
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before + 3);
    vi.advanceTimersByTime(HOLD_INTERVAL * 3);
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before + 3);
  });

  it("a repetição para sozinha ao chegar na ponta", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(690));
    const right = screen.getByRole("button", RIGHT);
    pointer("pointerDown", right);
    const calls = vi.mocked(Element.prototype.scrollBy).mock.calls.length;
    vi.advanceTimersByTime(HOLD_INTERVAL * 5);
    // O primeiro passo levou ao fim (700); as repetições não rolam mais e o intervalo é LIMPO (nada fica rodando).
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("o toque e o teclado passam pelo clique (o pressionar só vale para mouse e caneta)", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(350));
    const right = screen.getByRole("button", RIGHT);
    const before = vi.mocked(Element.prototype.scrollBy).mock.calls.length;
    pointer("pointerDown", right, { pointerType: "touch" });
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before);
    fireEvent.click(right);
    expect(vi.mocked(Element.prototype.scrollBy).mock.calls.length).toBe(before + 1);
  });
});

describe("o foco não se perde numa seta que fica desativada (teclado)", () => {
  it("a seta da direita com o foco chega na ponta e fica disabled: o foco vai para o ÚLTIMO link", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(0));
    const right = screen.getByRole("button", RIGHT);
    act(() => right.focus());
    expect(document.activeElement).toBe(right);
    act(() => scrolled(700));
    expect(/** @type {HTMLButtonElement} */ (right).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Probabilidade" }));
  });

  it("a seta da esquerda, no início: o foco vai para o PRIMEIRO link", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(350));
    const left = screen.getByRole("button", LEFT);
    act(() => left.focus());
    act(() => scrolled(0));
    expect(/** @type {HTMLButtonElement} */ (left).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Cálculo" }));
  });

  it("uma seta que continua ativa mantém o foco, e quem já tirou o foco dela não o recebe de volta", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(350));
    const right = screen.getByRole("button", RIGHT);
    act(() => right.focus());
    act(() => scrolled(400));
    expect(document.activeElement).toBe(right);
    act(() => screen.getByRole("link", { name: "Cálculo" }).focus());
    act(() => scrolled(700));
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Cálculo" }));
  });
});

describe("arrastar com o ponteiro", () => {
  const link = () => screen.getByRole("link", { name: "Cálculo" });

  it("abaixo do limiar é um clique: o link navega (o clique não é cancelado)", () => {
    render(<NavbarCollections items={ITEMS} />);
    pointer("pointerDown", list(), { clientX: 100 });
    pointer("pointerMove", list(), { clientX: 100 + DRAG_THRESHOLD });
    pointer("pointerUp", list(), { clientX: 100 + DRAG_THRESHOLD });
    expect(fireEvent.click(link())).toBe(true);
  });

  it("acima do limiar rola a faixa na direção do arrasto e o clique que segue é CANCELADO", async () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(200));
    pointer("pointerDown", list(), { clientX: 100 });
    pointer("pointerMove", list(), { clientX: 100 - (DRAG_THRESHOLD + 1) });
    pointer("pointerMove", list(), { clientX: 40 });
    expect(list().scrollLeft).toBe(260);
    expect(list().dataset.dragging).toBe("true");
    pointer("pointerUp", list(), { clientX: 40 });
    expect(list().dataset.dragging).toBeUndefined();
    expect(fireEvent.click(link())).toBe(false);
    // Depois do quadro, a trava cai e o clique simples volta a navegar.
    await afterFrame();
    expect(fireEvent.click(link())).toBe(true);
  });

  it("o toque e o botão do meio não arrastam (o toque é do nativo)", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(200));
    pointer("pointerDown", list(), { clientX: 100, pointerType: "touch" });
    pointer("pointerMove", list(), { clientX: 10, pointerType: "touch" });
    expect(list().scrollLeft).toBe(200);
    pointer("pointerDown", list(), { clientX: 100, button: 1 });
    pointer("pointerMove", list(), { clientX: 10 });
    expect(list().scrollLeft).toBe(200);
  });

  it("a faixa não deixa o toque prender a página (touch-pan-x e pan-y) nem arrastar a imagem do link", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(classesOf(list())).toEqual(expect.arrayContaining(["touch-pan-x", "touch-pan-y", "select-none", "cursor-grab"]));
    expect(screen.getByRole("link", { name: "Cálculo" }).getAttribute("draggable")).toBe("false");
  });
});

describe("sem barra de rolagem visível (globals.css)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("a classe esconde a barra nos dois motores: scrollbar-width none e ::-webkit-scrollbar sem display", () => {
    const body = (/** @type {string} */ selector) => {
      const start = css.indexOf(`${selector} {`);
      return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
    };
    expect(body(".vitrine-sem-barra")).toContain("scrollbar-width: none");
    expect(body(".vitrine-sem-barra::-webkit-scrollbar")).toContain("display: none");
  });

  it("a faixa leva a classe", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(classesOf(list())).toContain("vitrine-sem-barra");
  });
});

describe("a roda do mouse", () => {
  /** Dispara a roda e diz se o evento foi cancelado (ou seja, se a faixa o consumiu). */
  function wheel(/** @type {WheelEventInit} */ init) {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
    list().dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("com o que rolar no sentido: converte em rolagem horizontal e consome o evento", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(300));
    expect(wheel({ deltaY: 100 })).toBe(true);
    expect(list().scrollLeft).toBe(400);
    expect(wheel({ deltaY: -150 })).toBe(true);
    expect(list().scrollLeft).toBe(250);
  });

  it("nas pontas o evento PASSA (a página rola): no início para cima, no fim para baixo", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(0));
    expect(wheel({ deltaY: -100 })).toBe(false);
    act(() => scrolled(700));
    expect(wheel({ deltaY: 100 })).toBe(false);
    // E no sentido que ainda tem o que rolar, converte.
    expect(wheel({ deltaY: -100 })).toBe(true);
  });

  it("sem overflow o evento passa sempre", () => {
    metrics.scrollWidth = 300;
    render(<NavbarCollections items={ITEMS} />);
    expect(wheel({ deltaY: 100 })).toBe(false);
    expect(wheel({ deltaY: -100 })).toBe(false);
  });

  it("o gesto horizontal do trackpad e o zoom (Ctrl) seguem o nativo", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(300));
    expect(wheel({ deltaX: 80, deltaY: 5 })).toBe(false);
    expect(wheel({ deltaY: 100, ctrlKey: true })).toBe(false);
    expect(wheel({ deltaY: 0, deltaX: 0 })).toBe(false);
  });
});

describe("o item ativo centralizado ao entrar", () => {
  it("a função: centraliza com medidas reais e prende entre 0 e o máximo (o primeiro e o último ficam na borda)", () => {
    const container = { left: 10, width: 300 };
    expect(centeredScrollLeft(container, { left: 510, width: 100 }, 0, 700)).toBe(400);
    expect(centeredScrollLeft(container, { left: 30, width: 100 }, 0, 700)).toBe(0);
    expect(centeredScrollLeft(container, { left: 1010, width: 100 }, 0, 700)).toBe(700);
    // Com a faixa já rolada, a posição do item soma a rolagem.
    expect(centeredScrollLeft(container, { left: 110, width: 100 }, 400, 700)).toBe(400);
    // Sem overflow, fica em 0.
    expect(centeredScrollLeft(container, { left: 50, width: 100 }, 0, 0)).toBe(0);
  });

  it("ao montar, rola (sem animação) para o ativo; a seta da esquerda já fica ativa", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ left: 400, behavior: "auto" });
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", LEFT)).disabled).toBe(false);
  });

  it("sem item ativo, não rola", () => {
    render(<NavbarCollections items={ITEMS.map((item) => ({ ...item, current: false }))} />);
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
  });

  it("ao trocar o corrente, rola de novo, suave (ou sem animação com o movimento reduzido)", () => {
    const { rerender } = render(<NavbarCollections items={ITEMS} />);
    rerender(<NavbarCollections items={ITEMS.map((item) => ({ ...item, current: item.id === "c" }))} />);
    expect(Element.prototype.scrollTo).toHaveBeenLastCalledWith({ left: expect.any(Number), behavior: "smooth" });
    vi.stubGlobal("matchMedia", (/** @type {string} */ query) => ({ matches: query.includes("prefers-reduced-motion"), media: query }));
    rerender(<NavbarCollections items={ITEMS} />);
    expect(Element.prototype.scrollTo).toHaveBeenLastCalledWith({ left: expect.any(Number), behavior: "auto" });
  });
});

describe("teclado e semântica", () => {
  it("todos os links ficam na ordem de Tab (sem tabindex negativo) e as setas desativadas saem dela", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("tabindex")).toBeNull();
    act(() => scrolled(0));
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", LEFT)).disabled).toBe(true);
  });

  it("a faixa não é uma região rolável sem foco: tem links focáveis, e não leva role nem tabindex próprios", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(list().getAttribute("role")).toBeNull();
    expect(list().getAttribute("tabindex")).toBeNull();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("a faixa não tem folga em volta (o contorno do foco é interno) e o CSS não usa scroll-padding (o Chromium escondia o último item)", () => {
    render(<NavbarCollections items={ITEMS} />);
    expect(classesOf(list()).filter((name) => /^p[xytblr]?-/.test(name))).toEqual([]);
    expect(classesOf(list()).filter((name) => name.startsWith("scroll-p"))).toEqual([]);
  });

  it("keepInViewScrollLeft: item à vista com folga não rola; escondido nas pontas rola o mínimo; preso entre 0 e o máximo", () => {
    const box = { left: 0, width: 300 };
    expect(keepInViewScrollLeft(box, { left: 100, width: 80 }, 50, 700)).toBe(50);
    // cortado à direita: rola até sobrar a folga
    expect(keepInViewScrollLeft(box, { left: 240, width: 100 }, 50, 700)).toBe(50 + (340 - (300 - FOCUS_MARGIN)));
    // cortado à esquerda
    expect(keepInViewScrollLeft(box, { left: -40, width: 100 }, 200, 700)).toBe(200 + (-40 - FOCUS_MARGIN));
    // a folga não passa do fim nem do começo
    expect(keepInViewScrollLeft(box, { left: 240, width: 100 }, 690, 700)).toBe(700);
    expect(keepInViewScrollLeft(box, { left: -10, width: 100 }, 5, 700)).toBe(0);
  });

  it("o foco por teclado num link cortado rola a faixa com folga (behavior auto); sem overflow, não faz nada", () => {
    rects.focused = { left: 270, width: 100 };
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(100));
    vi.mocked(Element.prototype.scrollTo).mockClear();
    const link = screen.getByRole("link", { name: "Cálculo" });
    link.matches = (/** @type {string} */ selector) => (selector === ":focus-visible" ? true : Element.prototype.matches.call(link, selector));
    link.getBoundingClientRect = () => /** @type {DOMRect} */ ({ ...rects.focused, right: 370, top: 0, bottom: 0, height: 0, x: 270, y: 0, toJSON: () => ({}) });
    fireEvent.focus(link);
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ left: 100 + (370 - (300 - FOCUS_MARGIN)), behavior: "auto" });
    vi.mocked(Element.prototype.scrollTo).mockClear();
    metrics.scrollWidth = 300;
    act(() => scrolled(0));
    fireEvent.focus(link);
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
  });

  it("o foco do mouse (sem :focus-visible) não mexe na faixa", () => {
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(100));
    vi.mocked(Element.prototype.scrollTo).mockClear();
    const link = screen.getByRole("link", { name: "Cálculo" });
    link.matches = (/** @type {string} */ selector) => (selector === ":focus-visible" ? false : Element.prototype.matches.call(link, selector));
    link.getBoundingClientRect = () => /** @type {DOMRect} */ ({ left: 270, right: 370, width: 100, top: 0, bottom: 0, height: 0, x: 270, y: 0, toJSON: () => ({}) });
    fireEvent.focus(link);
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
  });

  it("as setas não estão dentro de um link (nada interativo aninhado)", () => {
    render(<NavbarCollections items={ITEMS} />);
    for (const arrow of screen.getAllByRole("button", { hidden: true })) expect(arrow.closest("a")).toBeNull();
  });
});

describe("sem ResizeObserver e na amostra da aparência", () => {
  it("sem ResizeObserver (jsdom), acompanha o redimensionamento da janela", () => {
    expect(typeof ResizeObserver).toBe("undefined");
    render(<NavbarCollections items={ITEMS} />);
    act(() => scrolled(0));
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", RIGHT)).disabled).toBe(false);
    metrics.scrollWidth = 300;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", RIGHT)).disabled).toBe(true);
  });

  it("com ResizeObserver, observa só a faixa e solta tudo ao desmontar", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect = disconnect; });
    const { unmount } = render(<NavbarCollections items={ITEMS} />);
    // Só a faixa: observar cada item custaria na hidratação e não traz nada (o item não muda sem a faixa mudar).
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("a pré-visualização da aparência (PalettePreview) não quebra: a barra de coleções está dentro do inert, com as setas desativadas", () => {
    metrics.scrollWidth = 300; // a amostra cabe: sem overflow
    render(<PalettePreview mode="light" id="a" name="X" themeStyle={{ "--vitrine-light-primary": "#2563eb" }} />);
    const group = screen.getByRole("group", { name: "Pré-visualização do modo claro" });
    const nav = /** @type {HTMLElement} */ (group.querySelector("nav[aria-label='Coleções']"));
    expect(nav.closest("[inert]")).not.toBeNull();
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Coleção A", "Coleção B"]);
    expect([...nav.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    expect(nav.querySelector("a[aria-current='page']")?.textContent).toBe("Coleção A");
  });

  it("a pré-visualização mantém os mesmos NAV_ITEMS (Coleção A corrente e Coleção B)", () => {
    render(<PalettePreview mode="dark" id="b" name="X" themeStyle={{}} />);
    expect(screen.getByRole("link", { name: "Coleção B" }).getAttribute("aria-current")).toBeNull();
  });
});
