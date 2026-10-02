// @vitest-environment jsdom
// ContentEditor (M09): o Editor ligado à API, como a página de criação e edição o usa: dados
// simples por props, carregamento sob demanda e envio por POST (novo) e PATCH (existente).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { RendererStub } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

const jsonResponse = (/** @type {number} */ status, /** @type {unknown} */ body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** @param {...Response} responses uma resposta por chamada, na ordem */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requestOf = (/** @type {import("vitest").Mock<any>} */ fetchMock, call = 0) => {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, method: init.method, headers: init.headers, body: JSON.parse(init.body) };
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const field = async (/** @type {string} */ label) => /** @type {HTMLInputElement} */ (await screen.findByLabelText(label));
const sendButton = () => screen.getByRole("button", { name: /Enviar nova versão|Enviando/ });

describe("ContentEditor", () => {
  it("é carregado sob demanda: primeiro o aviso, depois o editor", async () => {
    render(<ContentEditor userId="u1" contentId="c1" initialValue={{ title: "Aula", slug: "aula", body: "x", status: "PUBLISHED" }} version="v1" />);
    expect(screen.getByText("Carregando o editor…")).toBeTruthy();
    expect((await field("Título")).value).toBe("Aula");
    expect(screen.queryByText("Carregando o editor…")).toBeNull();
  });

  it("atualiza um conteúdo existente com PATCH /api/contents/:id", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { id: "c1", updatedAt: "2026-10-02T14:00:00.000Z" } }));
    render(<ContentEditor userId="u1" contentId="c1" initialValue={{ title: "Aula", slug: "aula", body: "x", status: "PUBLISHED" }} version="v1" />);
    fireEvent.change(await field("Título"), { target: { value: "Aula revisada" } });
    fireEvent.click(sendButton());

    expect(await screen.findByText(/Nova versão enviada/)).toBeTruthy();
    expect(requestOf(fetchMock)).toEqual({
      url: "/api/contents/c1",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: { title: "Aula revisada", slug: "aula", body: "x", status: "PUBLISHED" },
    });
  });

  it("cria um conteúdo novo com POST /api/contents, na coleção pai informada, e os envios seguintes o atualizam", async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, { data: { id: "criado-1", updatedAt: "2026-10-02T14:00:00.000Z" } }),
      jsonResponse(200, { data: { id: "criado-1", updatedAt: "2026-10-02T14:05:00.000Z" } }),
    );
    render(<ContentEditor userId="u1" contentId={null} parentId="colecao-9" initialValue={{ status: "PUBLISHED" }} />);
    fireEvent.change(await field("Título"), { target: { value: "Primeira aula" } });
    fireEvent.change(screen.getByLabelText("Texto do documento (Markdown)"), { target: { value: "# Olá" } });
    fireEvent.click(sendButton());
    await screen.findByText(/Nova versão enviada/);

    expect(requestOf(fetchMock, 0)).toEqual({
      url: "/api/contents",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { title: "Primeira aula", slug: "primeira-aula", type: "DOCUMENT", parentId: "colecao-9", body: "# Olá", status: "PUBLISHED" },
    });

    fireEvent.change(screen.getByLabelText("Texto do documento (Markdown)"), { target: { value: "# Olá, de novo" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestOf(fetchMock, 1)).toMatchObject({ url: "/api/contents/criado-1", method: "PATCH", body: { body: "# Olá, de novo" } });
  });

  it("um conteúdo novo na raiz envia parentId nulo", async () => {
    const fetchMock = stubFetch(jsonResponse(201, { data: { id: "x" } }));
    render(<ContentEditor userId="u1" contentId={null} initialValue={{ title: "Raiz", slug: "raiz", status: "DRAFT" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    await screen.findByText(/Nova versão enviada/);
    expect(requestOf(fetchMock).body).toMatchObject({ parentId: null, status: "DRAFT", body: "" });
  });

  it("depois de criar, o rascunho passa a ser do conteúdo criado", async () => {
    stubFetch(jsonResponse(201, { data: { id: "criado-1" } }));
    render(<ContentEditor userId="u1" contentId={null} initialValue={{ title: "Aula", slug: "aula", status: "PUBLISHED" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    await screen.findByText(/Nova versão enviada/);
    fireEvent.change(screen.getByLabelText("Texto do documento (Markdown)"), { target: { value: "rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar localmente" }));
    expect(localStorage.getItem("vitrine:rascunho:u1:criado-1")).not.toBeNull();
    expect(localStorage.getItem("vitrine:rascunho:u1:novo")).toBeNull();
  });

  it("slug em conflito: mostra o erro e a sugestão da API", async () => {
    stubFetch(jsonResponse(409, { error: { code: "SLUG_CONFLICT", message: "Já existe um conteúdo com este slug na mesma coleção.", details: [{ field: "slug", value: "aula", suggestion: "aula-2" }] } }));
    render(<ContentEditor userId="u1" contentId={null} initialValue={{ title: "Aula", slug: "aula", status: "PUBLISHED" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Usar o endereço sugerido “aula-2”/ }));
    expect((/** @type {HTMLInputElement} */ (screen.getByLabelText("Endereço (slug)"))).value).toBe("aula-2");
  });

  it("sessão expirada (401): avisa, guarda o texto e oferece o login", async () => {
    stubFetch(jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Autenticação necessária.", details: [] } }));
    render(<ContentEditor userId="u1" contentId="c1" initialValue={{ title: "Aula", slug: "aula", body: "texto", status: "PUBLISHED" }} version="v1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    expect(await screen.findByText(/Sua sessão expirou/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir o login em outra aba" })).toBeTruthy();
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem("vitrine:rascunho:u1:c1"))).values.body).toBe("texto");
  });

  it("sem rede: avisa e guarda o texto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ContentEditor userId="u1" contentId="c1" initialValue={{ title: "Aula", slug: "aula", body: "texto", status: "PUBLISHED" }} version="v1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(localStorage.getItem("vitrine:rascunho:u1:c1")).not.toBeNull();
  });

  it("um corpo nulo vindo do banco vira um texto vazio", async () => {
    stubFetch(jsonResponse(200, { data: { id: "c1" } }));
    render(<ContentEditor userId="u1" contentId="c1" initialValue={{ title: "Aula", slug: "aula", body: null, status: "PUBLISHED" }} version="v1" />);
    expect((/** @type {HTMLTextAreaElement} */ (await screen.findByLabelText("Texto do documento (Markdown)"))).value).toBe("");
  });
});
