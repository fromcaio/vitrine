// @vitest-environment jsdom
// P-024, item 7: o link "Ver página pública" do editor. A UI não conhece o dono nem os slugs: recebe o
// `viewHref` pronto (o Core o monta) e o mostra perto dos botões de ação, em nova aba. Sem `viewHref`, nada;
// com o estado SALVO em rascunho, uma dica toma o lugar do link; com alterações não enviadas, um aviso diz
// que o link abre a versão salva. Vale também na moderação.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { INITIAL, RendererStub, renderEditor, send, title, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HREF = "/matheusviana/aeds-i/p1/testes";
const DRAFT = { ...INITIAL, status: /** @type {const} */ ("DRAFT") };
const LINK = { name: /^Ver página pública/ };
const HINT = "Publique o documento para ver a página pública.";
const UNSENT_NOTE = /abre a versão salva, sem as alterações ainda não enviadas/;

describe("Editor: ver a página pública (viewHref)", () => {
  it("com viewHref: um link para a página, em NOVA aba, com rel noopener e perto dos botões de ação", () => {
    renderEditor({ viewHref: HREF });
    const link = screen.getByRole("link", LINK);
    expect(link.getAttribute("href")).toBe(HREF);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    // O nome acessível avisa da nova aba.
    expect(link.textContent).toBe("Ver página pública (abre em uma nova aba)");
    // Está no mesmo grupo dos botões de ação.
    expect(link.parentElement).toBe(screen.getByRole("button", { name: "Salvar localmente" }).parentElement);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("sem viewHref (nulo ou ausente) não há link, e um documento publicado não leva dica", () => {
    for (const viewHref of [null, undefined]) {
      const { unmount } = renderEditor({ viewHref });
      expect(screen.queryByRole("link", LINK)).toBeNull();
      expect(screen.queryByText(HINT)).toBeNull();
      unmount();
    }
  });

  it("estado salvo em RASCUNHO: a dica no lugar do link, mesmo que o viewHref venha (a página não existe)", () => {
    const first = renderEditor({ initialValue: DRAFT, viewHref: null });
    expect(screen.queryByRole("link", LINK)).toBeNull();
    expect(screen.getByText(HINT)).toBeTruthy();
    first.unmount();
    renderEditor({ initialValue: DRAFT, viewHref: HREF });
    expect(screen.queryByRole("link", LINK)).toBeNull();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("sem alterações, o link não traz aviso; ao editar, o aviso diz que o link abre a versão SALVA", () => {
    renderEditor({ viewHref: HREF });
    expect(screen.queryByText(UNSENT_NOTE)).toBeNull();
    type(title(), "Outro título");
    expect(screen.getByText(UNSENT_NOTE)).toBeTruthy();
    expect(screen.getByRole("link", LINK)).toBeTruthy();
    type(title(), INITIAL.title);
    expect(screen.queryByText(UNSENT_NOTE)).toBeNull();
  });

  it("passar o formulário para rascunho SEM enviar mantém o link (o salvo é o publicado) e avisa", () => {
    renderEditor({ viewHref: HREF });
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    expect(screen.getByRole("link", LINK)).toBeTruthy();
    expect(screen.getByText(UNSENT_NOTE)).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("enviar como rascunho tira o link e põe a dica; voltar a publicar e enviar não o traz de volta sem o Core", async () => {
    const { onSubmit } = renderEditor({ viewHref: HREF });
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await screen.findByText(HINT);
    expect(screen.queryByRole("link", LINK)).toBeNull();
  });

  it("um documento NOVO (sem página ainda) e publicado não mostra o link", () => {
    renderEditor({ contentId: null, viewHref: null, initialValue: { title: "", slug: "", body: "", status: "PUBLISHED" } });
    expect(screen.queryByRole("link", LINK)).toBeNull();
  });

  it("só aceita um caminho do próprio site: nada de outro site, de esquema, de espaço ou de barra invertida", () => {
    const back = String.fromCharCode(92);
    for (const bad of ["//outro.example/a", "https://outro.example/a", "javascript:alert(1)", "/a b", `/a${back}b`, "maria/aula", "", "/a\nb"]) {
      const { unmount } = renderEditor({ viewHref: bad });
      expect(screen.queryByRole("link", LINK), JSON.stringify(bad)).toBeNull();
      unmount();
    }
    for (const good of ["/maria", "/maria/a/b/c", "/m-1/aula_2?x=1"]) {
      const { unmount } = renderEditor({ viewHref: good });
      expect(screen.getByRole("link", LINK).getAttribute("href"), good).toBe(good);
      unmount();
    }
  });

  it("na MODERAÇÃO (o administrador edita o conteúdo de outro) o link leva à página do dono", () => {
    renderEditor({ viewHref: "/maria/aula", moderation: { ownerName: "Maria" } });
    expect(screen.getByRole("link", LINK).getAttribute("href")).toBe("/maria/aula");
  });

  it("o clique no link não envia nem apaga nada (não é um botão do formulário)", () => {
    const { onSubmit } = renderEditor({ viewHref: HREF });
    const link = screen.getByRole("link", LINK);
    expect(link.closest("form")).not.toBeNull();
    expect(link.getAttribute("type")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ContentEditor repassa o viewHref", () => {
  it("com e sem a prop", async () => {
    const first = render(<ContentEditor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" viewHref={HREF} />);
    const link = await screen.findByRole("link", LINK);
    expect(link.getAttribute("href")).toBe(HREF);
    first.unmount();
    render(<ContentEditor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" />);
    await screen.findByLabelText("Título");
    expect(screen.queryByRole("link", LINK)).toBeNull();
  });
});
