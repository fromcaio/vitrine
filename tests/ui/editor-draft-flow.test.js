// @vitest-environment jsdom
// Rascunho local no editor (M09; RF15, CT20): "Salvar localmente", restauração ao reabrir, chave
// por usuário e por conteúdo, rascunho defasado (conflito com a versão do servidor), aviso ao sair
// da página e armazenamento indisponível.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@/components/editor/Editor";
import { OK, RendererStub, body, renderEditor, saveLocal, select, send, slug, title, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

const KEY = "vitrine:rascunho:u1:c1";
const DRAFT = { title: "Rascunho do autor", slug: "rascunho-do-autor", body: "texto que só existe no navegador", status: /** @type {const} */ ("DRAFT") };
const SAVED_AT = "2026-10-02T10:30:00.000Z";
// O editor mostra a data no fuso do navegador: o esperado é calculado do mesmo modo, para o teste
// valer em qualquer fuso.
const SAVED_AT_TEXT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(SAVED_AT));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Guarda um rascunho de teste, no formato do editor. */
function seed(/** @type {string} */ key, /** @type {any} */ values = DRAFT, /** @type {string | null} */ baseVersion = "v1", savedAt = SAVED_AT) {
  localStorage.setItem(key, JSON.stringify({ values, baseVersion, savedAt }));
}

const stored = (/** @type {string} */ key = KEY) => JSON.parse(/** @type {string} */ (localStorage.getItem(key)));

/** Dispara o aviso do navegador ao sair da página e diz se o editor o pediu. */
function leavePageIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("Salvar localmente", () => {
  it("guarda o texto no navegador, sob a chave do usuário e do conteúdo, com a versão de base", () => {
    renderEditor();
    type(title(), "Título novo");
    type(body(), "texto novo");
    fireEvent.click(saveLocal());

    expect(stored()).toMatchObject({
      values: { title: "Título novo", slug: "calculo", body: "texto novo", status: "PUBLISHED" },
      baseVersion: "v1",
    });
    expect(screen.getByText(/Rascunho salvo neste navegador às \d{2}:\d{2}\./)).toBeTruthy();
    expect(screen.getByText(/Há um rascunho salvo neste navegador/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover a cópia salva neste navegador" })).toBeTruthy();
  });

  it("não envia nada ao servidor", () => {
    const { onSubmit } = renderEditor();
    fireEvent.click(saveLocal());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("guarda mesmo o que ainda não é válido: o rascunho não precisa estar pronto para enviar", () => {
    renderEditor();
    type(title(), "");
    type(slug(), "Slug Inválido");
    fireEvent.click(saveLocal());
    expect(stored().values).toMatchObject({ title: "", slug: "Slug Inválido" });
  });

  it("Ctrl+S no texto salva localmente e impede o atalho do navegador (salvar a página)", () => {
    renderEditor();
    type(body(), "salvo com o atalho");
    expect(fireEvent.keyDown(body(), { key: "s", ctrlKey: true })).toBe(false);
    expect(stored().values.body).toBe("salvo com o atalho");
    expect(fireEvent.keyDown(body(), { key: "s", metaKey: true })).toBe(false);
  });

  it("editar depois de salvar volta a avisar que há texto sem rascunho salvo", () => {
    renderEditor();
    type(body(), "primeira versão");
    fireEvent.click(saveLocal());
    expect(screen.getByText(/Há um rascunho salvo neste navegador/)).toBeTruthy();
    type(body(), "primeira versão e mais");
    expect(screen.getByText(/sem rascunho salvo neste navegador/)).toBeTruthy();
    fireEvent.click(saveLocal());
    expect(screen.getByText(/Há um rascunho salvo neste navegador/)).toBeTruthy();
    expect(stored().values.body).toBe("primeira versão e mais");
  });

  it("um conteúdo novo guarda sob a chave :novo, sem versão de base", () => {
    renderEditor({ contentId: null, version: null, initialValue: { title: "", slug: "", body: "", status: "PUBLISHED" } });
    type(body(), "esboço");
    fireEvent.click(saveLocal());
    expect(stored("vitrine:rascunho:u1:novo")).toMatchObject({ values: { body: "esboço" }, baseVersion: null });
  });

  it("remover a cópia apaga o rascunho guardado e mantém o texto na tela", () => {
    renderEditor();
    type(body(), "texto");
    fireEvent.click(saveLocal());
    fireEvent.click(screen.getByRole("button", { name: "Remover a cópia salva neste navegador" }));

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.getByText("Cópia local removida.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover a cópia salva neste navegador" })).toBeNull();
    expect(body().value).toBe("texto");
    expect(screen.getByText(/sem rascunho salvo neste navegador/)).toBeTruthy();
  });

  it("armazenamento bloqueado ou cheio: avisa, sem derrubar o editor", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    renderEditor();
    type(body(), "texto");
    fireEvent.click(saveLocal());
    expect(screen.getByText(/Não foi possível salvar neste navegador/)).toBeTruthy();
    expect(screen.queryByText(/Rascunho salvo neste navegador às/)).toBeNull();
    expect(body().value).toBe("texto");
  });

  it("sem acesso ao localStorage: o editor abre e funciona", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      const { onSubmit } = renderEditor();
      expect(title().value).toBe("Cálculo");
      fireEvent.click(saveLocal());
      expect(screen.getByText(/Não foi possível salvar neste navegador/)).toBeTruthy();
      fireEvent.click(send());
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("Restaurar ao reabrir (CT20)", () => {
  it("restaura um rascunho feito sobre a mesma versão do servidor, e avisa", () => {
    seed(KEY);
    renderEditor();

    expect(title().value).toBe("Rascunho do autor");
    expect(slug().value).toBe("rascunho-do-autor");
    expect(body().value).toBe("texto que só existe no navegador");
    expect(screen.getByText("Rascunho").getAttribute("data-status")).toBe("DRAFT");
    expect(screen.getByText(`Rascunho local restaurado (salvo em ${SAVED_AT_TEXT}).`)).toBeTruthy();
    expect(screen.getByText(/Alterações ainda não enviadas\. Há um rascunho salvo neste navegador\./)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Rascunho local em conflito" })).toBeNull();
  });

  it("o rascunho sobrevive ao recarregamento: fecha o editor e abre outro", () => {
    const first = renderEditor();
    type(body(), "texto que sobrevive");
    fireEvent.click(saveLocal());
    first.unmount();

    renderEditor();
    expect(body().value).toBe("texto que sobrevive");
    expect(screen.getByText(/Rascunho local restaurado/)).toBeTruthy();
  });

  it("a pré-visualização mostra o texto restaurado", async () => {
    seed(KEY);
    renderEditor();
    expect((await screen.findByTestId("renderizado")).textContent).toBe("texto que só existe no navegador");
  });

  it("restaura também um conteúdo novo (chave :novo, sem versão)", () => {
    seed("vitrine:rascunho:u1:novo", { title: "Aula nova", slug: "aula-nova", body: "x", status: "DRAFT" }, null);
    renderEditor({ contentId: null, version: null, initialValue: { title: "", slug: "", body: "", status: "PUBLISHED" } });
    expect(title().value).toBe("Aula nova");
    expect(screen.getByText(/Rascunho local restaurado/)).toBeTruthy();
  });

  it("o envio depois de restaurar usa o texto restaurado", async () => {
    seed(KEY);
    const { onSubmit } = renderEditor();
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(DRAFT);
  });

  it("ignora um rascunho corrompido: abre com os valores do servidor, sem aviso", () => {
    localStorage.setItem(KEY, "{isto não é json");
    renderEditor();
    expect(title().value).toBe("Cálculo");
    expect(screen.queryByText(/restaurado/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Rascunho local em conflito" })).toBeNull();
  });

  it("ignora um rascunho com formato inesperado", () => {
    localStorage.setItem(KEY, JSON.stringify({ values: { title: 1 }, baseVersion: null, savedAt: "x" }));
    renderEditor();
    expect(title().value).toBe("Cálculo");
  });

  it("sem rascunho, abre com os valores do servidor e nada pendente", () => {
    renderEditor();
    expect(title().value).toBe("Cálculo");
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover a cópia salva neste navegador" })).toBeNull();
  });
});

describe("Rascunhos de outros usuários e de outros conteúdos (A-010, nota 10)", () => {
  it("o rascunho de outro usuário, para o mesmo conteúdo, não aparece", () => {
    seed("vitrine:rascunho:u2:c1");
    renderEditor();
    expect(title().value).toBe("Cálculo");
    expect(screen.queryByText(/restaurado/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Rascunho local em conflito" })).toBeNull();
  });

  it("o rascunho de outro conteúdo do mesmo usuário não aparece", () => {
    seed("vitrine:rascunho:u1:c2");
    seed("vitrine:rascunho:u1:novo");
    renderEditor();
    expect(title().value).toBe("Cálculo");
    expect(screen.queryByText(/restaurado/)).toBeNull();
  });

  it("salvar como um usuário não toca no rascunho de outro", () => {
    seed("vitrine:rascunho:u2:c1", { ...DRAFT, title: "do outro usuário" });
    renderEditor();
    type(body(), "meu texto");
    fireEvent.click(saveLocal());
    expect(stored("vitrine:rascunho:u1:c1").values.body).toBe("meu texto");
    expect(stored("vitrine:rascunho:u2:c1").values.title).toBe("do outro usuário");
  });

  it("enviar como um usuário não apaga o rascunho de outro", async () => {
    seed("vitrine:rascunho:u2:c1");
    renderEditor();
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(localStorage.getItem("vitrine:rascunho:u2:c1")).not.toBeNull();
  });

  it("outro usuário, no mesmo navegador, abre o mesmo conteúdo com a própria chave", () => {
    const first = renderEditor({ userId: "u1" });
    type(body(), "texto de u1");
    fireEvent.click(saveLocal());
    first.unmount();

    renderEditor({ userId: "u2" });
    expect(body().value).toBe("# Olá");
    expect(screen.queryByText(/restaurado/)).toBeNull();
  });

  it("recusa abrir sem o identificador do usuário (o rascunho seria de todos)", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Editor userId="" contentId="c1" initialValue={{ title: "a", slug: "a", body: "", status: "DRAFT" }} onSubmit={vi.fn()} />)).toThrow(TypeError);
    quiet.mockRestore();
  });
});

describe("Rascunho defasado: o conteúdo mudou no servidor depois do rascunho", () => {
  beforeEach(() => seed(KEY, DRAFT, "v0"));

  it("não o restaura sozinho: mostra a versão do servidor e pergunta o que fazer", () => {
    renderEditor();
    expect(title().value).toBe("Cálculo");
    const banner = screen.getByRole("region", { name: "Rascunho local em conflito" });
    expect(banner.textContent).toMatch(/feito sobre uma versão anterior/);
    expect(banner.textContent).toMatch(/versão atual do servidor/);
    expect(screen.getByRole("button", { name: "Restaurar o rascunho local" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descartar o rascunho local" })).toBeTruthy();
  });

  it("bloqueia salvar e enviar até haver uma decisão, para não perder o rascunho", async () => {
    const { onSubmit } = renderEditor();
    expect(/** @type {HTMLButtonElement} */ (saveLocal()).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(true);

    // Nem pelo atalho nem enviando o formulário à força.
    type(body(), "texto novo");
    fireEvent.keyDown(body(), { key: "s", ctrlKey: true });
    fireEvent.submit(/** @type {HTMLFormElement} */ (document.querySelector("form")));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(stored().values.title).toBe("Rascunho do autor");
    expect(stored().baseVersion).toBe("v0");
  });

  it("restaurar usa o texto do rascunho, libera os botões e mantém a cópia guardada", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar o rascunho local" }));

    expect(title().value).toBe("Rascunho do autor");
    expect(body().value).toBe("texto que só existe no navegador");
    expect(screen.queryByRole("region", { name: "Rascunho local em conflito" })).toBeNull();
    expect(screen.getByText(/Rascunho local restaurado/)).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(false);
    expect(/** @type {HTMLButtonElement} */ (saveLocal()).disabled).toBe(false);
    expect(stored().baseVersion).toBe("v0");
  });

  it("restaurado, o envio leva o texto do rascunho", async () => {
    const { onSubmit } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar o rascunho local" }));
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(DRAFT);
  });

  it("descartar apaga o rascunho e fica com a versão do servidor", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Descartar o rascunho local" }));

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(title().value).toBe("Cálculo");
    expect(screen.queryByRole("region", { name: "Rascunho local em conflito" })).toBeNull();
    expect(screen.getByText("Rascunho local descartado.")).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (send()).disabled).toBe(false);
  });

  it("depois de descartar, salvar localmente volta a funcionar", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Descartar o rascunho local" }));
    type(body(), "novo");
    fireEvent.click(saveLocal());
    expect(stored().baseVersion).toBe("v1");
  });

  it("um rascunho de conteúdo novo (sem versão) contra um conteúdo que ganhou versão também é defasado", () => {
    localStorage.clear();
    seed(KEY, DRAFT, null);
    renderEditor({ version: "v1" });
    expect(screen.getByRole("region", { name: "Rascunho local em conflito" })).toBeTruthy();
  });

  it("o aviso de conflito diz quando o rascunho foi salvo", () => {
    renderEditor();
    expect(screen.getByRole("region", { name: "Rascunho local em conflito" }).textContent).toContain(`salvo em ${SAVED_AT_TEXT}`);
  });
});

describe("Aviso ao sair da página com texto que não está em lugar nenhum além dela", () => {
  it("não avisa quando não há alterações", () => {
    renderEditor();
    expect(leavePageIsBlocked()).toBe(false);
  });

  it("avisa quando há alterações não enviadas nem salvas neste navegador", () => {
    renderEditor();
    type(body(), "alterado");
    expect(leavePageIsBlocked()).toBe(true);
  });

  it("não avisa depois de salvar localmente, mas volta a avisar se o texto mudar de novo", () => {
    renderEditor();
    type(body(), "alterado");
    fireEvent.click(saveLocal());
    expect(leavePageIsBlocked()).toBe(false);
    type(body(), "alterado outra vez");
    expect(leavePageIsBlocked()).toBe(true);
  });

  it("não avisa depois de enviar", async () => {
    renderEditor();
    type(body(), "alterado");
    expect(leavePageIsBlocked()).toBe(true);
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(leavePageIsBlocked()).toBe(false);
  });

  it("avisa se o envio falhar e o texto não puder ser guardado", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    renderEditor({ onSubmit: vi.fn(async () => ({ ok: false, kind: "network", message: "Sem rede.", fieldErrors: [] })) });
    type(body(), "alterado");
    fireEvent.click(send());
    await screen.findByText(/copie o texto/);
    expect(leavePageIsBlocked()).toBe(true);
  });

  it("para de avisar quando o editor é fechado (o ouvinte é removido)", () => {
    const { unmount } = renderEditor();
    type(body(), "alterado");
    expect(leavePageIsBlocked()).toBe(true);
    unmount();
    expect(leavePageIsBlocked()).toBe(false);
  });

  it("depois de restaurar um rascunho guardado, não avisa (o texto já está salvo)", () => {
    seed(KEY);
    renderEditor();
    expect(leavePageIsBlocked()).toBe(false);
  });
});

describe("Selecionar texto antes de salvar não interfere no rascunho", () => {
  it("o rascunho guarda o texto inteiro, e não só a seleção", () => {
    renderEditor();
    type(body(), "um dois três");
    select(body(), 3, 7);
    fireEvent.click(saveLocal());
    expect(stored().values.body).toBe("um dois três");
  });
});

describe("Pós-envio de um conteúdo criado", () => {
  it("um conteúdo novo, depois de enviado, passa a usar a chave do conteúdo criado ao salvar", async () => {
    // O ContentEditor repassa o novo id ao Editor; aqui simulamos com rerender.
    const onSubmit = vi.fn(async () => ({ ok: true, id: "criado-1", version: "v1" }));
    const { rerender } = render(<Editor userId="u1" contentId={null} version={null} initialValue={{ title: "Aula", slug: "aula", body: "x", status: "PUBLISHED" }} onSubmit={/** @type {any} */ (onSubmit)} />);
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);

    rerender(<Editor userId="u1" contentId="criado-1" version={null} initialValue={{ title: "Aula", slug: "aula", body: "x", status: "PUBLISHED" }} onSubmit={/** @type {any} */ (onSubmit)} />);
    type(body(), "mais texto");
    fireEvent.click(saveLocal());
    expect(localStorage.getItem("vitrine:rascunho:u1:criado-1")).not.toBeNull();
    expect(localStorage.getItem("vitrine:rascunho:u1:novo")).toBeNull();
    // Usa a constante para silenciar o aviso de variável sem uso em ambientes sem o resultado.
    expect(OK.ok).toBe(true);
  });
});
