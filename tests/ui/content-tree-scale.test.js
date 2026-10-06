// @vitest-environment jsdom
// Árvore do conteúdo em escala (RN25: até 500 conteúdos): a árvore grande abre só até o primeiro nível,
// uma ação renderiza só as linhas que mudaram (memoização), e os endereços podem ser modelos de texto
// (uma página de Servidor não passa funções a um Componente Cliente).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Conta quantas vezes cada link é desenhado: um link por documento, dentro da linha memoizada.
const linkRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => {
    linkRenders.count += 1;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

import { ContentTree } from "@/components/admin/ContentTree";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  linkRenders.count = 0;
});

/** @param {string} id @param {string} title @param {"DOCUMENT" | "COLLECTION"} type @param {any[]} [children] @param {string | null} [parentId] @param {number} [order] */
const node = (id, title, type, children = [], parentId = null, order = 0) => ({ id, title, slug: id, type, status: "PUBLISHED", parentId, order, children });

/** Uma coleção na raiz com `docs` documentos e uma subcoleção com um documento dentro. */
function bigTree(docs = 130) {
  const inner = node("interna", "Interna", "COLLECTION", [node("neto", "Neto", "DOCUMENT", [], "interna", 0)], "raiz", docs);
  const children = Array.from({ length: docs }, (_, i) => node(`d${i}`, `Documento ${i}`, "DOCUMENT", [], "raiz", i));
  return [node("raiz", "Raiz", "COLLECTION", [...children, inner])];
}

const ids = () => [...document.querySelectorAll("li[data-node-id]")].map((el) => el.getAttribute("data-node-id"));
const href = (/** @type {string} */ name) => screen.getByRole("link", { name }).getAttribute("href");

describe("árvore grande", () => {
  it("com mais de 120 nós, abre só o primeiro nível: as coleções internas começam recolhidas", () => {
    render(<ContentTree initialTree={bigTree()} editHref="/e/{id}" newHref="/n" />);
    expect(ids()).toContain("raiz");
    expect(ids()).toContain("interna");
    expect(ids()).not.toContain("neto");
    expect(screen.getByRole("button", { name: "Subitens de Interna" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("'Expandir tudo' mostra o resto e 'Recolher tudo' volta", () => {
    render(<ContentTree initialTree={bigTree()} editHref="/e/{id}" newHref="/n" />);
    fireEvent.click(screen.getByRole("button", { name: "Expandir tudo" }));
    expect(ids()).toContain("neto");
    fireEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(ids()).not.toContain("neto");
    expect(ids()).toContain("raiz");
  });

  it("uma coleção interna se abre sozinha, pelo botão dela", () => {
    render(<ContentTree initialTree={bigTree()} editHref="/e/{id}" newHref="/n" />);
    fireEvent.click(screen.getByRole("button", { name: "Subitens de Interna" }));
    expect(ids()).toContain("neto");
  });

  it("uma árvore pequena abre inteira", () => {
    render(<ContentTree initialTree={bigTree(10)} editHref="/e/{id}" newHref="/n" />);
    expect(ids()).toContain("neto");
  });
});

describe("memoização das linhas", () => {
  it("abrir ou fechar uma coleção desenha só as linhas que mudaram, e não a árvore toda", () => {
    render(<ContentTree initialTree={bigTree(40)} editHref="/e/{id}" newHref="/n" />);
    const initial = linkRenders.count;
    expect(initial).toBeGreaterThanOrEqual(41); // 40 documentos da raiz + o neto
    linkRenders.count = 0;
    fireEvent.click(screen.getByRole("button", { name: "Subitens de Interna" }));
    fireEvent.click(screen.getByRole("button", { name: "Subitens de Interna" }));
    expect(linkRenders.count).toBeLessThan(10); // sem memoização seriam 80 ou mais
  });

  it("publicar um documento redesenha só a linha dele", async () => {
    const tree = bigTree(40);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    render(<ContentTree initialTree={tree} editHref="/e/{id}" newHref="/n" />);
    linkRenders.count = 0;
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho: Documento 5" }));
    await screen.findByText(/Documento 5 passou para rascunho/);
    await waitFor(() => expect(screen.getByRole("link", { name: "Documento 5" })).toBeTruthy());
    expect(linkRenders.count).toBeLessThan(6); // só a linha alterada (uma ou duas vezes), não as 41
  });

  it("subir um irmão redesenha só os dois que trocaram de lugar", async () => {
    const tree = bigTree(40);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    render(<ContentTree initialTree={tree} editHref="/e/{id}" newHref="/n" />);
    linkRenders.count = 0;
    fireEvent.click(screen.getByRole("button", { name: /^Subir: Documento 7 / }));
    await screen.findByText(/Documento 7 agora está na posição 7 de 41/);
    expect(linkRenders.count).toBeLessThan(12); // os dois (e os reflexos da resposta), não as 41
  });
});

describe("endereços como modelo de texto", () => {
  it("editHref como modelo com {id}", () => {
    render(<ContentTree initialTree={[node("a b", "Doc", "DOCUMENT")]} editHref="/admin/conteudo/{id}" newHref="/n" />);
    expect(href("Doc")).toBe("/admin/conteudo/a%20b");
  });

  it("newHref como { root, child }: o da barra é o root; o de cada coleção usa {parentId}", () => {
    render(
      <ContentTree
        initialTree={[node("pai", "Pasta", "COLLECTION")]}
        editHref="/e/{id}"
        newHref={{ root: "/admin/conteudo/novo", child: "/admin/conteudo/novo?pai={parentId}" }}
      />,
    );
    expect(href("Novo documento")).toBe("/admin/conteudo/novo");
    expect(href("Novo documento em: Pasta")).toBe("/admin/conteudo/novo?pai=pai");
  });

  it("funções continuam valendo", () => {
    render(<ContentTree initialTree={[node("a", "Doc", "DOCUMENT")]} editHref={(id) => `/f/${id}`} newHref={(p) => (p ? `/g/${p}` : "/g")} />);
    expect(href("Doc")).toBe("/f/a");
    expect(href("Novo documento")).toBe("/g");
  });
});
