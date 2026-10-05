// @vitest-environment jsdom
// Versão do conteúdo e conflito de versão no editor (RN18; CT53, parte do editor; UC05, fluxo A6):
// o PATCH envia `version`; no 409 VERSION_CONFLICT o editor mostra o texto do servidor e o do
// autor e deixa o autor escolher qual enviar, sem perder nenhum. A página do editor ainda não
// existe (Parte 3 do Core): o fluxo é provado aqui, com o ContentEditor sobre um fetch simulado.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { draftStorageKey, readDraft } from "@/components/editor/draft";
import { RendererStub, renderEditor, send, saveLocal, title, body, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

const OPENED = "2026-10-02T12:00:00.000Z";
const SAVED = "2026-10-02T12:10:00.000Z";
const CURRENT = "2026-10-02T12:30:00.000Z";
const NEWER = "2026-10-02T12:45:00.000Z";
const DRAFT_KEY = draftStorageKey("u1", "c1");

const jsonResponse = (/** @type {number} */ status, /** @type {unknown} */ payload) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const ok = (/** @type {string} */ updatedAt) => jsonResponse(200, { data: { id: "c1", updatedAt } });
const versionConflict = (/** @type {string} */ currentVersion) =>
  jsonResponse(409, { error: { code: "VERSION_CONFLICT", message: "O conteúdo foi alterado depois da versão aberta.", details: [{ field: "version", value: currentVersion }] } });
const serverCopy = (/** @type {string} */ updatedAt, texto = "texto do servidor") =>
  jsonResponse(200, { data: { id: "c1", title: "Aula do servidor", slug: "aula-do-servidor", body: texto, status: "DRAFT", updatedAt } });

/** @param {...(Response | (() => Promise<Response>))} responses uma por chamada, na ordem */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (typeof response === "function") fetchMock.mockImplementationOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** @param {import("vitest").Mock<any>} fetchMock @param {number} call */
function call(fetchMock, call) {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const OPEN = { title: "Aula", slug: "aula", body: "texto aberto", status: /** @type {const} */ ("PUBLISHED") };

async function openEditor() {
  render(<ContentEditor userId="u1" contentId="c1" initialValue={OPEN} version={OPENED} />);
  await screen.findByLabelText("Título");
}

/** Edita o texto como o autor faria e envia. */
async function editAndSend(texto = "o meu texto novo") {
  fireEvent.change(await screen.findByLabelText("Texto do documento (Markdown)"), { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar nova versão/ }));
}

const panel = () => screen.queryByRole("region", { name: "Este conteúdo mudou no servidor" });

describe("o PATCH envia a versão (RN18)", () => {
  it("a versão aberta no primeiro envio e a devolvida pelo servidor nos seguintes", async () => {
    const fetchMock = stubFetch(ok(SAVED), ok(CURRENT));
    await openEditor();

    await editAndSend("primeira edição");
    await screen.findByText(/Nova versão enviada/);
    expect(call(fetchMock, 0)).toMatchObject({ url: "/api/contents/c1", method: "PATCH", body: { body: "primeira edição", version: OPENED } });

    await editAndSend("segunda edição");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(call(fetchMock, 1).body).toMatchObject({ body: "segunda edição", version: SAVED });
  });

  it("depois de criar (POST, sem version), os envios seguintes levam a versão devolvida na criação", async () => {
    const fetchMock = stubFetch(jsonResponse(201, { data: { id: "novo", updatedAt: SAVED } }), ok(CURRENT));
    render(<ContentEditor userId="u1" contentId={null} initialValue={{ title: "Aula", slug: "aula", status: "PUBLISHED" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Enviar nova versão/ }));
    await screen.findByText(/Nova versão enviada/);
    expect(call(fetchMock, 0).body).not.toHaveProperty("version");

    await editAndSend("depois");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(call(fetchMock, 1)).toMatchObject({ method: "PATCH", body: { version: SAVED } });
  });
});

describe("409 VERSION_CONFLICT: o autor vê os dois textos e escolhe (RN18, CT53)", () => {
  it("mostra o texto do servidor e o do autor, não envia mais nada e guarda o do autor no navegador", async () => {
    const fetchMock = stubFetch(versionConflict(CURRENT), serverCopy(CURRENT, "# texto do servidor"));
    await openEditor();
    await editAndSend("# o meu texto novo");

    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });
    // Os dois textos, lado a lado, como foram escritos.
    expect(within(region).getByLabelText("Texto: Versão do servidor").textContent).toBe("# texto do servidor");
    expect(within(region).getByLabelText("Texto: O seu texto").textContent).toBe("# o meu texto novo");
    expect(within(region).getByText("Aula do servidor")).toBeTruthy();
    expect(within(region).getByText("Rascunho")).toBeTruthy(); // estado do servidor
    // PATCH e GET, e nada mais: o conflito não sobrescreve nada.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(fetchMock, 1)).toMatchObject({ url: "/api/contents/c1", method: "GET" });
    // O texto do autor está guardado neste navegador enquanto ele decide.
    expect(readDraft(DRAFT_KEY)?.values.body).toBe("# o meu texto novo");
    // O foco vai para o título do painel, que o leitor de tela anuncia.
    await waitFor(() => expect(document.activeElement).toBe(within(region).getByRole("heading", { name: "Este conteúdo mudou no servidor" })));
  });

  it("enquanto o autor não decide, enviar e salvar localmente ficam bloqueados", async () => {
    const fetchMock = stubFetch(versionConflict(CURRENT), serverCopy(CURRENT));
    await openEditor();
    await editAndSend();
    await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });

    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (saveLocal()).disabled).toBe(true);
    fireEvent.keyDown(body(), { key: "s", ctrlKey: true }); // o atalho não passa pelo botão
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readDraft(DRAFT_KEY)?.values.body).toBe("o meu texto novo");
  });

  it("enviar o meu texto: reenvia com a versão ATUAL do servidor (sobrescrever é escolha explícita)", async () => {
    const fetchMock = stubFetch(versionConflict(CURRENT), serverCopy(CURRENT), ok(NEWER));
    await openEditor();
    await editAndSend("# o meu texto novo");
    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });

    fireEvent.click(within(region).getByRole("button", { name: "Enviar o meu texto e substituir o do servidor" }));
    expect(await screen.findByText(/Nova versão enviada/)).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(fetchMock, 2)).toMatchObject({
      url: "/api/contents/c1",
      method: "PATCH",
      body: { title: "Aula", slug: "aula", body: "# o meu texto novo", status: "PUBLISHED", version: CURRENT },
    });
    expect(panel()).toBeNull();
    expect(body().value).toBe("# o meu texto novo");
    expect(readDraft(DRAFT_KEY)).toBeNull(); // enviado: a cópia local deixa de ser necessária
    // E o próximo envio já parte da versão que o servidor devolveu.
    await editAndSend("depois");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("ficar com o texto do servidor: ele vai para o formulário e o do autor continua guardado", async () => {
    const fetchMock = stubFetch(versionConflict(CURRENT), serverCopy(CURRENT, "# texto do servidor"), ok(NEWER));
    await openEditor();
    await editAndSend("# o meu texto novo");
    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });

    fireEvent.click(within(region).getByRole("button", { name: "Ficar com o texto do servidor" }));

    expect(panel()).toBeNull();
    expect(title().value).toBe("Aula do servidor");
    expect(body().value).toBe("# texto do servidor");
    expect(screen.getByText(/Texto do servidor carregado\. O seu texto continua salvo neste navegador\./)).toBeTruthy();
    // O texto do autor continua no navegador, feito sobre a versão antiga (a próxima abertura o oferece).
    expect(readDraft(DRAFT_KEY)).toMatchObject({ values: { body: "# o meu texto novo" }, baseVersion: OPENED });
    expect(fetchMock).toHaveBeenCalledTimes(2); // nada foi enviado ao escolher

    // O editor volta a funcionar, partindo da versão atual do servidor.
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(false);
    await editAndSend("# continuando do texto do servidor");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(call(fetchMock, 2).body).toMatchObject({ body: "# continuando do texto do servidor", version: CURRENT });
  });

  it("se o conteúdo mudou de novo ao sobrescrever, o painel volta com o texto mais novo (nada é sobrescrito)", async () => {
    const fetchMock = stubFetch(
      versionConflict(CURRENT),
      serverCopy(CURRENT, "segunda versão"),
      versionConflict(NEWER),
      serverCopy(NEWER, "terceira versão"),
    );
    await openEditor();
    await editAndSend("o meu texto novo");
    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });
    fireEvent.click(within(region).getByRole("button", { name: /Enviar o meu texto/ }));

    await waitFor(() => expect(screen.getByLabelText("Texto: Versão do servidor").textContent).toBe("terceira versão"));
    expect(call(fetchMock, 2).body.version).toBe(CURRENT);
    expect(screen.getByLabelText("Texto: O seu texto").textContent).toBe("o meu texto novo");
    expect(readDraft(DRAFT_KEY)?.values.body).toBe("o meu texto novo");
  });

  it("sem conseguir o texto do servidor, não há o que comparar: só o aviso, o texto guardado e nada sobrescrito", async () => {
    const fetchMock = stubFetch(versionConflict(CURRENT), jsonResponse(404, { error: { code: "NOT_FOUND", message: "x", details: [] } }), versionConflict(CURRENT), serverCopy(CURRENT));
    await openEditor();
    await editAndSend("o meu texto novo");

    const alert = await screen.findByText(/não foi possível carregar a versão atual para comparar/);
    expect(alert.textContent).toMatch(/O texto foi salvo neste navegador\./);
    expect(panel()).toBeNull();
    expect(body().value).toBe("o meu texto novo");

    // Enviar de novo repete a tentativa com a versão antiga (não sobrescreve), e agora mostra os dois.
    fireEvent.click(send());
    await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });
    expect(call(fetchMock, 2).body.version).toBe(OPENED);
  });

  it("o texto do servidor aparece como texto, nunca como HTML", async () => {
    stubFetch(versionConflict(CURRENT), serverCopy(CURRENT, "<img src=x onerror=alert(1)> <b>negrito</b>"));
    await openEditor();
    await editAndSend();
    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });
    expect(region.querySelector("img")).toBeNull();
    expect(region.querySelector("b")).toBeNull();
    expect(within(region).getByLabelText("Texto: Versão do servidor").textContent).toBe("<img src=x onerror=alert(1)> <b>negrito</b>");
  });
});

describe("mensagens em português dos erros novos da API (R-009)", () => {
  it("422 sem version: explica, mantém o texto e o guarda no navegador", async () => {
    stubFetch(jsonResponse(422, { error: { code: "VALIDATION_ERROR", message: "Dados inválidos.", details: [{ field: "version", message: "Informe a versão em que o texto se baseou (campo version)." }] } }));
    await openEditor();
    await editAndSend("o meu texto novo");

    const alert = await screen.findByText(/não informou a versão em que o texto se baseou/);
    expect(alert.textContent).toMatch(/Recarregue a página e envie de novo\./);
    expect(alert.textContent).toMatch(/O texto foi salvo neste navegador\./);
    expect(body().value).toBe("o meu texto novo");
    expect(readDraft(DRAFT_KEY)?.values.body).toBe("o meu texto novo");
  });

  it("403 do conteúdo de outro usuário: mensagem própria e o texto guardado", async () => {
    stubFetch(jsonResponse(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta operação.", details: [] } }));
    await openEditor();
    await editAndSend("o meu texto novo");

    const alert = await screen.findByText(/Este conteúdo é de outro usuário e você não tem permissão para alterá-lo\./);
    expect(alert.textContent).toMatch(/O texto foi salvo neste navegador\./);
    expect(readDraft(DRAFT_KEY)?.values.body).toBe("o meu texto novo");
  });
});

describe("Editor: o contexto do envio (RN18)", () => {
  it("passa a versão aberta ao onSubmit e, depois de um envio, a que ele devolveu", async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce({ ok: true, id: "c1", version: "v2" }).mockResolvedValueOnce({ ok: true, id: "c1", version: "v3" });
    renderEditor({ onSubmit });

    type(title(), "Cálculo 2");
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][1]).toEqual({ version: "v1" });

    await screen.findByText(/Nova versão enviada/);
    type(title(), "Cálculo 3");
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toEqual({ version: "v2" });
  });

  it("no conflito, o onSubmit de sobrescrever recebe a versão do servidor", async () => {
    const server = { version: "v9", values: { title: "Do servidor", slug: "do-servidor", body: "texto dele", status: /** @type {const} */ ("PUBLISHED") } };
    const conflict = { ok: false, kind: "version-conflict", message: "m", fieldErrors: [], currentVersion: "v9", server };
    const onSubmit = vi.fn().mockResolvedValueOnce(conflict).mockResolvedValueOnce({ ok: true, id: "c1", version: "v10" });
    renderEditor({ onSubmit });

    type(body(), "o meu texto");
    fireEvent.click(send());
    fireEvent.click(await screen.findByRole("button", { name: /Enviar o meu texto/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[0][1]).toEqual({ version: "v1" });
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ body: "o meu texto" });
    expect(onSubmit.mock.calls[1][1]).toEqual({ version: "v9" });
  });

  it("uma versão que não é data não derruba o painel: só some a hora da mudança", async () => {
    const server = { version: "v9", values: { title: "Do servidor", slug: "do-servidor", body: "texto dele", status: /** @type {const} */ ("PUBLISHED") } };
    renderEditor({ onSubmit: vi.fn().mockResolvedValueOnce({ ok: false, kind: "version-conflict", message: "m", fieldErrors: [], currentVersion: "v9", server }) });
    fireEvent.click(send());
    const region = await screen.findByRole("region", { name: "Este conteúdo mudou no servidor" });
    expect(region.textContent).toMatch(/foi alterado depois de você abri-lo \(em outra aba/);
  });
});
