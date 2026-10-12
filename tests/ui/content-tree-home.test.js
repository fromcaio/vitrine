// @vitest-environment jsdom
// P-032 (M26; RF43, RF44; RN37, RN38): a árvore do painel com a linha FIXA "Página inicial" (o próprio usuário: "Editar";
// a moderação: "Despublicar" e "Excluir" com motivo) e o botão "Ver página pública" (só em item publicado com todos os
// ancestrais publicados; `publicBasePath` nulo = nenhum botão). API simulada.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ContentTree } from "@/components/admin/ContentTree";
import { removeHome, unpublishHome } from "@/components/admin/content-tree-client";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A árvore: Cálculo (publicada) > Limites (publicado), Derivadas (rascunho); Álgebra (rascunho) > Grupos (publicado); Sobre (publicado). */
const TREE = [
  {
    id: "calc", title: "Cálculo", slug: "calculo", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 0,
    children: [
      { id: "lim", title: "Limites", slug: "limites", type: "DOCUMENT", status: "PUBLISHED", parentId: "calc", order: 0, children: [] },
      { id: "der", title: "Derivadas", slug: "derivadas", type: "DOCUMENT", status: "DRAFT", parentId: "calc", order: 1, children: [] },
    ],
  },
  {
    id: "alg", title: "Álgebra", slug: "algebra", type: "COLLECTION", status: "DRAFT", parentId: null, order: 1,
    children: [{ id: "gru", title: "Grupos", slug: "grupos", type: "DOCUMENT", status: "PUBLISHED", parentId: "alg", order: 0, children: [] }],
  },
  { id: "sobre", title: "Sobre", slug: "sobre", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 2, children: [] },
];

const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** @param {(url: string, init: RequestInit) => Response | Promise<Response>} [handler] */
function stubFetch(handler = () => json({ data: {} })) {
  const fetchMock = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => handler(String(url), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** @param {Partial<import("react").ComponentProps<typeof ContentTree>>} [props] */
function setup(props = {}) {
  return render(<ContentTree initialTree={TREE} editHref="/admin/conteudo/{id}" newHref="/admin/conteudo/novo" {...props} />);
}

const li = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[data-node-id="${id}"]`));
const homeRow = () => /** @type {HTMLElement} */ (screen.getByTestId("home-row"));
const viewLinks = () => screen.queryAllByRole("link", { name: /^Ver página pública/ });
const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));

describe("a linha fixa 'Página inicial' (árvore do próprio usuário)", () => {
  it("sem homeRow, não há a linha (o padrão não mudou)", () => {
    setup();
    expect(screen.queryByTestId("home-row")).toBeNull();
    expect(screen.queryByText("Página inicial")).toBeNull();
  });

  it("com homeRow, é a PRIMEIRA linha, acima da árvore, com 'Editar' para homeEditHref", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true }, homeEditHref: "/admin/pagina-inicial" });
    const row = homeRow();
    const tree = /** @type {HTMLElement} */ (screen.getByRole("navigation", { name: "Árvore de conteúdo" }));
    expect(row.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Editar: Página inicial" }).getAttribute("href")).toBe("/admin/pagina-inicial");
    expect(within(row).getByTestId("home-status").textContent).toBe("Publicado");
  });

  it("homeEditHref tem o padrão /admin/pagina-inicial", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true } });
    expect(within(homeRow()).getByRole("link", { name: "Editar: Página inicial" }).getAttribute("href")).toBe("/admin/pagina-inicial");
  });

  it("não se ordena, não se move e não se exclui: nenhum desses botões na linha", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true } });
    const row = homeRow();
    for (const pattern of [/^Subir/, /^Descer/, /^Mover/, /^Publicar/, /^Passar para rascunho/, /^Excluir/, /^Despublicar/, /^Renomear/]) {
      expect(within(row).queryByRole("button", { name: pattern })).toBeNull();
    }
    // e não é um nó da árvore: não está em um `li[data-node-id]`
    expect(row.closest("li[data-node-id]")).toBeNull();
  });

  it("não conta nos limites: a contagem e a cota são só dos conteúdos", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true }, maxContents: 6 });
    // 6 conteúdos (Cálculo, Limites, Derivadas, Álgebra, Grupos, Sobre) de 6: no limite, mesmo com a linha
    expect(screen.getByText(/6 conteúdos de 6 \(4 publicados, 2 rascunhos\)\./)).toBeTruthy();
    expect(screen.getByText(/Você atingiu o limite de 6 conteúdos/)).toBeTruthy();
  });

  it("o estado: Publicado, Rascunho (com texto) ou Sem texto", () => {
    const { unmount } = setup({ homeRow: { status: "DRAFT", hasBody: true } });
    expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Rascunho");
    unmount();
    const second = setup({ homeRow: { status: "PUBLISHED", hasBody: false } });
    expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Sem texto");
    second.unmount();
    setup({ homeRow: { status: "DRAFT", hasBody: false } });
    // sem texto, o estado de publicação não importa: não se fala em rascunho
    expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Sem texto");
  });

  it("uma homeRow malformada vira 'sem texto', sem derrubar a tela", () => {
    setup({ homeRow: /** @type {any} */ ({ status: 7 }) });
    expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Sem texto");
  });
});

describe("'Ver página pública' nos itens (RF44, RN38)", () => {
  it("sem publicBasePath (nulo, o padrão), nenhum botão em lugar nenhum", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true } });
    expect(viewLinks()).toHaveLength(0);
    cleanup();
    setup({ homeRow: { status: "PUBLISHED", hasBody: true }, publicBasePath: null });
    expect(viewLinks()).toHaveLength(0);
  });

  it("só no item PUBLICADO cujos ancestrais estão todos publicados, com o endereço montado pelos slugs", () => {
    setup({ publicBasePath: "/maria" });
    expect(within(li("calc")).getAllByRole("link", { name: "Ver página pública: Cálculo" })[0].getAttribute("href")).toBe("/maria/calculo");
    expect(within(li("lim")).getByRole("link", { name: "Ver página pública: Limites" }).getAttribute("href")).toBe("/maria/calculo/limites");
    expect(within(li("sobre")).getByRole("link", { name: "Ver página pública: Sobre" }).getAttribute("href")).toBe("/maria/sobre");
    // rascunho: não há página pública
    expect(within(li("der")).queryByRole("link", { name: /^Ver página pública/ })).toBeNull();
    expect(within(li("alg")).queryAllByRole("link", { name: /^Ver página pública: Álgebra/ })).toHaveLength(0);
  });

  it("um item publicado sob um ancestral em RASCUNHO não tem o botão (RN15)", () => {
    setup({ publicBasePath: "/maria" });
    // "Grupos" está publicado, mas "Álgebra" é rascunho (a árvore pequena abre inteira)
    const grupos = li("gru");
    expect(grupos).toBeTruthy();
    expect(within(grupos).queryByRole("link", { name: /^Ver página pública/ })).toBeNull();
  });

  it("abre em nova aba, com rel noopener, e o nome acessível cita o item", () => {
    setup({ publicBasePath: "/maria" });
    const link = within(li("lim")).getByRole("link", { name: "Ver página pública: Limites" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("o título e os slugs são codificados (RN04) e o prefixo é do site: nada de //outro-site", () => {
    setup({
      publicBasePath: "/maria",
      initialTree: [{ id: "x", title: "Á", slug: "a b/c", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0, children: [] }],
    });
    expect(screen.getByRole("link", { name: "Ver página pública: Á" }).getAttribute("href")).toBe("/maria/a%20b%2Fc");
    cleanup();
    setup({ publicBasePath: "//outro-site.test" });
    expect(viewLinks()).toHaveLength(0);
    cleanup();
    setup({ publicBasePath: "https://outro-site.test" });
    expect(viewLinks()).toHaveLength(0);
  });

  it("a linha da página inicial leva à raiz do espaço (publicBasePath), mesmo em rascunho", () => {
    setup({ homeRow: { status: "DRAFT", hasBody: true }, publicBasePath: "/maria" });
    expect(within(homeRow()).getByRole("link", { name: "Ver página pública: Página inicial" }).getAttribute("href")).toBe("/maria");
  });

  it("publicBasePath '/' leva a '/' na linha e a /slug nos itens", () => {
    setup({ homeRow: { status: "PUBLISHED", hasBody: true }, publicBasePath: "/" });
    expect(within(homeRow()).getByRole("link", { name: "Ver página pública: Página inicial" }).getAttribute("href")).toBe("/");
    expect(within(li("sobre")).getByRole("link", { name: "Ver página pública: Sobre" }).getAttribute("href")).toBe("/sobre");
  });
});

describe("moderação: a linha fixa e o 'Ver'", () => {
  const moderation = { ownerId: "ana", ownerName: "Ana Souza" };

  it("sem 'Editar'; com 'Despublicar' e 'Excluir' quando há texto publicado", () => {
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true } });
    const row = homeRow();
    expect(within(row).queryByRole("link", { name: /^Editar/ })).toBeNull();
    expect(within(row).getByRole("button", { name: "Despublicar: Página inicial" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Excluir: Página inicial" })).toBeTruthy();
  });

  it("'Despublicar' só com o estado PUBLISHED e texto; 'Excluir' só com texto", () => {
    const { unmount } = setup({ moderation, homeRow: { status: "DRAFT", hasBody: true } });
    expect(within(homeRow()).queryByRole("button", { name: /^Despublicar/ })).toBeNull();
    expect(within(homeRow()).getByText("Já é rascunho")).toBeTruthy();
    expect(within(homeRow()).getByRole("button", { name: "Excluir: Página inicial" })).toBeTruthy();
    unmount();
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: false } });
    expect(within(homeRow()).queryByRole("button", { name: /^Despublicar/ })).toBeNull();
    expect(within(homeRow()).queryByRole("button", { name: /^Excluir/ })).toBeNull();
  });

  it("a linha não aparece sem homeRow, e a moderação dos nós segue como era", () => {
    setup({ moderation });
    expect(screen.queryByTestId("home-row")).toBeNull();
    expect(screen.getByRole("button", { name: "Despublicar: Limites" })).toBeTruthy();
  });

  it("'Despublicar' pede o motivo, chama PATCH /api/users/:id/home e a linha passa a Rascunho (aviso em aria-live)", async () => {
    const fetchMock = stubFetch((url, init) => (init.method === "PATCH" ? json({ data: { homeStatus: "DRAFT" } }) : json({ data: {} })));
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true } });
    fireEvent.click(within(homeRow()).getByRole("button", { name: "Despublicar: Página inicial" }));
    const reason = /** @type {HTMLTextAreaElement} */ (within(dialog()).getByLabelText("Motivo"));
    // motivo obrigatório: vazio não envia
    fireEvent.click(within(dialog()).getByRole("button", { name: "Despublicar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: "  Conteúdo impróprio  " } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Despublicar" }));
    await waitFor(() => expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Rascunho"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = /** @type {[string, RequestInit]} */ (fetchMock.mock.calls[0]);
    expect(url).toBe("/api/users/ana/home");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ status: "DRAFT", reason: "Conteúdo impróprio" });
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/A página inicial passou para rascunho\. Ana Souza foi notificado\(a\) e vê o motivo\./);
    // agora é rascunho: não há mais 'Despublicar'
    expect(within(homeRow()).queryByRole("button", { name: /^Despublicar/ })).toBeNull();
  });

  it("'Excluir' chama DELETE /api/users/:id/home?reason=, e a linha passa a 'Sem texto'", async () => {
    const fetchMock = stubFetch((url, init) => (init.method === "DELETE" ? new Response(null, { status: 204 }) : json({ data: {} })));
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true } });
    fireEvent.click(within(homeRow()).getByRole("button", { name: "Excluir: Página inicial" }));
    fireEvent.change(within(dialog()).getByLabelText("Motivo"), { target: { value: "Spam & links" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Sem texto"));
    const [url, init] = /** @type {[string, RequestInit]} */ (fetchMock.mock.calls[0]);
    expect(url).toBe("/api/users/ana/home?reason=Spam%20%26%20links");
    expect(init.method).toBe("DELETE");
    expect(screen.getByRole("status").textContent).toMatch(/O texto da página inicial foi excluído\./);
    expect(within(homeRow()).queryByRole("button", { name: /^Excluir/ })).toBeNull();
  });

  it("uma recusa do servidor (422 do motivo) fica DENTRO do diálogo, que segue aberto, e a linha não muda", async () => {
    stubFetch(() => json({ error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "reason", message: "Motivo longo demais." }] } }, 422));
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true } });
    fireEvent.click(within(homeRow()).getByRole("button", { name: "Despublicar: Página inicial" }));
    fireEvent.change(within(dialog()).getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Despublicar" }));
    await waitFor(() => expect(within(dialog()).getByText("Motivo longo demais.")).toBeTruthy());
    expect(within(homeRow()).getByTestId("home-status").textContent).toBe("Publicado");
  });

  it("um 404 (já fora do ar ou vazia) fecha o diálogo e avisa", async () => {
    stubFetch(() => json({ error: { code: "NOT_FOUND", message: "x" } }, 404));
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true } });
    fireEvent.click(within(homeRow()).getByRole("button", { name: "Excluir: Página inicial" }));
    fireEvent.change(within(dialog()).getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(screen.getByText(/já estava fora do ar ou vazia/)).toBeTruthy());
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("o 'Ver página pública' da moderação é o do espaço do dono", () => {
    setup({ moderation, homeRow: { status: "PUBLISHED", hasBody: true }, publicBasePath: "/ana" });
    expect(within(homeRow()).getByRole("link", { name: "Ver página pública: Página inicial" }).getAttribute("href")).toBe("/ana");
    expect(within(li("lim")).getByRole("link", { name: "Ver página pública: Limites" }).getAttribute("href")).toBe("/ana/calculo/limites");
    expect(within(li("der")).queryByRole("link", { name: /^Ver página pública/ })).toBeNull();
  });
});

describe("content-tree-client: unpublishHome e removeHome", () => {
  it("unpublishHome: PATCH com { status: DRAFT, reason } para /api/users/:id/home", async () => {
    const fetchImpl = vi.fn(async () => json({ data: {} }));
    const result = await unpublishHome("a/b", "porque sim", /** @type {any} */ (fetchImpl));
    expect(result.ok).toBe(true);
    const [url, init] = /** @type {[string, RequestInit]} */ (/** @type {any} */ (fetchImpl).mock.calls[0]);
    expect(url).toBe("/api/users/a%2Fb/home");
    expect(init).toMatchObject({ method: "PATCH", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init.body))).toEqual({ status: "DRAFT", reason: "porque sim" });
  });

  it("removeHome: DELETE com ?reason= codificado; 204 é sucesso", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await removeHome("ana", "a&b c", /** @type {any} */ (fetchImpl));
    expect(result.ok).toBe(true);
    expect(/** @type {any} */ (fetchImpl).mock.calls[0]).toEqual(["/api/users/ana/home?reason=a%26b%20c", { method: "DELETE" }]);
  });

  it("os erros viram mensagens em português: 404, 403 (a própria página), 401, 429, 5xx e a rede", async () => {
    /** @param {number} status @param {string} [code] */
    const make = (status, code = "X") => vi.fn(async () => json({ error: { code, message: "x" } }, status));
    const kinds = [];
    for (const [status, expectedKind, text] of /** @type {const} */ ([
      [404, "not-found", /já estava fora do ar ou vazia/],
      [403, "forbidden", /própria página inicial/],
      [401, "unauthenticated", /sessão expirou/],
      [500, "server", /não conseguiu atender/],
    ])) {
      const result = await unpublishHome("ana", "m", /** @type {any} */ (make(status)));
      expect(result).toMatchObject({ ok: false, kind: expectedKind });
      expect(/** @type {any} */ (result).message).toMatch(text);
      kinds.push(expectedKind);
    }
    const limited = await removeHome("ana", "m", /** @type {any} */ (vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "7" } }))));
    expect(limited).toMatchObject({ ok: false, kind: "rate-limited" });
    expect(/** @type {any} */ (limited).message).toContain("7 segundos");
    const offline = await removeHome("ana", "m", /** @type {any} */ (vi.fn(async () => { throw new Error("offline"); })));
    expect(offline).toMatchObject({ ok: false, kind: "network" });
  });
});
