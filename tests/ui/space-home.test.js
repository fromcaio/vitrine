// @vitest-environment jsdom
// Início do espaço público (RF29, D-16; CT43, parte da UI): o nome, a descrição, os itens da raiz e o
// estado "ainda sem conteúdo publicado". Componente de apresentação, só com tokens de tema.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpaceHome } from "@/components/layout/SpaceHome";

afterEach(cleanup);

const ITEMS = [
  { id: "c1", title: "Algoritmos e Estruturas de Dados", href: "/maria/algoritmos", kind: /** @type {const} */ ("COLLECTION") },
  { id: "d1", title: "Sobre mim", href: "/maria/sobre-mim", kind: /** @type {const} */ ("DOCUMENT") },
];

describe("SpaceHome", () => {
  it("mostra o nome como h1 e a descrição", () => {
    render(<SpaceHome name="Espaço da Maria" description="Notas de aula e projetos." items={ITEMS} />);
    expect(screen.getByRole("heading", { level: 1, name: "Espaço da Maria" })).toBeTruthy();
    expect(screen.getByText("Notas de aula e projetos.")).toBeTruthy();
  });

  it("sem descrição, ou só com espaços, não mostra o parágrafo", () => {
    const { container, rerender } = render(<SpaceHome name="X" items={ITEMS} />);
    const paragraphs = () => [...container.querySelectorAll("section > div > p")];
    expect(paragraphs()).toHaveLength(0);
    rerender(<SpaceHome name="X" description="   " items={ITEMS} />);
    expect(paragraphs()).toHaveLength(0);
    rerender(<SpaceHome name="X" description={null} items={ITEMS} />);
    expect(paragraphs()).toHaveLength(0);
  });

  it("um cartão por item, na ordem recebida, com o link e o tipo (coleção ou documento)", () => {
    render(<SpaceHome name="X" items={ITEMS} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0]).getByRole("link");
    expect(first.getAttribute("href")).toBe("/maria/algoritmos");
    expect(first.textContent).toContain("Algoritmos e Estruturas de Dados");
    expect(first.textContent).toContain("Coleção");
    const second = within(items[1]).getByRole("link");
    expect(second.getAttribute("href")).toBe("/maria/sobre-mim");
    expect(second.textContent).toContain("Documento");
  });

  it("sem itens, mostra 'Este espaço ainda não tem conteúdo publicado.' e nenhuma lista", () => {
    render(<SpaceHome name="X" items={[]} />);
    expect(screen.getByText("Este espaço ainda não tem conteúdo publicado.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("itens sem título ou sem endereço são ignorados; se não sobra nenhum, vale o estado vazio", () => {
    const { rerender } = render(
      <SpaceHome
        name="X"
        items={[
          ...ITEMS,
          { id: "x1", title: "   ", href: "/maria/vazio", kind: "DOCUMENT" },
          { id: "x2", title: "Sem endereço", href: "", kind: "DOCUMENT" },
          /** @type {any} */ ({ id: "x3", href: "/maria/sem-titulo", kind: "DOCUMENT" }),
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Sem endereço")).toBeNull();
    rerender(<SpaceHome name="X" items={[{ id: "x1", title: "", href: "/a", kind: "DOCUMENT" }]} />);
    expect(screen.getByText("Este espaço ainda não tem conteúdo publicado.")).toBeTruthy();
  });

  it("um tipo desconhecido vira 'Conteúdo'", () => {
    render(<SpaceHome name="X" items={[{ id: "z", title: "Algo", href: "/maria/algo", kind: /** @type {any} */ ("OUTRO") }]} />);
    expect(screen.getByRole("link").textContent).toContain("Conteúdo");
  });

  it("o título é texto, nunca HTML, e quebra de linha em vez de estourar", () => {
    const hostile = '<img src=x onerror="window.__xss=1">';
    const { container } = render(<SpaceHome name={hostile} description={hostile} items={[{ id: "h", title: hostile, href: "/maria/h", kind: "DOCUMENT" }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(hostile);
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/break-words/);
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<SpaceHome name="X" description="d" items={ITEMS} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(slate|gray|zinc|neutral|red|blue)-\d/);
  });
});
