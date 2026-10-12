// @vitest-environment jsdom
// A pré-visualização da aparência (RF18, RF19, RF24, RF29; P-030): o cabeçalho, a sidebar da coleção EXPANDIDA
// (cerca de 80% da largura), a faixa vazia do fundo do conteúdo (cerca de 20%) e o rodapé com ícones de exemplo,
// tudo dentro de um `inert`; sem conteúdo de exemplo (o bloco de título, parágrafo e botão saiu). A sidebar da
// amostra é a REAL (`Sidebar` com `preview`): os estilos vêm da mesma fonte.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, prefetch: _prefetch, ...rest }) => createElement("a", { href, ...rest }, children) };
});

import { PalettePreview } from "@/components/admin/PalettePreview";
import { Sidebar } from "@/components/layout/Sidebar";

afterEach(cleanup);

const STYLE = {
  "--vitrine-light-primary": "#1d4ed8",
  "--vitrine-light-secondary": "#0f172a",
  "--vitrine-light-accent": "#fbbf24",
  "--vitrine-dark-primary": "#60a5fa",
  "--vitrine-dark-secondary": "#e2e8f0",
  "--vitrine-dark-accent": "#fbbf24",
};

/** @param {"light" | "dark"} mode */
const renderPreview = (mode, id = "p") => render(<PalettePreview mode={mode} id={id} name="Meu espaço" themeStyle={STYLE} />);
const group = (/** @type {"claro" | "noturno"} */ mode) => screen.getByRole("group", { name: `Pré-visualização do modo ${mode}` });
const classesOf = (/** @type {Element} */ node) => [...node.classList];

describe("PalettePreview: o que a amostra mostra", () => {
  for (const [mode, label] of /** @type {const} */ ([["light", "claro"], ["dark", "noturno"]])) {
    it(`modo ${label}: cabeçalho, sidebar expandida, faixa do fundo e rodapé, dentro de um inert`, () => {
      renderPreview(mode);
      const root = group(label);
      const inert = /** @type {HTMLElement} */ (root.querySelector("[inert]"));
      expect(inert).toBeTruthy();
      expect(inert.contains(root.querySelector("header"))).toBe(true);
      expect(inert.contains(root.querySelector("footer"))).toBe(true);
      expect(root.querySelector("header")).toBeTruthy();
      expect(within(root).getByRole("navigation", { name: "Coleção Cálculo I" })).toBeTruthy();
      expect(within(root).getByRole("contentinfo")).toBeTruthy();
      expect(root.querySelector("main")).toBeTruthy();
    });
  }

  it("a sidebar está EXPANDIDA: o pai aberto mostra três filhos e o outro pai fica fechado", () => {
    renderPreview("light");
    const root = group("claro");
    expect(within(root).getByRole("button", { name: "Subitens de Limites" }).getAttribute("aria-expanded")).toBe("true");
    for (const title of ["Definição de limite", "Propriedades dos limites", "Continuidade"]) expect(within(root).getByRole("link", { name: title })).toBeTruthy();
    expect(within(root).getByRole("button", { name: "Subitens de Derivadas" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(root).getByText("Cálculo I", { selector: "p" })).toBeTruthy(); // o título da coleção
  });

  it("o item ativo tem aria-current e o estilo do Sidebar real; o ancestral vai em negrito; os demais em repouso", () => {
    renderPreview("light");
    const root = group("claro");
    const active = within(root).getByRole("link", { name: "Propriedades dos limites" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(classesOf(active)).toEqual(expect.arrayContaining(["bg-primary", "text-on-primary", "border-accent"]));
    expect(within(within(root).getByRole("navigation", { name: "Coleção Cálculo I" })).getAllByRole("link").filter((a) => a.hasAttribute("aria-current"))).toHaveLength(1);
    expect(classesOf(within(root).getByRole("link", { name: "Limites" }))).toContain("font-semibold");
    const idle = within(root).getByRole("link", { name: "Continuidade" });
    expect(classesOf(idle)).toContain("border-transparent");
    expect(classesOf(idle)).not.toContain("font-semibold");
  });

  it("a sidebar da amostra e a real vêm do MESMO componente: as classes do ativo, do ancestral e do repouso são iguais", () => {
    renderPreview("light");
    const root = group("claro");
    const real = render(
      <Sidebar
        basePath="/maria"
        activePath={["calculo", "limites", "propriedades"]}
        collection={/** @type {any} */ ({
          id: "c", slug: "calculo", title: "Cálculo I", type: "COLLECTION", children: [
            { id: "l", slug: "limites", title: "Limites", type: "COLLECTION", children: [
              { id: "d", slug: "definicao", title: "Definição de limite", type: "DOCUMENT", children: [] },
              { id: "p", slug: "propriedades", title: "Propriedades dos limites", type: "DOCUMENT", children: [] },
              { id: "n", slug: "continuidade", title: "Continuidade", type: "DOCUMENT", children: [] },
            ] },
          ],
        })}
      />,
    );
    const realRoot = real.container;
    for (const title of ["Propriedades dos limites", "Limites", "Continuidade"]) {
      expect(within(root).getByRole("link", { name: title }).className).toBe(within(realRoot).getByRole("link", { name: title }).className);
    }
    const realNav = within(realRoot).getByRole("navigation", { hidden: true });
    expect(realNav).toBeTruthy();
    // a moldura: o mesmo fundo e a mesma borda
    const frame = /** @type {HTMLElement} */ (within(root).getByRole("navigation", { name: "Coleção Cálculo I" }).parentElement);
    const realFrame = /** @type {HTMLElement} */ (realNav.parentElement);
    for (const token of ["bg-surface", "border-border"]) {
      expect(classesOf(frame)).toContain(token);
      expect(classesOf(realFrame)).toContain(token);
    }
  });

  it("não há botão do celular, sticky nem largura fixa da sidebar real na amostra", () => {
    renderPreview("light");
    const root = group("claro");
    expect(within(root).queryByRole("button", { name: /^Menu/ })).toBeNull();
    const nav = within(root).getByRole("navigation", { name: "Coleção Cálculo I" });
    expect(nav.className).not.toMatch(/sticky|hidden|md:/);
    expect(/** @type {HTMLElement} */ (nav.parentElement).className).not.toMatch(/md:w-72|md:shrink-0/);
  });

  it("a sidebar ocupa 4/5 e, à direita e do lado dela, a faixa de 1/5 é VAZIA e só mostra o fundo do conteúdo", () => {
    renderPreview("light");
    const root = group("claro");
    const frame = /** @type {HTMLElement} */ (within(root).getByRole("navigation", { name: "Coleção Cálculo I" }).parentElement);
    const strip = /** @type {HTMLElement} */ (root.querySelector("main"));
    expect(classesOf(frame)).toContain("w-4/5");
    expect(classesOf(strip)).toContain("w-1/5");
    // lado a lado, em qualquer largura (flex-row, sem empilhar), irmãos no mesmo corpo
    expect(frame.parentElement).toBe(strip.parentElement);
    expect(classesOf(/** @type {HTMLElement} */ (strip.parentElement))).toEqual(expect.arrayContaining(["flex", "flex-row"]));
    expect(strip.parentElement?.className).not.toMatch(/flex-col|md:flex-row/);
    // vazia: sem texto, sem elementos; o fundo é o do conteúdo (bg-background do envoltório), sem fundo próprio
    expect(strip.textContent).toBe("");
    expect(strip.children).toHaveLength(0);
    expect(strip.className).not.toMatch(/\bbg-|\bp-\d|\bsm:p|\bmd:p/);
    const theme = /** @type {HTMLElement} */ (root.querySelector(".vitrine-tema"));
    expect(classesOf(theme)).toContain("bg-background");
    expect(theme.contains(strip)).toBe(true);
  });

  it("o bloco de conteúdo de exemplo saiu: nem título, nem parágrafo, nem botão, nem ponto de destaque", () => {
    renderPreview("light");
    const root = group("claro");
    expect(within(root).queryByText("Título de um documento")).toBeNull();
    expect(within(root).queryByText(/Um parágrafo de exemplo/)).toBeNull();
    expect(within(root).queryByRole("button", { name: "Ação principal" })).toBeNull();
    expect(within(root).queryByText("Destaque")).toBeNull();
    expect(root.querySelector("main h3, main p, main button")).toBeNull();
  });

  it("o rodapé é o real, com a cor do cabeçalho e quatro ícones de exemplo", () => {
    renderPreview("dark");
    const root = group("noturno");
    const footer = within(root).getByRole("contentinfo");
    expect(classesOf(footer)).toEqual(expect.arrayContaining(["bg-secondary", "text-on-secondary"]));
    expect(footer.textContent).toContain("© 2026 Meu espaço. Todos os direitos reservados.");
    expect([...footer.querySelectorAll("a")].map((a) => a.getAttribute("aria-label"))).toEqual(["GitHub", "LinkedIn", "YouTube", "E-mail"]);
    expect(classesOf(/** @type {Element} */ (root.querySelector("header")))).toContain("bg-secondary");
  });

  it("as duas amostras não repetem ids nem marcos da página que importam (dentro do inert)", () => {
    render(
      <>
        <PalettePreview mode="light" id="a" name="X" themeStyle={STYLE} />
        <PalettePreview mode="dark" id="b" name="X" themeStyle={STYLE} />
      </>,
    );
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const root of [group("claro"), group("noturno")]) expect(root.querySelector("[inert]")).toBeTruthy();
  });

  it("nada da amostra entra na ordem de tabulação fora do inert: tudo está dentro do elemento inert", () => {
    renderPreview("light");
    const root = group("claro");
    const inert = /** @type {HTMLElement} */ (root.querySelector("[inert]"));
    for (const focusable of root.querySelectorAll("a[href], button")) expect(inert.contains(focusable)).toBe(true);
  });
});
