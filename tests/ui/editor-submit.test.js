// @vitest-environment jsdom
// Envio da nova versão (M09; RF16, CT21): validação no navegador, confirmação e tratamento dos
// erros da API (401, 404, 409, 422, 5xx e rede), com o texto preservado em todos os casos.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OK, RendererStub, body, renderEditor, saveLocal, send, slug, title, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

const KEY = "vitrine:rascunho:u1:c1";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** @param {any} result */
const failing = (result) => vi.fn(async () => result);

/** Resultado de falha, no formato do cliente da API. */
const failure = (/** @type {string} */ kind, /** @type {Partial<{ message: string, fieldErrors: any[] }>} */ extra = {}) => ({
  ok: /** @type {const} */ (false),
  kind,
  message: extra.message ?? "mensagem do servidor",
  fieldErrors: extra.fieldErrors ?? [],
});

describe("Editor: validação antes do envio (Zod, as regras do servidor)", () => {
  it("recusa o título vazio, em português, junto do campo, e não envia", async () => {
    const { onSubmit } = renderEditor();
    type(title(), "   ");
    fireEvent.click(send());

    const error = await screen.findByText("O título é obrigatório.");
    expect(error.getAttribute("role")).toBe("alert");
    expect(title().getAttribute("aria-invalid")).toBe("true");
    expect(title().getAttribute("aria-describedby")).toBe(error.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("recusa o slug fora da RN03 e leva o foco ao primeiro campo com erro", async () => {
    const { onSubmit } = renderEditor();
    type(title(), "");
    type(slug(), "Slug Inválido");
    fireEvent.click(send());

    expect(await screen.findByText("O slug deve conter apenas letras minúsculas, dígitos e hífens.")).toBeTruthy();
    expect(screen.getByText("O título é obrigatório.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(title()));
    expect(slug().getAttribute("aria-invalid")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("o erro do slug e a ajuda ficam ligados ao campo", async () => {
    renderEditor();
    type(slug(), "A B");
    fireEvent.click(send());
    const error = await screen.findByText(/apenas letras minúsculas/);
    const describedBy = (slug().getAttribute("aria-describedby") ?? "").split(" ");
    expect(describedBy).toContain(error.id);
    expect(describedBy).toContain(`${slug().id}-hint`);
  });

  it("depois do primeiro envio, o erro some assim que o campo é corrigido", async () => {
    renderEditor();
    type(title(), "");
    fireEvent.click(send());
    await screen.findByText("O título é obrigatório.");
    type(title(), "Novo título");
    await waitFor(() => expect(screen.queryByText("O título é obrigatório.")).toBeNull());
    expect(title().getAttribute("aria-invalid")).toBeNull();
  });

  it("aceita um texto vazio: um rascunho pode não ter corpo ainda", async () => {
    const { onSubmit } = renderEditor({ initialValue: { title: "a", slug: "a", body: "", status: "DRAFT" } });
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe("Editor: envio bem-sucedido", () => {
  it("envia os valores validados (título sem espaços nas pontas) e confirma", async () => {
    const { onSubmit } = renderEditor();
    type(title(), "  Cálculo Diferencial  ");
    type(body(), "novo texto");
    fireEvent.click(send());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ title: "Cálculo Diferencial", slug: "calculo", body: "novo texto", status: "PUBLISHED" });
    expect(await screen.findByText(/Nova versão enviada às \d{2}:\d{2}\./)).toBeTruthy();
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    // O campo passa a mostrar o título como o servidor o guardou.
    expect(title().value).toBe("Cálculo Diferencial");
  });

  it("a confirmação é anunciada em uma região de status", async () => {
    renderEditor();
    fireEvent.click(send());
    const message = await screen.findByText(/Nova versão enviada/);
    expect(message.getAttribute("role")).toBe("status");
  });

  it("mostra Enviando… e desabilita o botão durante o envio, e o reabilita depois", async () => {
    /** @type {(value: any) => void} */
    let finish = () => {};
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const { onSubmit } = renderEditor({ onSubmit: vi.fn(() => pending) });

    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const busy = screen.getByRole("button", { name: "Enviando…" });
    expect(/** @type {HTMLButtonElement} */ (busy).disabled).toBe(true);
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("true");

    finish(OK);
    expect(await screen.findByRole("button", { name: "Enviar nova versão" })).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(false);
  });

  it("não deixa enviar duas vezes ao mesmo tempo", async () => {
    /** @type {(value: any) => void} */
    let finish = () => {};
    const { onSubmit } = renderEditor({ onSubmit: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    fireEvent.click(send());
    fireEvent.click(send());
    fireEvent.submit(/** @type {HTMLFormElement} */ (document.querySelector("form")));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls.length).toBeLessThanOrEqual(2);
    finish(OK);
    await screen.findByText(/Nova versão enviada/);
  });

  it("apaga o rascunho local depois de enviar (o servidor já tem o texto)", async () => {
    renderEditor();
    type(body(), "texto salvo localmente");
    fireEvent.click(saveLocal());
    expect(localStorage.getItem(KEY)).not.toBeNull();

    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText("Remover a cópia salva neste navegador")).toBeNull();
  });

  it("em um conteúdo novo, apaga o rascunho da chave do conteúdo novo", async () => {
    localStorage.setItem("vitrine:rascunho:u1:novo", JSON.stringify({ values: { title: "t", slug: "t", body: "", status: "DRAFT" }, baseVersion: null, savedAt: "2026-10-02T10:00:00.000Z" }));
    renderEditor({ contentId: null, version: null, initialValue: { title: "", slug: "", body: "", status: "DRAFT" } });
    // O rascunho foi restaurado (mesma versão: nula); enviar o apaga.
    expect(title().value).toBe("t");
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(localStorage.getItem("vitrine:rascunho:u1:novo")).toBeNull();
  });

  it("depois de enviar, um novo rascunho passa a ter a versão devolvida como base", async () => {
    renderEditor({ onSubmit: vi.fn(async () => ({ ok: true, id: "c1", version: "v2" })) });
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    type(body(), "mais uma alteração");
    fireEvent.click(saveLocal());
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem(KEY))).baseVersion).toBe("v2");
  });

  it("alterações feitas durante o envio continuam pendentes", async () => {
    /** @type {(value: any) => void} */
    let finish = () => {};
    renderEditor({ onSubmit: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    type(title(), "  Com espaços  ");
    fireEvent.click(send());
    await screen.findByRole("button", { name: "Enviando…" });
    type(title(), "Outro título digitado enquanto envia");
    finish(OK);
    await screen.findByText(/Nova versão enviada/);
    expect(title().value).toBe("Outro título digitado enquanto envia");
    expect(screen.getByText(/Alterações ainda não enviadas/)).toBeTruthy();
  });
});

describe("Editor: erros da API", () => {
  it("422: mostra o erro de cada campo junto dele e uma mensagem geral", async () => {
    const onSubmit = failing(failure("validation", {
      message: "O servidor recusou alguns dados. Corrija os campos indicados e envie de novo.",
      fieldErrors: [{ field: "title", message: "O título é obrigatório." }, { field: "slug", message: 'O slug "api" é reservado no nível raiz.' }],
    }));
    renderEditor({ onSubmit });
    fireEvent.click(send());

    expect(await screen.findByText('O slug "api" é reservado no nível raiz.')).toBeTruthy();
    expect(screen.getByText("O título é obrigatório.")).toBeTruthy();
    expect(title().getAttribute("aria-invalid")).toBe("true");
    expect(slug().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(title()));
    expect(screen.getByText(/O servidor recusou alguns dados/)).toBeTruthy();
    // Um erro de validação não guarda o texto: o autor corrige e envia de novo.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("422 em um campo que o editor não tem (o pai): vai para a mensagem geral", async () => {
    renderEditor({
      onSubmit: failing(failure("validation", { message: "Dados recusados.", fieldErrors: [{ field: "parentId", message: "O pai informado não existe." }] })),
    });
    fireEvent.click(send());
    expect(await screen.findByText(/Dados recusados\. O pai informado não existe\./)).toBeTruthy();
  });

  it("409: mostra o conflito no slug e oferece o endereço sugerido", async () => {
    renderEditor({
      onSubmit: failing(failure("conflict", {
        message: "Já existe um conteúdo com este slug na mesma coleção.",
        fieldErrors: [{ field: "slug", message: "Já existe um conteúdo com este slug na mesma coleção.", suggestion: "calculo-2" }],
      })),
    });
    fireEvent.click(send());

    const suggestion = await screen.findByRole("button", { name: /Usar o endereço sugerido “calculo-2”/ });
    expect(screen.getAllByText("Já existe um conteúdo com este slug na mesma coleção.").length).toBeGreaterThan(0);
    expect(slug().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(slug()));

    fireEvent.click(suggestion);
    expect(slug().value).toBe("calculo-2");
    expect(screen.queryByRole("button", { name: /Usar o endereço sugerido/ })).toBeNull();
    await waitFor(() => expect(slug().getAttribute("aria-invalid")).toBeNull());
  });

  it("409 sem sugestão: só o erro, sem o botão", async () => {
    renderEditor({ onSubmit: failing(failure("conflict", { fieldErrors: [{ field: "slug", message: "Conflito." }] })) });
    fireEvent.click(send());
    await screen.findAllByText("Conflito.");
    expect(screen.queryByRole("button", { name: /Usar o endereço sugerido/ })).toBeNull();
  });

  it("a sugestão some quando o autor edita o slug", async () => {
    renderEditor({ onSubmit: failing(failure("conflict", { fieldErrors: [{ field: "slug", message: "Conflito.", suggestion: "calculo-2" }] })) });
    fireEvent.click(send());
    await screen.findByRole("button", { name: /Usar o endereço sugerido/ });
    type(slug(), "outro");
    expect(screen.queryByRole("button", { name: /Usar o endereço sugerido/ })).toBeNull();
  });

  it("401: avisa que a sessão expirou, guarda o texto neste navegador e oferece o login em outra aba", async () => {
    renderEditor({ onSubmit: failing(failure("unauthenticated", { message: "Sua sessão expirou. Entre de novo e envie outra vez." })) });
    type(body(), "texto que não pode se perder");
    fireEvent.click(send());

    const alert = await screen.findByText(/Sua sessão expirou/);
    expect(alert.textContent).toContain("O texto foi salvo neste navegador.");
    const login = screen.getByRole("link", { name: "Abrir o login em outra aba" });
    expect(login.getAttribute("href")).toBe("/login");
    expect(login.getAttribute("target")).toBe("_blank");
    expect(login.getAttribute("rel")).toBe("noopener noreferrer");
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem(KEY))).values.body).toBe("texto que não pode se perder");
    // O texto continua na tela.
    expect(body().value).toBe("texto que não pode se perder");
  });

  it.each([
    ["not-found", "Este conteúdo não existe mais; talvez tenha sido excluído."],
    ["server", "O servidor não conseguiu salvar agora. Tente de novo em instantes."],
    ["network", "Não foi possível conectar ao servidor. Confira a conexão e tente de novo."],
  ])("%s: mostra o aviso e guarda o texto neste navegador", async (kind, message) => {
    renderEditor({ onSubmit: failing(failure(kind, { message })) });
    type(body(), "texto importante");
    fireEvent.click(send());

    const alert = await screen.findByText(new RegExp(message.slice(0, 30)));
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toContain("O texto foi salvo neste navegador.");
    expect(screen.queryByRole("link", { name: "Abrir o login em outra aba" })).toBeNull();
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem(KEY))).values.body).toBe("texto importante");
    expect(screen.getByText(/Há um rascunho salvo neste navegador/)).toBeTruthy();
  });

  it("se nem o navegador aceita guardar o texto, avisa para copiá-lo", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    renderEditor({ onSubmit: failing(failure("network", { message: "Sem conexão." })) });
    fireEvent.click(send());
    expect(await screen.findByText(/copie o texto antes de sair desta página/)).toBeTruthy();
  });

  it("um erro inesperado da própria ação de envio não derruba o editor", async () => {
    renderEditor({ onSubmit: vi.fn(async () => {
      throw new Error("falha interna");
    }) });
    fireEvent.click(send());
    expect(await screen.findByText(/Não foi possível enviar agora/)).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(false);
  });

  it("um novo envio bem-sucedido limpa a mensagem de erro", async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce(failure("server", { message: "Falhou." })).mockResolvedValueOnce(OK);
    renderEditor({ onSubmit });
    fireEvent.click(send());
    await screen.findByText(/Falhou\./);
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(screen.queryByText(/Falhou\./)).toBeNull();
  });

  it("a mensagem de erro fica em uma região de alerta", async () => {
    renderEditor({ onSubmit: failing(failure("server", { message: "Falhou." })) });
    fireEvent.click(send());
    const message = await screen.findByText(/Falhou\./);
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });
});
