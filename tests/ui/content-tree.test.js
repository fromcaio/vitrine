// @vitest-environment jsdom
// Árvore do conteúdo do painel (RF03, RF06, RF07, RF26; RN02, RN05, RN06, RN07, RN16, RN25; M10): o
// que a tela mostra, cada ação contra uma API simulada com estado (a mesma forma de resposta de
// `/api/contents`), a reversão do reordenar, os diálogos, a cota e o foco.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentTree } from "@/components/admin/ContentTree";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close() {
      this.removeAttribute("open");
    };
  }
});

/** Linhas planas do "banco" da API simulada. @typedef {{ id: string, title: string, slug: string, type: "DOCUMENT" | "COLLECTION", status: "PUBLISHED" | "DRAFT", parentId: string | null, order: number }} Row */

/** @type {Row[]} */
const SAMPLE = [
  { id: "calc", title: "Cálculo", slug: "calculo", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 0 },
  { id: "lim", title: "Limites", slug: "limites", type: "DOCUMENT", status: "PUBLISHED", parentId: "calc", order: 0 },
  { id: "der", title: "Derivadas", slug: "derivadas", type: "DOCUMENT", status: "DRAFT", parentId: "calc", order: 1 },
  { id: "ser", title: "Séries", slug: "series", type: "COLLECTION", status: "PUBLISHED", parentId: "calc", order: 2 },
  { id: "conv", title: "Convergência", slug: "convergencia", type: "DOCUMENT", status: "PUBLISHED", parentId: "ser", order: 0 },
  { id: "rasc", title: "Rascunhos", slug: "rascunhos", type: "COLLECTION", status: "DRAFT", parentId: null, order: 1 },
  { id: "anot", title: "Anotações", slug: "anotacoes", type: "DOCUMENT", status: "PUBLISHED", parentId: "rasc", order: 0 },
  { id: "sobre", title: "Sobre", slug: "sobre", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 2 },
];

/** @param {Row[]} rows @param {string | null} [parentId] @returns {any[]} */
function buildTree(rows, parentId = null) {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((row) => ({ ...row, children: row.type === "COLLECTION" ? buildTree(rows, row.id) : [] }));
}

/** A API simulada: guarda as linhas, responde como `/api/contents` e registra as chamadas. @param {Row[]} initial @param {{ limit?: number }} [options] */
function fakeApi(initial, { limit = 500 } = {}) {
  let rows = structuredClone(initial);
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  /** @type {Map<string, Response | (() => Response)>} */
  const failures = new Map();
  /** @type {Map<string, Promise<void>>} */
  const gates = new Map();
  let created = 0;

  /** @param {unknown} body @param {number} [status] */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  /** @param {string} code @param {number} status @param {unknown[]} [details] */
  const problem = (code, status, details = []) => json({ error: { code, message: "mensagem do servidor", details } }, status);

  /** @param {string} id @returns {string[]} */
  const withDescendants = (id) => [id, ...rows.filter((row) => row.parentId === id).flatMap((row) => withDescendants(row.id))];

  /** @param {string} url @param {RequestInit} [init] */
  async function handle(url, init = {}) {
    const method = init.method ?? "GET";
    const path = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    const gate = gates.get(key);
    if (gate) {
      gates.delete(key);
      await gate;
    }
    const failure = failures.get(key);
    if (failure) {
      failures.delete(key);
      return typeof failure === "function" ? failure() : failure;
    }
    if (method === "GET" && path === "/api/contents") return json({ data: buildTree(rows) });
    if (method === "POST" && path === "/api/contents") {
      if (rows.length >= limit) return problem("QUOTA_EXCEEDED", 422);
      if (rows.some((row) => row.parentId === (body.parentId ?? null) && row.slug === body.slug)) {
        return problem("SLUG_CONFLICT", 409, [{ field: "slug", value: body.slug, suggestion: `${body.slug}-2` }]);
      }
      created += 1;
      const row = { id: `novo${created}`, title: body.title, slug: body.slug, type: body.type, status: /** @type {const} */ ("PUBLISHED"), parentId: body.parentId ?? null, order: rows.filter((r) => r.parentId === (body.parentId ?? null)).length };
      rows.push(row);
      return json({ data: row }, 201);
    }
    if (method === "PATCH" && path === "/api/contents/reorder") {
      for (const item of body) {
        const row = rows.find((r) => r.id === item.id);
        if (!row) return problem("NOT_FOUND", 404);
        row.order = item.order;
        if (item.parentId !== undefined) row.parentId = item.parentId;
      }
      return json({ data: buildTree(rows) });
    }
    const match = path.match(/^\/api\/contents\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const row = rows.find((r) => r.id === id);
      if (!row) return problem("NOT_FOUND", 404);
      if (method === "DELETE") {
        const gone = new Set(withDescendants(id));
        rows = rows.filter((r) => !gone.has(r.id));
        return new Response(null, { status: 204 });
      }
      if (method === "PATCH") {
        if (body.status) row.status = body.status;
        if (body.parentId !== undefined) {
          row.parentId = body.parentId;
          row.order = rows.filter((r) => r.parentId === body.parentId && r.id !== id).length;
        }
        return json({ data: row });
      }
    }
    return problem("NOT_FOUND", 404);
  }

  return {
    calls,
    fetch: vi.fn(handle),
    get tree() {
      return buildTree(rows);
    },
    /** A próxima chamada com este método e caminho responde com a falha. @param {string} key @param {number} status @param {string} [code] */
    failNext(key, status, code = "INTERNAL") {
      failures.set(key, () => problem(code, status));
    },
    /** A próxima chamada fica esperando até `release()`. @param {string} key */
    pause(key) {
      /** @type {() => void} */
      let release = () => {};
      gates.set(key, new Promise((resolve) => (release = () => resolve())));
      return release;
    },
    /** Remove uma linha por fora (outra aba). @param {string} id */
    removeBehindTheScenes(id) {
      const gone = new Set(withDescendants(id));
      rows = rows.filter((r) => !gone.has(r.id));
    },
    /** @param {string} method @param {string} pathPattern */
    callsTo: (method, pathPattern) => calls.filter((call) => call.method === method && call.path.startsWith(pathPattern)),
  };
}

/** @type {ReturnType<typeof fakeApi>} */
let api;

/** @param {{ rows?: Row[], maxContents?: number, limit?: number }} [options] */
function setup({ rows = SAMPLE, maxContents, limit } = {}) {
  api = fakeApi(rows, { limit });
  vi.stubGlobal("fetch", api.fetch);
  return render(
    <ContentTree
      initialTree={buildTree(rows)}
      editHref={(id) => `/admin/conteudo/${id}`}
      newHref={(parentId) => (parentId ? `/admin/conteudo/novo?pai=${parentId}` : "/admin/conteudo/novo")}
      maxContents={maxContents}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const li = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[data-node-id="${id}"]`));
/** Só a linha do nó, sem os descendentes. @param {string} id */
const row = (id) => /** @type {HTMLElement} */ (li(id).querySelector(":scope > div"));
const button = (/** @type {RegExp | string} */ name) => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name }));
const titles = () => [...document.querySelectorAll("li[data-node-id]")].map((el) => el.getAttribute("data-node-id"));
/** Os filhos diretos de um nó, na ordem da tela. @param {string} id */
const childIds = (id) => [...li(id).querySelectorAll(":scope > ul > li[data-node-id]")].map((el) => el.getAttribute("data-node-id"));
const dialog = () => /** @type {HTMLDialogElement} */ (document.querySelector("dialog"));
const inDialog = () => within(dialog());

describe("o que a tela mostra", () => {
  it("lista todos os nós, na ordem, com o tipo dito em texto (nunca só o ícone)", () => {
    setup();
    expect(titles()).toEqual(["calc", "lim", "der", "ser", "conv", "rasc", "anot", "sobre"]);
    expect(within(li("calc")).getAllByText("Coleção:")[0]).toBeTruthy();
    expect(within(li("sobre")).getByText("Documento:")).toBeTruthy();
  });

  it("o estado vem em texto: Publicado e Rascunho (e o rascunho se destaca)", () => {
    setup();
    expect(within(li("lim")).getAllByTestId("status")[0].textContent).toBe("Publicado");
    expect(within(li("der")).getAllByTestId("status")[0].textContent).toBe("Rascunho");
    expect(li("der").getAttribute("data-status")).toBe("DRAFT");
  });

  it("documentos levam ao editor pelo editHref; coleções não são links", () => {
    setup();
    expect(screen.getByRole("link", { name: "Limites" }).getAttribute("href")).toBe("/admin/conteudo/lim");
    expect(screen.queryByRole("link", { name: "Cálculo" })).toBeNull();
  });

  it("o novo documento usa o newHref: o da raiz na barra e o da coleção em cada coleção", () => {
    setup();
    expect(screen.getByRole("link", { name: "Novo documento" }).getAttribute("href")).toBe("/admin/conteudo/novo");
    expect(screen.getByRole("link", { name: "Novo documento em: Cálculo" }).getAttribute("href")).toBe("/admin/conteudo/novo?pai=calc");
    expect(screen.queryByRole("link", { name: "Novo documento em: Limites" })).toBeNull();
  });

  it("mostra 'Oculto pelo pai' num publicado sob um rascunho, e só nele (RN16)", () => {
    setup();
    expect(within(li("anot")).getByText(/Oculto pelo pai/)).toBeTruthy();
    expect(within(li("anot")).getByText(/Rascunhos está em rascunho/)).toBeTruthy();
    expect(within(row("rasc")).queryByText(/Oculto pelo pai/)).toBeNull();
    expect(within(row("der")).queryByText(/Oculto pelo pai/)).toBeNull();
    expect(within(row("lim")).queryByText(/Oculto pelo pai/)).toBeNull();
  });

  it("resume a contagem e a cota", () => {
    setup();
    expect(screen.getByText(/8 conteúdos de 500 \(6 publicados, 2 rascunhos\)\./)).toBeTruthy();
  });

  it("árvore vazia: convida a criar o primeiro", () => {
    setup({ rows: [] });
    expect(screen.getByText(/ainda não tem conteúdo/)).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Árvore de conteúdo" })).toBeNull();
  });

  it("título e slug são texto puro: HTML e script não viram elementos", () => {
    setup({
      rows: [
        { id: "x", title: "<b>negrito</b><script>window.__xss = 1</script>", slug: "x", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0 },
        { id: "y", title: "<img src=x onerror=alert(1)>", slug: "y", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 1 },
      ],
    });
    expect(document.querySelector("li b")).toBeNull();
    expect(document.querySelector("li script")).toBeNull();
    expect(document.querySelector("li img")).toBeNull();
    expect(screen.getByRole("link", { name: "<b>negrito</b><script>window.__xss = 1</script>" })).toBeTruthy();
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });

  it("um título vazio aparece como '(sem título)'", () => {
    setup({ rows: [{ id: "x", title: "", slug: "x", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0 }] });
    expect(screen.getByText("(sem título)")).toBeTruthy();
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate|green)-\d/);
  });

  it("cada ação tem um nome acessível que cita o nó e começa pelo texto visível", () => {
    setup();
    for (const name of ["Subir: Derivadas (posição 2 de 3)", "Descer: Derivadas (posição 2 de 3)", "Publicar: Derivadas", "Passar para rascunho: Limites", "Mover para outra coleção: Limites", "Excluir: Limites", "Nova subcoleção em: Cálculo"]) {
      expect(button(name)).toBeTruthy();
    }
  });
});

describe("recolher e expandir", () => {
  it("o botão tem aria-expanded e esconde e mostra os filhos", () => {
    setup();
    const toggle = button("Subitens de Cálculo");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(titles()).toEqual(["calc", "rasc", "anot", "sobre"]);
    fireEvent.click(toggle);
    expect(titles()).toContain("conv");
  });

  it("só coleções com filhos têm o botão", () => {
    setup({ rows: [...SAMPLE, { id: "vazia", title: "Vazia", slug: "vazia", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 3 }] });
    expect(screen.queryByRole("button", { name: "Subitens de Vazia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subitens de Limites" })).toBeNull();
  });

  it("'Recolher tudo' e 'Expandir tudo' alternam", () => {
    setup();
    fireEvent.click(button("Recolher tudo"));
    expect(titles()).toEqual(["calc", "rasc", "sobre"]);
    fireEvent.click(button("Expandir tudo"));
    expect(titles()).toHaveLength(8);
  });
});

describe("subir e descer (RF03, RN05)", () => {
  it("o primeiro não sobe e o último não desce", () => {
    setup();
    expect(button(/^Subir: Cálculo/).disabled).toBe(true);
    expect(button(/^Descer: Sobre/).disabled).toBe(true);
    expect(button(/^Descer: Cálculo/).disabled).toBe(false);
  });

  it("é otimista: a ordem troca antes de o servidor responder, e o lote leva TODOS os irmãos renumerados", async () => {
    setup();
    const release = api.pause("PATCH /api/contents/reorder");
    fireEvent.click(button(/^Subir: Derivadas/));
    expect(childIds("calc")).toEqual(["der", "lim", "ser"]); // já trocou
    await waitFor(() => expect(api.callsTo("PATCH", "/api/contents/reorder")).toHaveLength(1));
    expect(api.callsTo("PATCH", "/api/contents/reorder")[0].body).toEqual([
      { id: "der", parentId: "calc", order: 0 },
      { id: "lim", parentId: "calc", order: 1 },
      { id: "ser", parentId: "calc", order: 2 },
    ]);
    release();
    await screen.findByText(/Derivadas agora está na posição 1 de 3\./);
    expect(childIds("calc")).toEqual(["der", "lim", "ser"]);
  });

  it("na raiz, o lote tem parentId nulo", async () => {
    setup();
    fireEvent.click(button(/^Descer: Cálculo/));
    await screen.findByText(/Cálculo agora está na posição 2 de 3\./);
    expect(api.callsTo("PATCH", "/api/contents/reorder")[0].body).toEqual([
      { id: "rasc", parentId: null, order: 0 },
      { id: "calc", parentId: null, order: 1 },
      { id: "sobre", parentId: null, order: 2 },
    ]);
  });

  it("o servidor recusou: a ordem volta ao que era e a mensagem aparece", async () => {
    setup();
    api.failNext("PATCH /api/contents/reorder", 500);
    fireEvent.click(button(/^Subir: Derivadas/));
    expect(childIds("calc")).toEqual(["der", "lim", "ser"]);
    const alert = await screen.findByText(/O servidor não conseguiu atender agora/);
    expect(alert.textContent).toMatch(/A ordem voltou ao que era\./);
    expect(childIds("calc")).toEqual(["lim", "der", "ser"]);
  });

  it("erro de rede também reverte", async () => {
    setup();
    api.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    fireEvent.click(button(/^Descer: Limites/));
    await screen.findByText(/Não foi possível conectar ao servidor/);
    expect(childIds("calc")).toEqual(["lim", "der", "ser"]);
  });

  it("429: reverte e diz para aguardar", async () => {
    setup();
    api.failNext("PATCH /api/contents/reorder", 429, "RATE_LIMITED");
    fireEvent.click(button(/^Subir: Derivadas/));
    await screen.findByText(/Muitas alterações em pouco tempo/);
    expect(childIds("calc")).toEqual(["lim", "der", "ser"]);
  });

  it("um nó excluído em outra aba (404): reverte, avisa e recarrega a árvore", async () => {
    setup();
    api.removeBehindTheScenes("der");
    fireEvent.click(button(/^Descer: Limites/));
    await screen.findByText(/não existe mais/);
    await waitFor(() => expect(childIds("calc")).toEqual(["lim", "ser"]));
    expect(api.callsTo("GET", "/api/contents").length).toBeGreaterThan(0);
  });

  it("o foco fica no botão que foi usado; se ele ficou desabilitado, vai ao outro sentido", async () => {
    setup();
    const up = button(/^Subir: Derivadas/);
    up.focus();
    fireEvent.click(up);
    await screen.findByText(/Derivadas agora está na posição 1 de 3\./);
    // Derivadas é a primeira: "Subir" ficou desabilitado, então o foco vai para "Descer". O foco é
    // devolvido por um efeito (fora do `act` do teste), então se espera por ele.
    await waitFor(() => expect(document.activeElement).toBe(button(/^Descer: Derivadas/)));
  });

  it("o segundo clique durante o envio é ignorado (uma ação por vez)", async () => {
    setup();
    const release = api.pause("PATCH /api/contents/reorder");
    fireEvent.click(button(/^Subir: Derivadas/));
    fireEvent.click(button(/^Descer: Limites/));
    fireEvent.click(button(/^Subir: Sobre/));
    release();
    await screen.findByText(/Derivadas agora está/);
    expect(api.callsTo("PATCH", "/api/contents/reorder")).toHaveLength(1);
  });

  it("não desabilita os botões durante o envio (o foco não se perde)", async () => {
    setup();
    const release = api.pause("PATCH /api/contents/reorder");
    const down = button(/^Descer: Limites/);
    down.focus();
    fireEvent.click(down);
    expect(down.disabled).toBe(false);
    expect(document.activeElement).toBe(down);
    release();
    await screen.findByText(/Limites agora está/);
  });
});

describe("publicar e despublicar (RF26, RN16)", () => {
  it("publicar envia { status: PUBLISHED } e atualiza o selo", async () => {
    setup();
    fireEvent.click(button("Publicar: Derivadas"));
    await screen.findByText("Derivadas foi publicado.");
    expect(api.callsTo("PATCH", "/api/contents/der")[0].body).toEqual({ status: "PUBLISHED" });
    expect(within(li("der")).getAllByTestId("status")[0].textContent).toBe("Publicado");
  });

  it("despublicar uma coleção diz quantos publicados deixam de aparecer, sem mudar o estado deles", async () => {
    setup();
    fireEvent.click(button("Passar para rascunho: Cálculo"));
    await screen.findByText(/Cálculo passou para rascunho\. 3 conteúdos publicados dentro dela deixam de aparecer; o estado de cada um não mudou\./);
    expect(within(li("calc")).getAllByTestId("status")[0].textContent).toBe("Rascunho");
    expect(within(li("lim")).getAllByTestId("status")[0].textContent).toBe("Publicado");
    expect(within(li("lim")).getByText(/Oculto pelo pai/)).toBeTruthy();
  });

  it("despublicar uma folha: mensagem simples", async () => {
    setup();
    fireEvent.click(button("Passar para rascunho: Sobre"));
    await screen.findByText("Sobre passou para rascunho.");
  });

  it("a falha não muda o selo", async () => {
    setup();
    api.failNext("PATCH /api/contents/lim", 500);
    fireEvent.click(button("Passar para rascunho: Limites"));
    await screen.findByText(/O servidor não conseguiu atender agora/);
    expect(within(li("lim")).getAllByTestId("status")[0].textContent).toBe("Publicado");
  });

  it("o foco fica no botão de estado depois da troca", async () => {
    setup();
    const toggle = button("Publicar: Derivadas");
    toggle.focus();
    fireEvent.click(toggle);
    await screen.findByText("Derivadas foi publicado.");
    await waitFor(() => expect(document.activeElement).toBe(button("Passar para rascunho: Derivadas")));
  });
});

describe("excluir (RF07, RN07)", () => {
  it("abre um alertdialog (nunca window.confirm) e cancelar não envia nada", () => {
    setup();
    fireEvent.click(button("Excluir: Limites"));
    expect(screen.getByRole("alertdialog", { name: 'Excluir o documento "Limites"?' })).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    expect(api.callsTo("DELETE", "/api/contents")).toHaveLength(0);
    expect(titles()).toContain("lim");
  });

  it("uma coleção diz quantos itens saem junto (os descendentes, em qualquer estado)", () => {
    setup();
    fireEvent.click(button("Excluir: Cálculo"));
    expect(screen.getByRole("alertdialog", { name: 'Excluir a coleção "Cálculo"?' })).toBeTruthy();
    expect(inDialog().getByText(/4 itens que estão dentro serão excluídos junto/)).toBeTruthy();
  });

  it("uma folha não fala em descendentes; um único descendente fica no singular", () => {
    setup();
    fireEvent.click(button("Excluir: Sobre"));
    expect(inDialog().queryByText(/dentro/)).toBeNull();
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    fireEvent.click(button("Excluir: Séries"));
    expect(inDialog().getByText(/1 item que está dentro será excluído junto/)).toBeTruthy();
  });

  it("confirmar envia DELETE, tira o nó e os descendentes e o anuncia", async () => {
    setup();
    fireEvent.click(button("Excluir: Cálculo"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Cálculo foi excluído, com 4 itens que estavam dentro\./);
    expect(api.callsTo("DELETE", "/api/contents/calc")).toHaveLength(1);
    expect(titles()).toEqual(["rasc", "anot", "sobre"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("o foco vai ao vizinho que ficou (o seguinte, ou o anterior)", async () => {
    setup();
    fireEvent.click(button("Excluir: Rascunhos"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Rascunhos foi excluído/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Sobre" })));
  });

  it("sem irmãos, o foco vai ao pai; sem pai, à barra de ferramentas", async () => {
    setup({ rows: [SAMPLE[0], SAMPLE[1]] });
    fireEvent.click(button("Excluir: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Limites foi excluído/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Cálculo")));
    fireEvent.click(button("Excluir: Cálculo"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Cálculo foi excluído/);
    await waitFor(() => expect(document.activeElement).toBe(button("Nova coleção")));
  });

  it("cancelar devolve o foco ao botão que abriu o diálogo", () => {
    setup();
    const opener = button("Excluir: Limites");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(opener);
  });

  it("enquanto envia, o diálogo mostra 'Enviando…' e não fecha", async () => {
    setup();
    const release = api.pause("DELETE /api/contents/lim");
    fireEvent.click(button("Excluir: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(inDialog().getByRole("button", { name: "Enviando…", hidden: true })).toBeTruthy());
    expect(dialog().hasAttribute("open")).toBe(true);
    release();
    await screen.findByText(/Limites foi excluído/);
  });

  it("um nó que já não existe (404): sai da tela, avisa e recarrega", async () => {
    setup();
    api.removeBehindTheScenes("lim");
    fireEvent.click(button("Excluir: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/não existe mais/);
    expect(titles()).not.toContain("lim");
  });

  it("outra falha mantém o nó na árvore e mostra o erro", async () => {
    setup();
    api.failNext("DELETE /api/contents/lim", 500);
    fireEvent.click(button("Excluir: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/O servidor não conseguiu atender agora/);
    expect(titles()).toContain("lim");
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("mover (RF07, RN06)", () => {
  /** @param {string} name */
  const options = (name) => within(screen.getByRole("combobox", { name })).getAllByRole("option").map((o) => o.textContent);

  it("o seletor só tem coleções e a raiz, sem o pai atual, o próprio nó nem os descendentes", () => {
    setup();
    fireEvent.click(button("Mover para outra coleção: Séries"));
    expect(options("Mover para")).toEqual(["Raiz do espaço (sem coleção)", "Rascunhos"]);
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    fireEvent.click(button("Mover para outra coleção: Limites"));
    expect(options("Mover para")).toEqual(["Raiz do espaço (sem coleção)", "Cálculo › Séries", "Rascunhos"]);
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    fireEvent.click(button("Mover para outra coleção: Cálculo"));
    expect(options("Mover para")).toEqual(["Rascunhos"]);
  });

  it("confirmar envia { parentId }, recarrega a árvore e mostra o nó no destino", async () => {
    setup();
    fireEvent.click(button("Mover para outra coleção: Limites"));
    fireEvent.change(screen.getByRole("combobox", { name: "Mover para" }), { target: { value: "rasc" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Mover" }));
    await screen.findByText(/Limites foi movido para Rascunhos, no fim da lista\./);
    expect(api.callsTo("PATCH", "/api/contents/lim")[0].body).toEqual({ parentId: "rasc" });
    expect(childIds("rasc")).toEqual(["anot", "lim"]);
    expect(childIds("calc")).toEqual(["der", "ser"]);
  });

  it("para a raiz, envia parentId nulo", async () => {
    setup();
    fireEvent.click(button("Mover para outra coleção: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Mover" })); // a primeira opção é a raiz
    await screen.findByText(/Limites foi movido para a raiz do espaço/);
    expect(api.callsTo("PATCH", "/api/contents/lim")[0].body).toEqual({ parentId: null });
  });

  it("abre o destino se ele estava recolhido", async () => {
    setup();
    fireEvent.click(button("Subitens de Rascunhos"));
    expect(titles()).not.toContain("anot");
    fireEvent.click(button("Mover para outra coleção: Limites"));
    fireEvent.change(screen.getByRole("combobox", { name: "Mover para" }), { target: { value: "rasc" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Mover" }));
    await screen.findByText(/Limites foi movido/);
    expect(titles()).toContain("anot");
    expect(titles()).toContain("lim");
  });

  it("o foco vai ao nó movido, no lugar novo", async () => {
    setup();
    fireEvent.click(button("Mover para outra coleção: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Mover" }));
    await screen.findByText(/Limites foi movido/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Limites" })));
  });

  it("cancelar não envia nada e devolve o foco", () => {
    setup();
    const opener = button("Mover para outra coleção: Limites");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    expect(api.callsTo("PATCH", "/api/contents/lim")).toHaveLength(0);
    expect(document.activeElement).toBe(opener);
  });

  it("o foco abre no seletor", () => {
    setup();
    fireEvent.click(button("Mover para outra coleção: Limites"));
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Mover para" }));
  });

  it("sem nenhum destino, o botão fica desabilitado", () => {
    setup({ rows: [{ id: "a", title: "A", slug: "a", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0 }] });
    expect(button("Mover para outra coleção: A").disabled).toBe(true);
  });

  it("422 de destino inválido: avisa e recarrega a árvore", async () => {
    setup();
    api.failNext("PATCH /api/contents/lim", 422, "INVALID_PARENT");
    fireEvent.click(button("Mover para outra coleção: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Mover" }));
    await screen.findByText(/O destino não aceita este conteúdo/);
    expect(api.callsTo("GET", "/api/contents").length).toBeGreaterThan(0);
  });
});

describe("nova coleção (RF06, RN03)", () => {
  /** @param {string} name */
  const field = (name) => /** @type {HTMLInputElement} */ (screen.getByRole("textbox", { name }));

  it("abre com o foco no título e diz onde a coleção vai ficar", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    expect(screen.getByRole("dialog", { name: "Nova coleção" })).toBeTruthy();
    expect(document.activeElement).toBe(field("Título"));
    expect(inDialog().getByText(/Na raiz do seu espaço/)).toBeTruthy();
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    fireEvent.click(button("Nova subcoleção em: Cálculo"));
    expect(inDialog().getByText("Cálculo", { selector: "strong" })).toBeTruthy();
  });

  it("sugere o slug enquanto se digita o título, até a pessoa mexer no slug", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Álgebra Linear" } });
    expect(field("Slug (o final do endereço)").value).toBe("algebra-linear");
    fireEvent.change(field("Slug (o final do endereço)"), { target: { value: "algebra" } });
    fireEvent.change(field("Título"), { target: { value: "Álgebra Linear II" } });
    expect(field("Slug (o final do endereço)").value).toBe("algebra");
  });

  it("a sugestão já evita o slug de um irmão", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Cálculo" } });
    expect(field("Slug (o final do endereço)").value).toBe("calculo-2");
  });

  it("valida no navegador, com mensagem no campo, foco no primeiro erro e nada enviado", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    expect(inDialog().getByText("O título é obrigatório.")).toBeTruthy();
    expect(field("Título").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Título"));
    fireEvent.change(field("Título"), { target: { value: "Ok" } });
    fireEvent.change(field("Slug (o final do endereço)"), { target: { value: "Inválido!" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    expect(inDialog().getByText(/apenas letras minúsculas/)).toBeTruthy();
    expect(document.activeElement).toBe(field("Slug (o final do endereço)"));
    expect(api.callsTo("POST", "/api/contents")).toHaveLength(0);
  });

  it("criar envia POST como COLLECTION, recarrega e mostra a nova coleção", async () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Álgebra Linear" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    await screen.findByText(/A coleção Álgebra Linear foi criada\./);
    expect(api.callsTo("POST", "/api/contents")[0].body).toEqual({ title: "Álgebra Linear", slug: "algebra-linear", type: "COLLECTION", parentId: null });
    expect(screen.getByText("Álgebra Linear", { selector: "span[tabindex]" })).toBeTruthy();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("o Enter no campo confirma (o diálogo é um formulário)", async () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Física" } });
    fireEvent.submit(/** @type {HTMLFormElement} */ (dialog().querySelector("form")));
    await screen.findByText(/A coleção Física foi criada\./);
  });

  it("dentro de uma coleção: usa o pai, abre a coleção e leva o foco à nova", async () => {
    setup();
    fireEvent.click(button("Subitens de Cálculo")); // recolhida
    fireEvent.click(button("Nova subcoleção em: Cálculo"));
    fireEvent.change(field("Título"), { target: { value: "Integrais" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    await screen.findByText(/A coleção Integrais foi criada\./);
    expect(api.callsTo("POST", "/api/contents")[0].body.parentId).toBe("calc");
    expect(childIds("calc")).toContain("novo1");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Integrais"));
  });

  it("409: mantém o diálogo aberto, põe a sugestão do servidor no slug e explica", async () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Outro" } });
    fireEvent.change(field("Slug (o final do endereço)"), { target: { value: "sobre" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    await screen.findByText(/Já existe um conteúdo com este slug neste nível\. Sugerimos "sobre-2"/);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(field("Slug (o final do endereço)").value).toBe("sobre-2");
    await waitFor(() => expect(document.activeElement).toBe(field("Slug (o final do endereço)")));
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    await screen.findByText(/A coleção Outro foi criada\./);
  });

  it("422 da cota: mantém o diálogo aberto com a mensagem", async () => {
    setup({ limit: 8 });
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Nova" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Criar coleção" }));
    await screen.findByText(/Você atingiu o limite de conteúdos do seu espaço/);
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("Esc cancela sem enviar", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(document.querySelector("dialog")).toBeNull();
    expect(api.callsTo("POST", "/api/contents")).toHaveLength(0);
  });

  it("reabrir começa com os campos vazios", () => {
    setup();
    fireEvent.click(button("Nova coleção"));
    fireEvent.change(field("Título"), { target: { value: "Resto" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    fireEvent.click(button("Nova coleção"));
    expect(field("Título").value).toBe("");
    expect(field("Slug (o final do endereço)").value).toBe("");
  });
});

describe("a cota (RN25)", () => {
  it("no limite: os botões de criar ficam desabilitados, o link de documento some e há um aviso", () => {
    setup({ maxContents: 8 });
    expect(screen.getByText(/Você atingiu o limite de 8 conteúdos/)).toBeTruthy();
    expect(button("Nova coleção").disabled).toBe(true);
    expect(button("Novo documento").disabled).toBe(true);
    expect(screen.queryByRole("link", { name: "Novo documento" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Novo documento em:/ })).toBeNull();
    expect(button("Nova subcoleção em: Cálculo").disabled).toBe(true);
  });

  it("perto do limite (90%): avisa quantos faltam, sem bloquear", () => {
    const rows = Array.from({ length: 10 }, (_, i) => /** @type {Row} */ ({ id: `d${i}`, title: `Doc ${i}`, slug: `doc-${i}`, type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: i }));
    setup({ rows, maxContents: 11 });
    expect(screen.getByText(/Faltam 1 conteúdo para o limite de 11\./)).toBeTruthy();
    expect(button("Nova coleção").disabled).toBe(false);
  });

  it("longe do limite: nenhum aviso", () => {
    setup();
    expect(screen.queryByText(/limite de/)).toBeNull();
  });

  it("excluir libera a cota", async () => {
    setup({ maxContents: 8 });
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Sobre foi excluído/);
    expect(button("Nova coleção").disabled).toBe(false);
  });
});

describe("sessão e regiões vivas", () => {
  it("401 oferece o caminho para o login", async () => {
    setup();
    api.failNext("PATCH /api/contents/lim", 401, "UNAUTHENTICATED");
    fireEvent.click(button("Passar para rascunho: Limites"));
    await screen.findByText(/Sua sessão expirou/);
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
  });

  it("as mensagens ficam em regiões alert e status sempre presentes", () => {
    setup();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('[role="status"]')).not.toBeNull();
  });

  it("nunca chama window.confirm", async () => {
    setup();
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Sobre foi excluído/);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
