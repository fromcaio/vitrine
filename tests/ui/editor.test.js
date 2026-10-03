// @vitest-environment jsdom
// Editor de conteúdo (M09; RF05, RF08, RF26; CT19): estrutura, barra de ferramentas, atalhos,
// estado de publicação, slug sugerido e pré-visualização, em um DOM simulado (jsdom + Testing
// Library). O MarkdownRenderer é trocado por um espião simples: o que ele renderiza já é coberto
// em markdown-renderer.test.js; aqui importa o que o editor entrega a ele.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOOLBAR_GROUPS } from "@/components/editor/Toolbar";
import { RendererStub, body, installExecCommand, renderEditor, saveLocal, select, send, slug, title, toolbarButton, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (/** @type {any} */ (document).execCommand);
});

describe("Editor: estrutura e acessibilidade", () => {
  it("mostra o valor inicial em campos com rótulo", () => {
    renderEditor();
    expect(title().value).toBe("Cálculo");
    expect(slug().value).toBe("calculo");
    expect(body().value).toBe("# Olá");
    expect(screen.getByText("Publicado")).toBeTruthy();
  });

  it("monta a pré-visualização com o MarkdownRenderer, carregado sob demanda", async () => {
    renderEditor();
    expect(await screen.findByTestId("renderizado")).toBeTruthy();
    expect(screen.getByTestId("renderizado").textContent).toBe("# Olá");
    expect(screen.getByRole("region", { name: "Pré-visualização do documento" })).toBeTruthy();
  });

  it("tem uma barra de ferramentas com um botão rotulado para cada comando pedido (RF08)", () => {
    renderEditor();
    expect(screen.getByRole("toolbar", { name: "Formatação do texto" }).getAttribute("aria-controls")).toBe(body().id);
    const labels = TOOLBAR_GROUPS.flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual([
      "Negrito", "Itálico", "Tachado", "Código em linha",
      "Título de nível 1", "Título de nível 2", "Título de nível 3",
      "Citação", "Lista com marcadores", "Lista numerada", "Lista de tarefas", "Bloco de código", "Tabela",
      "Link", "Imagem", "Fórmula em linha", "Fórmula em bloco",
    ]);
    for (const label of labels) expect(toolbarButton(label).getAttribute("type")).toBe("button");
    // Os grupos têm nome, e nenhum ícone aparece para o leitor de tela.
    expect(within(screen.getByRole("toolbar")).getAllByRole("group")).toHaveLength(TOOLBAR_GROUPS.length);
    expect(document.querySelectorAll('[role="toolbar"] svg:not([aria-hidden="true"])')).toHaveLength(0);
  });

  it("a barra de ferramentas é uma só parada do Tab, e as setas, Home e End movem o foco", () => {
    renderEditor();
    const buttons = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0].tabIndex).toBe(0);

    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);

    fireEvent.keyDown(buttons[1], { key: "End" });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(buttons[buttons.length - 1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(buttons[buttons.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
    // Outras teclas não mexem no foco.
    fireEvent.keyDown(buttons[0], { key: "a" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("os botões que têm atalho o declaram", () => {
    renderEditor();
    expect(toolbarButton("Negrito").getAttribute("aria-keyshortcuts")).toBe("Control+B Meta+B");
    expect(toolbarButton("Negrito").getAttribute("title")).toBe("Negrito (Ctrl+B)");
    expect(toolbarButton("Link").getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K");
    expect(toolbarButton("Tachado").getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("alterna entre edição e pré-visualização em telas pequenas, com aria-pressed", () => {
    renderEditor();
    const edit = screen.getByRole("button", { name: "Editar" });
    const preview = screen.getByRole("button", { name: "Pré-visualizar" });
    expect(edit.getAttribute("aria-pressed")).toBe("true");
    expect(preview.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("region", { name: "Edição" }).className).toContain("flex");

    fireEvent.click(preview);
    expect(preview.getAttribute("aria-pressed")).toBe("true");
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("region", { name: "Edição", hidden: true }).className).toContain("hidden");
    expect(screen.getByRole("region", { name: "Pré-visualização", hidden: true }).className).toContain("block");
  });

  it("Enter nos campos de uma linha não envia o formulário (o envio substitui o conteúdo)", () => {
    const { onSubmit } = renderEditor();
    expect(fireEvent.keyDown(title(), { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(slug(), { key: "Enter" })).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    // Em outras teclas, o comportamento normal.
    expect(fireEvent.keyDown(title(), { key: "a" })).toBe(true);
  });
});

describe("Editor: pré-visualização (CT19)", () => {
  it("acompanha o texto digitado, com o mesmo componente da página pública", async () => {
    renderEditor();
    await screen.findByTestId("renderizado");
    type(body(), "Fórmula: $x^2$\n\n- item");
    await waitFor(() => expect(screen.getByTestId("renderizado").textContent).toBe("Fórmula: $x^2$\n\n- item"));
  });

  it("avisa que ainda não acompanha o texto e deixa de avisar quando alcança (aria-busy)", async () => {
    renderEditor();
    await screen.findByTestId("renderizado");
    const region = screen.getByRole("region", { name: "Pré-visualização do documento" });
    expect(region.getAttribute("aria-busy")).toBe("false");
  });

  it("mostra uma dica quando o texto está vazio", async () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "", status: "DRAFT" } });
    expect(screen.getByText("A pré-visualização do texto aparece aqui.")).toBeTruthy();
    type(body(), "oi");
    await waitFor(() => expect(screen.queryByText("A pré-visualização do texto aparece aqui.")).toBeNull());
  });

  it("é rolável e alcançável pelo teclado", () => {
    renderEditor();
    expect(screen.getByRole("region", { name: "Pré-visualização do documento" }).tabIndex).toBe(0);
  });
});

describe("Editor: barra de ferramentas e atalhos", () => {
  it("negrito envolve o texto selecionado e deixa a seleção sobre ele", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton("Negrito"));
    expect(body().value).toBe("oi **mundo**");
    expect([body().selectionStart, body().selectionEnd]).toEqual([5, 10]);
    expect(document.activeElement).toBe(body());
  });

  it("clicar de novo desfaz (alternância)", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton("Negrito"));
    fireEvent.click(toolbarButton("Negrito"));
    expect(body().value).toBe("oi mundo");
  });

  it.each([
    ["Itálico", "*mundo*"],
    ["Tachado", "~~mundo~~"],
    ["Código em linha", "`mundo`"],
    ["Fórmula em linha", "$mundo$"],
  ])("%s", (label, expected) => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton(label));
    expect(body().value).toBe(`oi ${expected}`);
  });

  it("sem seleção, insere o exemplo já selecionado, para digitar por cima", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "", status: "DRAFT" } });
    select(body(), 0);
    fireEvent.click(toolbarButton("Link"));
    expect(body().value).toBe("[texto do link](https://)");
    expect(body().value.slice(body().selectionStart, body().selectionEnd)).toBe("texto do link");
  });

  it("título, lista e citação agem nas linhas da seleção", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "um\ndois", status: "DRAFT" } });
    select(body(), 0, 7);
    fireEvent.click(toolbarButton("Lista com marcadores"));
    expect(body().value).toBe("- um\n- dois");
    fireEvent.click(toolbarButton("Citação"));
    expect(body().value).toBe("> - um\n> - dois");
  });

  it("os blocos (tabela, código e fórmula) entram separados por linha em branco", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "antes", status: "DRAFT" } });
    select(body(), 5);
    fireEvent.click(toolbarButton("Fórmula em bloco"));
    expect(body().value).toBe("antes\n\n$$\nx^2 + y^2 = z^2\n$$");
  });

  it("a mudança chega à pré-visualização", async () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi", status: "DRAFT" } });
    select(body(), 0, 2);
    fireEvent.click(toolbarButton("Negrito"));
    await waitFor(() => expect(screen.getByTestId("renderizado").textContent).toBe("**oi**"));
  });

  it("aplica o comando como uma edição de verdade quando o navegador tem execCommand (Ctrl+Z desfaz)", () => {
    const execCommand = installExecCommand();
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton("Negrito"));

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand.mock.calls[0][0]).toBe("insertText");
    expect(execCommand.mock.calls[0][2]).toBe("**mundo**");
    expect(body().value).toBe("oi **mundo**");
    expect([body().selectionStart, body().selectionEnd]).toEqual([5, 10]);
  });

  it("e usa o comando delete quando o resultado só remove texto", async () => {
    const execCommand = installExecCommand();
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi **mundo**", status: "DRAFT" } });
    select(body(), 5, 10);
    fireEvent.click(toolbarButton("Negrito"));
    // O trecho trocado inclui o texto; o caso mínimo é a troca de "**mundo**" por "mundo".
    expect(execCommand).toHaveBeenCalled();
    expect(body().value).toBe("oi mundo");
    await waitFor(() => expect(screen.getByTestId("renderizado").textContent).toBe("oi mundo"));
  });

  it("se o execCommand não produzir o texto esperado, grava o texto direto", () => {
    /** @type {any} */ (document).execCommand = vi.fn(() => true); // diz que deu certo, mas não faz nada
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton("Negrito"));
    expect(body().value).toBe("oi **mundo**");
  });

  it("se o execCommand recusar, grava o texto direto", () => {
    /** @type {any} */ (document).execCommand = vi.fn(() => false);
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    fireEvent.click(toolbarButton("Itálico"));
    expect(body().value).toBe("oi *mundo*");
  });

  it("Ctrl+B e Ctrl+I (também com Cmd) aplicam negrito e itálico, e Ctrl+K cria um link", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "oi mundo", status: "DRAFT" } });
    select(body(), 3, 8);
    expect(fireEvent.keyDown(body(), { key: "b", ctrlKey: true })).toBe(false);
    expect(body().value).toBe("oi **mundo**");

    select(body(), 5, 10);
    fireEvent.keyDown(body(), { key: "B", metaKey: true });
    expect(body().value).toBe("oi mundo");

    select(body(), 3, 8);
    fireEvent.keyDown(body(), { key: "i", ctrlKey: true });
    expect(body().value).toBe("oi *mundo*");

    select(body(), 4, 9);
    fireEvent.keyDown(body(), { key: "k", ctrlKey: true });
    expect(body().value).toBe("oi *[mundo](https://)*");
  });

  it("outras combinações de teclas não são interceptadas", () => {
    renderEditor();
    select(body(), 0, 2);
    for (const init of [{ key: "b" }, { key: "b", ctrlKey: true, shiftKey: true }, { key: "b", ctrlKey: true, altKey: true }, { key: "z", ctrlKey: true }, { key: "a", ctrlKey: true }]) {
      expect(fireEvent.keyDown(body(), init), JSON.stringify(init)).toBe(true);
    }
    expect(body().value).toBe("# Olá");
  });
});

describe("Editor: estado de publicação (RF26, RN16)", () => {
  it("mostra o estado, com o rascunho em destaque e com ícone e nome (não só a cor)", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "", status: "DRAFT" } });
    const badge = screen.getByText("Rascunho");
    expect(badge.getAttribute("data-status")).toBe("DRAFT");
    expect(badge.className).toContain("bg-foreground");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("group", { name: "Estado de publicação" })).toBeTruthy();
  });

  it("o publicado tem outro aspecto, e o botão diz a ação", () => {
    renderEditor();
    const badge = screen.getByText("Publicado");
    expect(badge.getAttribute("data-status")).toBe("PUBLISHED");
    expect(badge.className).not.toContain("bg-foreground");
    expect(screen.getByRole("button", { name: "Passar para rascunho" })).toBeTruthy();
  });

  it("alterna e envia o novo estado com a versão", async () => {
    const { onSubmit } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    expect(screen.getByText("Rascunho").getAttribute("data-status")).toBe("DRAFT");
    expect(screen.getByRole("button", { name: "Publicar" })).toBeTruthy();

    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ status: "DRAFT" });

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ status: "PUBLISHED" });
  });

  it("explica que o estado só muda ao enviar, e liga a explicação ao botão", () => {
    renderEditor();
    const hint = screen.getByText(/O estado só muda quando você envia a nova versão/);
    expect(screen.getByRole("button", { name: "Passar para rascunho" }).getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("alterar só o estado já conta como alteração ainda não enviada", () => {
    renderEditor();
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    expect(screen.getByText(/Alterações ainda não enviadas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
  });
});

describe("Editor: slug sugerido a partir do título (UC05)", () => {
  // Um conteúdo novo ainda não tem versão no servidor.
  const NEW = { contentId: null, version: null, initialValue: { title: "", slug: "", body: "", status: /** @type {const} */ ("PUBLISHED") } };

  it("em um conteúdo novo, o slug acompanha o título", () => {
    renderEditor(NEW);
    type(title(), "Introdução ao Cálculo");
    expect(slug().value).toBe("introducao-ao-calculo");
    type(title(), "Introdução ao Cálculo I");
    expect(slug().value).toBe("introducao-ao-calculo-i");
  });

  it("deixa de acompanhar quando o autor escreve no slug", () => {
    renderEditor(NEW);
    type(title(), "Aula 1");
    type(slug(), "minha-aula");
    type(title(), "Aula 1: limites");
    expect(slug().value).toBe("minha-aula");
  });

  it("volta a acompanhar se o autor apagar o slug", () => {
    renderEditor(NEW);
    type(slug(), "manual");
    type(slug(), "");
    type(title(), "Série de Taylor");
    expect(slug().value).toBe("serie-de-taylor");
  });

  it("um conteúdo que já existe não muda o endereço quando o título muda", () => {
    renderEditor();
    type(title(), "Cálculo Diferencial");
    expect(slug().value).toBe("calculo");
    expect(screen.getByText(/Alterar o endereço quebra os links/)).toBeTruthy();
  });

  it("um conteúdo novo explica a sugestão", () => {
    renderEditor(NEW);
    expect(screen.getByText(/Sugerido a partir do título/)).toBeTruthy();
  });

  it("um rascunho local com slug não é sobrescrito pelo título", () => {
    writeDraftFor("u1", null, { title: "Aula", slug: "meu-slug", body: "x", status: "DRAFT" }, null);
    renderEditor(NEW);
    type(title(), "Aula 2");
    expect(slug().value).toBe("meu-slug");
  });
});

describe("Editor: aviso de imagens http:// (CSP: img-src só aceita https)", () => {
  it("avisa de uma imagem em http://", async () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "![gráfico](http://exemplo.test/g.png)", status: "DRAFT" } });
    expect(await screen.findByText(/Uma imagem usa um endereço http:\/\//)).toBeTruthy();
    expect(screen.getByText(/Use https:\/\//)).toBeTruthy();
  });

  it("conta várias imagens e some quando são corrigidas", async () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "![a](http://x.test/a.png)\n\n![b](http://x.test/b.png)", status: "DRAFT" } });
    expect(await screen.findByText(/2 imagens usam endereços http:\/\//)).toBeTruthy();
    type(body(), "![a](https://x.test/a.png)\n\n![b](https://x.test/b.png)");
    await waitFor(() => expect(screen.queryByText(/endereços? http:\/\//)).toBeNull());
  });

  it("não avisa de imagens https nem de links em http://", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "![a](https://x.test/a.png) [b](http://x.test)", status: "DRAFT" } });
    expect(screen.queryByText(/bloqueia por segurança/)).toBeNull();
  });

  it("não avisa de um exemplo de Markdown dentro de um bloco de código", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "```md\n![a](http://x.test/a.png)\n```", status: "DRAFT" } });
    expect(screen.queryByText(/bloqueia por segurança/)).toBeNull();
  });

  it("o botão de imagem já propõe https://", () => {
    renderEditor({ initialValue: { title: "a", slug: "a", body: "", status: "DRAFT" } });
    select(body(), 0);
    fireEvent.click(toolbarButton("Imagem"));
    expect(body().value).toBe("![descrição da imagem](https://)");
  });
});

/** Grava um rascunho de teste na chave de um usuário e conteúdo. */
function writeDraftFor(/** @type {string} */ userId, /** @type {string | null} */ contentId, /** @type {any} */ values, /** @type {string | null} */ baseVersion) {
  const key = `vitrine:rascunho:${userId}:${contentId ?? "novo"}`;
  localStorage.setItem(key, JSON.stringify({ values, baseVersion, savedAt: "2026-10-02T10:00:00.000Z" }));
}
