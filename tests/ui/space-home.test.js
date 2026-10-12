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

// ---------------------------------------------------------------------------------------------------------------------
// P-032 (M26; RF42, RN35, RN36): o texto da página inicial, a descrição como alternativa, a lista com `showItems`.
// O MarkdownRenderer de verdade renderiza o texto.
describe("SpaceHome: o texto da página inicial (RN35, RN36)", () => {
  const BODY = "# Bem-vindo\n\nTexto **da** página.\n\n## Seção\n\n###### Fundo";
  const h = (/** @type {number} */ level) => screen.queryAllByRole("heading", { level });
  const EMPTY = "Este espaço ainda não tem conteúdo publicado.";

  it("a ordem: o nome (h1), o texto e depois a lista", () => {
    const { container } = render(<SpaceHome name="Espaço da Maria" body={"Olá, **mundo**."} items={ITEMS} />);
    const section = /** @type {HTMLElement} */ (container.querySelector("section"));
    const name = screen.getByRole("heading", { level: 1, name: "Espaço da Maria" });
    const text = /** @type {HTMLElement} */ (section.querySelector(".vitrine-markdown"));
    const list = screen.getByRole("list");
    expect(text.textContent).toBe("Olá, mundo.");
    expect(name.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("com texto, a descrição NÃO aparece (a descrição só vale na falta do texto)", () => {
    render(<SpaceHome name="X" description="Notas de aula e projetos." body="Texto da página." items={ITEMS} />);
    expect(screen.getByText("Texto da página.")).toBeTruthy();
    expect(screen.queryByText("Notas de aula e projetos.")).toBeNull();
  });

  it("sem texto (nulo, vazio ou só espaços), a descrição aparece no lugar", () => {
    for (const body of [null, undefined, "", "  \n "]) {
      const { unmount } = render(<SpaceHome name="X" description="Notas de aula." body={body} items={ITEMS} />);
      expect(screen.getByText("Notas de aula.")).toBeTruthy();
      expect(document.querySelector(".vitrine-markdown")).toBeNull();
      unmount();
    }
  });

  it("os títulos do texto começam em h2: # vira h2, ## vira h3 e ###### fica h6; o único h1 é o nome", () => {
    render(<SpaceHome name="Espaço" body={BODY} items={[]} />);
    expect(h(1).map((node) => node.textContent)).toEqual(["Espaço"]);
    expect(h(2).map((node) => node.textContent)).toEqual(["Bem-vindo"]);
    expect(h(3).map((node) => node.textContent)).toEqual(["Seção"]);
    expect(h(6).map((node) => node.textContent)).toEqual(["Fundo"]);
  });

  it("showItems falso: a lista não aparece, mesmo com itens (padrão: aparece)", () => {
    const { unmount } = render(<SpaceHome name="X" body="Texto." items={ITEMS} showItems={false} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    unmount();
    render(<SpaceHome name="X" body="Texto." items={ITEMS} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("a mensagem de página vazia só quando NÃO há nada: sem texto, sem descrição e sem lista (desligada ou vazia)", () => {
    const empty = (/** @type {Partial<import("react").ComponentProps<typeof SpaceHome>>} */ props) => {
      const { unmount } = render(<SpaceHome name="X" items={[]} {...props} />);
      const found = screen.queryByText(EMPTY) !== null;
      unmount();
      return found;
    };
    expect(empty({})).toBe(true);
    expect(empty({ showItems: false })).toBe(true);
    expect(empty({ items: ITEMS, showItems: false })).toBe(true); // a lista desligada, nada mais
    expect(empty({ description: "  " })).toBe(true);
    // com algo para mostrar, a mensagem some
    expect(empty({ body: "Texto." })).toBe(false);
    expect(empty({ description: "Resumo." })).toBe(false);
    expect(empty({ items: ITEMS })).toBe(false);
    expect(empty({ body: "Texto.", showItems: false })).toBe(false);
  });

  it("com texto e lista vazia, a mensagem de vazio não aparece", () => {
    render(<SpaceHome name="X" body="Texto." items={[]} />);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("o texto é Markdown seguro: HTML escrito vira texto, não elemento", () => {
    const { container } = render(<SpaceHome name="X" body={'<img src=x onerror="window.__xss=1"> e <script>1</script>'} items={[]} />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });
});
