// @vitest-environment jsdom
// Árvore de OUTRO usuário em modo de moderação (RF34, UC15; RN07, RN19, RN26): a estrutura é só leitura
// e as ações são abrir, despublicar e excluir, sempre com motivo. API simulada com estado.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ContentTree } from "@/components/admin/ContentTree";
import { deleteWithReason, fetchTree, unpublishWithReason } from "@/components/admin/content-tree-client";

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

/** @typedef {{ id: string, title: string, slug: string, type: "DOCUMENT" | "COLLECTION", status: "PUBLISHED" | "DRAFT", parentId: string | null, order: number }} Row */
/** @type {Row[]} */
const SAMPLE = [
  { id: "calc", title: "Cálculo", slug: "calculo", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 0 },
  { id: "lim", title: "Limites", slug: "limites", type: "DOCUMENT", status: "PUBLISHED", parentId: "calc", order: 0 },
  { id: "der", title: "Derivadas", slug: "derivadas", type: "DOCUMENT", status: "DRAFT", parentId: "calc", order: 1 },
  { id: "sobre", title: "Sobre", slug: "sobre", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 1 },
];

/** @param {Row[]} rows @param {string | null} [parentId] @returns {any[]} */
const buildTree = (rows, parentId = null) =>
  rows.filter((r) => r.parentId === parentId).sort((a, b) => a.order - b.order).map((r) => ({ ...r, children: r.type === "COLLECTION" ? buildTree(rows, r.id) : [] }));

/** @param {Row[]} initial */
function fakeApi(initial) {
  let rows = structuredClone(initial);
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  /** @type {Map<string, () => Response>} */
  const failures = new Map();
  const json = (/** @type {unknown} */ body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const problem = (/** @type {string} */ code, /** @type {number} */ status, /** @type {unknown[]} */ details = []) => json({ error: { code, message: "mensagem do servidor", details } }, status);
  /** @param {string} id @returns {string[]} */
  const withDescendants = (id) => [id, ...rows.filter((r) => r.parentId === id).flatMap((r) => withDescendants(r.id))];

  /** @param {string} url @param {RequestInit} [init] */
  async function handle(url, init = {}) {
    const method = init.method ?? "GET";
    const full = String(url);
    const [path, query = ""] = full.split("?");
    const params = new URLSearchParams(query);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: full, body });
    const key = `${method} ${path}`;
    const failure = failures.get(key);
    if (failure) {
      failures.delete(key);
      return failure();
    }
    if (method === "GET" && path === "/api/contents") return json({ data: buildTree(rows) });
    const match = path.match(/^\/api\/contents\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const row = rows.find((r) => r.id === id);
      if (!row) return problem("NOT_FOUND", 404);
      if (method === "PATCH") {
        if (body.parentId !== undefined || body.order !== undefined) return problem("FORBIDDEN", 403);
        if (!body.reason || !String(body.reason).trim()) return problem("VALIDATION_ERROR", 422, [{ field: "reason", message: "Informe o motivo." }]);
        row.status = body.status;
        return json({ data: row });
      }
      if (method === "DELETE") {
        if (!params.get("reason")?.trim()) return problem("VALIDATION_ERROR", 422, [{ field: "reason", message: "Informe o motivo." }]);
        const gone = new Set(withDescendants(id));
        rows = rows.filter((r) => !gone.has(r.id));
        return new Response(null, { status: 204 });
      }
    }
    return problem("NOT_FOUND", 404);
  }

  return {
    calls,
    fetch: vi.fn(handle),
    /** @param {string} key @param {number} status @param {string} code @param {unknown[]} [details] */
    failNext(key, status, code, details = []) {
      failures.set(key, () => problem(code, status, details));
    },
    /** @param {string} method @param {string} prefix */
    callsTo: (method, prefix) => calls.filter((c) => c.method === method && c.path.startsWith(prefix)),
    removeBehindTheScenes(/** @type {string} */ id) {
      const gone = new Set(withDescendants(id));
      rows = rows.filter((r) => !gone.has(r.id));
    },
  };
}

/** @type {ReturnType<typeof fakeApi>} */
let api;

/** @param {{ rows?: Row[], ownerName?: string }} [options] */
function setup({ rows = SAMPLE, ownerName = "Ana Souza" } = {}) {
  api = fakeApi(rows);
  vi.stubGlobal("fetch", api.fetch);
  return render(
    <ContentTree
      initialTree={buildTree(rows)}
      editHref="/admin/usuarios/ana/conteudo/{id}"
      newHref="/nunca-usado"
      moderation={{ ownerId: "ana", ownerName }}
    />,
  );
}

const li = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[data-node-id="${id}"]`));
const button = (/** @type {RegExp | string} */ name) => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name }));
const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));
const inDialog = () => within(dialog());
const reason = () => /** @type {HTMLTextAreaElement} */ (inDialog().getByLabelText("Motivo"));
const ids = () => [...document.querySelectorAll("li[data-node-id]")].map((el) => el.getAttribute("data-node-id"));

describe("a estrutura é só leitura", () => {
  it("um aviso fixo diz de quem é o conteúdo e o que se pode fazer", () => {
    setup();
    const note = screen.getByRole("note");
    expect(within(note).getByText("Ana Souza", { selector: "strong" })).toBeTruthy();
    expect(note.textContent).toMatch(/A estrutura é só leitura/);
    expect(note.textContent).toMatch(/sempre informando um motivo/);
    expect(screen.getByRole("region", { name: "Conteúdo de Ana Souza" })).toBeTruthy();
  });

  it("não há reordenar, mover, publicar, criar coleção nem novo documento, em nenhuma linha", () => {
    setup();
    for (const pattern of [/^Subir:/, /^Descer:/, /^Mover/, /^Publicar:/, /^Passar para rascunho:/, /^Nova subcoleção/, /^Nova coleção$/]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: /^Novo documento/ })).toBeNull();
    expect(document.querySelector('a[href="/nunca-usado"]')).toBeNull();
  });

  it("não fala de cota (a cota é do dono)", () => {
    setup();
    expect(screen.getByText(/4 conteúdos \(3 publicados, 1 rascunho\)\./)).toBeTruthy();
    expect(screen.queryByText(/de 500/)).toBeNull();
    expect(screen.queryByText(/limite de/)).toBeNull();
  });

  it("por nó: abrir (só documentos), despublicar (só publicados) e excluir", () => {
    setup();
    expect(within(li("lim")).getByRole("link", { name: "Abrir para moderar: Limites" }).getAttribute("href")).toBe("/admin/usuarios/ana/conteudo/lim");
    expect(within(li("calc")).queryByRole("link", { name: /Abrir para moderar: Cálculo/ })).toBeNull(); // coleção: nada a abrir
    expect(button("Despublicar: Limites")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Despublicar: Derivadas" })).toBeNull();
    expect(within(li("der")).getByText("Já é rascunho")).toBeTruthy();
    expect(button("Despublicar: Cálculo")).toBeTruthy();
    expect(button("Excluir: Sobre")).toBeTruthy();
  });

  it("os rascunhos do dono aparecem (o administrador os vê)", () => {
    setup();
    expect(ids()).toContain("der");
    expect(within(li("der")).getAllByTestId("status")[0].textContent).toBe("Rascunho");
  });

  it("título e nome do dono são texto puro", () => {
    setup({ ownerName: "<b>Dona</b>", rows: [{ id: "x", title: "<img src=x onerror=alert(1)><script>1</script>", slug: "x", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0 }] });
    expect(document.querySelector("section img, section script, section b")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("<b>Dona</b>");
  });
});

describe("despublicar com motivo", () => {
  it("abre o diálogo de moderação com o foco no motivo e o aviso de que o dono o verá", () => {
    setup();
    button("Despublicar: Limites").focus();
    fireEvent.click(button("Despublicar: Limites"));
    expect(screen.getByRole("dialog", { name: 'Despublicar o documento "Limites"?' })).toBeTruthy();
    expect(document.activeElement).toBe(reason());
    expect(inDialog().getByText(/será notificada e verá este motivo/)).toBeTruthy();
    expect(inDialog().getByText("Ana Souza", { selector: "strong" })).toBeTruthy();
  });

  it("o motivo vazio ou só de espaços não é enviado", () => {
    setup();
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    fireEvent.change(reason(), { target: { value: "   " } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    expect(inDialog().getByText("Informe o motivo.")).toBeTruthy();
    expect(api.callsTo("PATCH", "/api/contents")).toHaveLength(0);
  });

  it("envia { status: DRAFT, reason } com o motivo aparado, passa o nó a rascunho e diz que o dono foi notificado", async () => {
    setup();
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.change(reason(), { target: { value: "  Texto ofensivo.  " } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    await screen.findByText(/Limites passou para rascunho\. Ana Souza foi notificado\(a\) e vê o motivo\./);
    expect(api.callsTo("PATCH", "/api/contents/lim")[0].body).toEqual({ status: "DRAFT", reason: "Texto ofensivo." });
    expect(within(li("lim")).getAllByTestId("status")[0].textContent).toBe("Rascunho");
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Despublicar: Limites" })).toBeNull();
  });

  it("nunca envia parentId nem order (mover não é moderação)", async () => {
    setup();
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    await screen.findByText(/passou para rascunho/);
    const body = api.callsTo("PATCH", "/api/contents/lim")[0].body;
    expect("parentId" in body || "order" in body).toBe(false);
  });

  it("uma coleção diz quantos publicados saem do ar", () => {
    setup();
    fireEvent.click(button("Despublicar: Cálculo"));
    expect(inDialog().getByText(/1 conteúdo publicado dentro dela deixa de aparecer/)).toBeTruthy();
  });

  it("o 403 do servidor aparece DENTRO do diálogo, que segue aberto com o motivo digitado", async () => {
    setup();
    api.failNext("PATCH /api/contents/lim", 403, "FORBIDDEN");
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.change(reason(), { target: { value: "Meu motivo" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    await inDialog().findByText("Você não tem permissão para esta operação.");
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(reason().value).toBe("Meu motivo");
    expect(within(li("lim")).getAllByTestId("status")[0].textContent).toBe("Publicado");
  });

  it("a recusa do motivo pelo servidor (422) mostra a mensagem dele no diálogo", async () => {
    setup();
    api.failNext("PATCH /api/contents/lim", 422, "VALIDATION_ERROR", [{ field: "reason", message: "O motivo deve ter no máximo 500 caracteres." }]);
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.change(reason(), { target: { value: "x" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    await inDialog().findByText("O motivo deve ter no máximo 500 caracteres.");
  });

  it("um nó que o dono já excluiu (404): fecha, avisa e recarrega a árvore DO DONO (?ownerId=)", async () => {
    setup();
    api.removeBehindTheScenes("lim");
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Despublicar" }));
    await screen.findByText(/não existe mais/);
    await waitFor(() => expect(ids()).not.toContain("lim"));
    expect(api.callsTo("GET", "/api/contents").at(-1)?.path).toBe("/api/contents?ownerId=ana");
  });

  it("Esc cancela sem enviar", () => {
    setup();
    fireEvent.click(button("Despublicar: Limites"));
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(document.querySelector("dialog")).toBeNull();
    expect(api.callsTo("PATCH", "/api/contents")).toHaveLength(0);
  });
});

describe("excluir com motivo", () => {
  it("diz quantos itens saem junto e usa o diálogo de moderação em perigo", () => {
    setup();
    fireEvent.click(button("Excluir: Cálculo"));
    expect(screen.getByRole("alertdialog", { name: 'Excluir a coleção "Cálculo"?' })).toBeTruthy();
    expect(inDialog().getByText(/2 itens que estão dentro serão excluídos junto/)).toBeTruthy();
    expect(inDialog().getByLabelText("Motivo")).toBeTruthy();
  });

  it("o motivo vazio não exclui", () => {
    setup();
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    expect(inDialog().getByText("Informe o motivo.")).toBeTruthy();
    expect(api.callsTo("DELETE", "/api/contents")).toHaveLength(0);
  });

  it("envia DELETE ?reason= (aparado e codificado), tira a subárvore e avisa que o dono foi notificado", async () => {
    setup();
    fireEvent.click(button("Excluir: Cálculo"));
    fireEvent.change(reason(), { target: { value: "  Plágio & cópia  " } });
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Cálculo foi excluído, com 2 itens que estavam dentro\. Ana Souza foi notificado\(a\) e vê o motivo\./);
    expect(api.callsTo("DELETE", "/api/contents/calc")[0].path).toBe("/api/contents/calc?reason=Pl%C3%A1gio%20%26%20c%C3%B3pia");
    expect(ids()).toEqual(["sobre"]);
  });

  it("uma falha fica no diálogo, aberto, com o motivo; nada sai da árvore", async () => {
    setup();
    api.failNext("DELETE /api/contents/sobre", 403, "FORBIDDEN");
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.change(reason(), { target: { value: "Motivo digitado" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await inDialog().findByText("Você não tem permissão para esta operação.");
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(reason().value).toBe("Motivo digitado");
    expect(ids()).toContain("sobre");
  });

  it("depois de uma falha, dá para tentar de novo", async () => {
    setup();
    api.failNext("DELETE /api/contents/sobre", 500, "INTERNAL");
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await inDialog().findByText(/O servidor não conseguiu atender agora/);
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Sobre foi excluído/);
    expect(ids()).not.toContain("sobre");
  });

  it("o foco vai ao vizinho que ficou", async () => {
    setup();
    fireEvent.click(button("Excluir: Sobre"));
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Sobre foi excluído/);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cálculo"));
  });
});

describe("cliente (content-tree-client)", () => {
  it("fetchTree com ownerId lê a árvore do outro usuário, com o id codificado", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await fetchTree(fetchImpl, "a b");
    expect(fetchImpl).toHaveBeenCalledWith("/api/contents?ownerId=a%20b", { cache: "no-store" });
    await fetchTree(fetchImpl);
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/contents", { cache: "no-store" });
  });

  it("unpublishWithReason e deleteWithReason enviam o motivo", async () => {
    const ok = () => vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const patch = ok();
    await unpublishWithReason("x", "Spam", patch);
    expect(JSON.parse(patch.mock.calls[0][1].body)).toEqual({ status: "DRAFT", reason: "Spam" });
    const del = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await deleteWithReason("x", "Spam", del)).toEqual({ ok: true });
    expect(del.mock.calls[0][0]).toBe("/api/contents/x?reason=Spam");
    expect(del.mock.calls[0][1].method).toBe("DELETE");
  });

  it("a recusa do motivo (422) traz a mensagem do campo reason", async () => {
    const fail = vi.fn(async () => new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "reason", message: "Informe o motivo." }] } }), { status: 422 }));
    expect(await unpublishWithReason("x", "", fail)).toMatchObject({ ok: false, kind: "rejected", message: "Informe o motivo." });
  });
});
