// @vitest-environment jsdom
// Editor em modo de moderação (RF34, RN18, RN19; M09, M20): o administrador edita o conteúdo de OUTRO
// usuário. Aviso permanente; o motivo é pedido a cada envio; o PATCH leva `reason` junto com `version`;
// o conflito de versão segue valendo; o rascunho local não colide com o do próprio administrador.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { Editor } from "@/components/editor/Editor";
import { draftStorageKey } from "@/components/editor/draft";
import { RendererStub } from "./editor-helpers";

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

const json = (/** @type {number} */ status, /** @type {unknown} */ body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** @param {...Response} responses uma resposta por chamada, na ordem */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const bodyOf = (/** @type {import("vitest").Mock<any>} */ fetchMock, call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

const INITIAL = { title: "Limites", slug: "limites", body: "# Limites", status: /** @type {const} */ ("PUBLISHED") };
const field = async (/** @type {string} */ label) => /** @type {HTMLInputElement} */ (await screen.findByLabelText(label));
const sendButton = () => screen.getByRole("button", { name: /Enviar nova versão|Enviando/ });
const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));
const reason = () => /** @type {HTMLTextAreaElement} */ (within(dialog()).getByLabelText("Motivo"));
const confirm = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Enviar" }));

function renderModerated(props = {}) {
  return render(<ContentEditor userId="admin1" contentId="c1" initialValue={INITIAL} version="v1" moderation={{ ownerName: "Ana Souza" }} {...props} />);
}

describe("o aviso permanente", () => {
  it("diz de quem é o conteúdo, que cada envio pede um motivo e que o dono vê o conflito", async () => {
    renderModerated();
    await field("Título");
    const note = screen.getByRole("note");
    expect(within(note).getByText("Ana Souza", { selector: "strong" })).toBeTruthy();
    expect(note.textContent).toMatch(/Você está editando o conteúdo de Ana Souza/);
    expect(note.textContent).toMatch(/Cada envio pede um motivo/);
  });

  it("sem moderação, não há aviso", async () => {
    render(<ContentEditor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" />);
    await field("Título");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("o nome do dono é texto puro", async () => {
    renderModerated({ moderation: { ownerName: "<img src=x onerror=alert(1)>" } });
    await field("Título");
    expect(document.querySelector("form img")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("o envio pede o motivo", () => {
  it("o clique em enviar NÃO envia: abre o diálogo de moderação, com o foco no motivo", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "c1", updatedAt: "v2" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Limites revisado" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog", { name: "Enviar a nova versão do conteúdo de Ana Souza" });
    expect(document.activeElement).toBe(reason());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(dialog()).getByText(/será notificada e verá este motivo/)).toBeTruthy();
  });

  it("o motivo vazio ou só de espaços não envia nada", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "c1", updatedAt: "v2" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Novo título" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    confirm();
    expect(within(dialog()).getByText("Informe o motivo.")).toBeTruthy();
    fireEvent.change(reason(), { target: { value: "  \n " } });
    confirm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o PATCH leva reason (aparado) JUNTO com version, e o texto é o do formulário", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "c1", updatedAt: "2026-10-07T10:00:00.000Z" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Limites revisado" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "  Corrigido um erro factual.  " } });
    confirm();
    await screen.findByText(/Nova versão enviada/);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/contents/c1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(bodyOf(fetchMock)).toEqual({ title: "Limites revisado", slug: "limites", body: "# Limites", status: "PUBLISHED", version: "v1", reason: "Corrigido um erro factual." });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("o próximo envio pede o motivo de novo (o anterior não é reaproveitado)", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "c1", updatedAt: "v2" } }), json(200, { data: { id: "c1", updatedAt: "v3" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Um" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Primeiro motivo" } });
    confirm();
    await screen.findByText(/Nova versão enviada/);
    fireEvent.change(await field("Título"), { target: { value: "Dois" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    expect(reason().value).toBe("");
    fireEvent.change(reason(), { target: { value: "Segundo motivo" } });
    confirm();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchMock, 1).reason).toBe("Segundo motivo");
    expect(bodyOf(fetchMock, 1).version).toBe("v2");
  });

  it("um envio comum (sem moderação) nunca leva reason", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "c1", updatedAt: "v2" } }));
    render(<ContentEditor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" />);
    fireEvent.change(await field("Título"), { target: { value: "Meu título" } });
    fireEvent.click(sendButton());
    await screen.findByText(/Nova versão enviada/);
    expect("reason" in bodyOf(fetchMock)).toBe(false);
  });

  it("cancelar o diálogo não envia e mantém o texto", async () => {
    const fetchMock = stubFetch(json(200, {}));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Rascunho do admin" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(document.querySelector("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await field("Título")).value).toBe("Rascunho do admin");
  });

  it("a recusa do motivo pelo servidor (422) aparece no diálogo, que segue aberto com o motivo; o texto fica na tela", async () => {
    const fetchMock = stubFetch(json(422, { error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "reason", message: "O motivo deve ter no máximo 500 caracteres." }] } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Título novo" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Meu motivo" } });
    confirm();
    await within(dialog()).findByText("O motivo deve ter no máximo 500 caracteres.");
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(reason().value).toBe("Meu motivo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await field("Título")).value).toBe("Título novo");
  });

  it("outro erro do servidor (500): fecha o diálogo e o editor mostra o erro, com o texto guardado neste navegador", async () => {
    stubFetch(json(500, { error: { code: "INTERNAL", message: "x", details: [] } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Texto que não pode se perder" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    confirm();
    await screen.findByText(/O servidor não conseguiu salvar agora/);
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.getByText(/O texto foi salvo neste navegador/)).toBeTruthy();
    expect((await field("Título")).value).toBe("Texto que não pode se perder");
  });

  it("403 do servidor (sem permissão): a mensagem do editor, sem perder o texto", async () => {
    stubFetch(json(403, { error: { code: "FORBIDDEN", message: "x", details: [] } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Meu texto" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    confirm();
    await screen.findByText(/Este conteúdo é de outro usuário e você não tem permissão/);
    expect((await field("Título")).value).toBe("Meu texto");
  });
});

describe("conflito de versão (RN18)", () => {
  /** O dono mexeu no texto depois que o administrador o abriu. */
  const conflict = () =>
    json(409, { error: { code: "VERSION_CONFLICT", message: "x", details: [{ field: "version", value: "v9" }] } });
  const serverNow = () => json(200, { data: { id: "c1", title: "Limites do dono", slug: "limites", body: "# Texto do dono", status: "PUBLISHED", updatedAt: "v9" } });

  it("mostra os dois textos, como no editor comum", async () => {
    stubFetch(conflict(), serverNow());
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Título do admin" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    confirm();
    await screen.findByRole("heading", { name: "Este conteúdo mudou no servidor" });
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.getByText("Versão do servidor")).toBeTruthy();
    expect(screen.getByText("O seu texto")).toBeTruthy();
  });

  it("'Enviar o meu texto' reaproveita o motivo já dado e usa a versão atual do servidor", async () => {
    const fetchMock = stubFetch(conflict(), serverNow(), json(200, { data: { id: "c1", updatedAt: "v10" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Título do admin" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo dado uma vez" } });
    confirm();
    await screen.findByRole("heading", { name: "Este conteúdo mudou no servidor" });
    fireEvent.click(screen.getByRole("button", { name: /Enviar o meu texto e substituir/ }));
    await screen.findByText(/Nova versão enviada/);
    const last = bodyOf(fetchMock, 2);
    expect(last).toMatchObject({ version: "v9", reason: "Motivo dado uma vez", title: "Título do admin" });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("'Ficar com o texto do servidor' descarta o motivo: o próximo envio pergunta de novo", async () => {
    stubFetch(conflict(), serverNow());
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Título do admin" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo antigo" } });
    confirm();
    await screen.findByRole("heading", { name: "Este conteúdo mudou no servidor" });
    fireEvent.click(screen.getByRole("button", { name: "Ficar com o texto do servidor" }));
    fireEvent.change(await field("Título"), { target: { value: "Outra edição" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    expect(reason().value).toBe("");
  });
});

describe("o rascunho local da moderação (não colide com o do administrador)", () => {
  const draft = (/** @type {string} */ title) => JSON.stringify({ values: { title, slug: "limites", body: "x", status: "DRAFT" }, baseVersion: "v1", savedAt: "2026-10-06T10:00:00.000Z" });

  it("usa uma chave PRÓPRIA, diferente da do administrador editando o que é dele", () => {
    const own = draftStorageKey("admin1", "c1");
    const moderated = draftStorageKey("admin1:moderacao", "c1");
    expect(moderated).not.toBe(own);
    expect(moderated).toContain("admin1:moderacao:c1");
  });

  it("salvar localmente na moderação grava sob a chave da moderação, sem tocar a do administrador", async () => {
    const own = draftStorageKey("admin1", "c1");
    localStorage.setItem(own, draft("Rascunho PRÓPRIO do admin"));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Rascunho da moderação" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar localmente" }));
    const moderatedKey = draftStorageKey("admin1:moderacao", "c1");
    expect(JSON.parse(localStorage.getItem(moderatedKey) ?? "null").values.title).toBe("Rascunho da moderação");
    expect(JSON.parse(localStorage.getItem(own) ?? "null").values.title).toBe("Rascunho PRÓPRIO do admin");
  });

  it("um rascunho do próprio administrador, com o mesmo conteúdo, NÃO é oferecido na moderação", async () => {
    localStorage.setItem(draftStorageKey("admin1", "c1"), draft("Rascunho PRÓPRIO do admin"));
    renderModerated();
    expect((await field("Título")).value).toBe("Limites");
    expect(screen.queryByText(/rascunho local/i)).toBeNull();
  });

  it("um rascunho da moderação é restaurado ao reabrir", async () => {
    localStorage.setItem(draftStorageKey("admin1:moderacao", "c1"), draft("Rascunho guardado da moderação"));
    renderModerated();
    expect((await field("Título")).value).toBe("Rascunho guardado da moderação");
  });

  it("depois de ENVIADO, o rascunho da moderação não fica guardado", async () => {
    stubFetch(json(200, { data: { id: "c1", updatedAt: "v2" } }));
    renderModerated();
    fireEvent.change(await field("Título"), { target: { value: "Texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar localmente" }));
    expect(localStorage.getItem(draftStorageKey("admin1:moderacao", "c1"))).not.toBeNull();
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    confirm();
    await screen.findByText(/Nova versão enviada/);
    expect(localStorage.getItem(draftStorageKey("admin1:moderacao", "c1"))).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});

describe("o Editor direto", () => {
  it("entrega o motivo a onSubmit junto com a versão", async () => {
    const onSubmit = vi.fn(async () => ({ ok: /** @type {const} */ (true), id: "c1", version: "v2" }));
    render(<Editor userId="admin1" contentId="c1" initialValue={INITIAL} version="v1" onSubmit={onSubmit} moderation={{ ownerName: "Ana" }} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Novo" } });
    fireEvent.click(sendButton());
    await screen.findByRole("dialog");
    fireEvent.change(reason(), { target: { value: " Motivo " } });
    confirm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][1]).toEqual({ version: "v1", reason: "Motivo" });
  });

  it("sem moderação, o contexto é só { version }", async () => {
    const onSubmit = vi.fn(async () => ({ ok: /** @type {const} */ (true), id: "c1", version: "v2" }));
    render(<Editor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Novo" } });
    fireEvent.click(sendButton());
    await screen.findByText(/Nova versão enviada/);
    expect(onSubmit.mock.calls[0][1]).toEqual({ version: "v1" });
  });
});
