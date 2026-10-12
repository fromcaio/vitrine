// @vitest-environment jsdom
// P-032 (M26; RF42, RF44, RN35, RN36, RN38; UC23): o HomeEditor, o editor da página inicial do sistema e do espaço.
// O que ele envia (só os campos que mudaram), os erros sem perder o texto, o rascunho local, o link e a dica, o estado
// e as opções por alvo. A API é simulada (`fetch` ou o `client` injetado); o MarkdownRenderer, trocado por um que mostra
// o texto recebido.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { HomeEditor } from "@/components/admin/HomeEditor";
import { saveHome } from "@/components/admin/home-client";
import { clearAllDrafts } from "@/components/editor/draft";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) };
});
vi.mock("@/components/markdown/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ markdown, headingOffset = 0 }) => (
    <div data-testid="renderizado" data-heading-offset={headingOffset}>
      {markdown}
    </div>
  ),
}));

const SYSTEM_KEY = "vitrine:rascunho:u1:inicio:sistema";
const PAGE_KEY = "vitrine:rascunho:u1:inicio:pagina";
const SAVED_AT = "2026-10-12T10:30:00.000Z";

beforeEach(() => {
  localStorage.clear();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PAGE = { homeBody: "# Olá\n\nTexto.", homeStatus: /** @type {const} */ ("PUBLISHED"), homeShowItems: true };
const SYSTEM = { homeBody: "Portal.", homeStatus: /** @type {const} */ ("PUBLISHED"), directoryEnabled: true, directoryTitle: "Espaços" };

/** @param {number} [status] */
const okResponse = (/** @type {unknown} */ data, status = 200) =>
  new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
const problem = (/** @type {number} */ status, /** @type {string} */ code, /** @type {unknown[]} */ details = [], /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify({ error: { code, message: "mensagem do servidor", details } }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** @param {(patch: any) => Response | Promise<Response>} [respond] devolve a resposta a cada PUT (o padrão devolve o que mudou) */
function stubFetch(respond = (patch) => okResponse(patch)) {
  const fetchMock = vi.fn(async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => respond(JSON.parse(String(init?.body ?? "{}"))));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** O corpo (JSON) do envio de ordem `index`. */
const sent = (/** @type {ReturnType<typeof stubFetch>} */ fetchMock, index = 0) => JSON.parse(String(fetchMock.mock.calls[index][1]?.body));

/** @param {Partial<import("react").ComponentProps<typeof HomeEditor>>} [props] */
function setup(props = {}) {
  const target = props.target ?? "pagina";
  return render(
    <HomeEditor
      target={target}
      userId="u1"
      initial={target === "sistema" ? SYSTEM : PAGE}
      publicHref={target === "sistema" ? "/" : "/maria"}
      {...props}
    />,
  );
}

const body = () => /** @type {HTMLTextAreaElement} */ (screen.getByLabelText("Texto da página inicial (Markdown)"));
const saveButton = () => screen.getByRole("button", { name: /^Salvar$|^Salvando/ });
const type = (/** @type {HTMLElement} */ field, /** @type {string} */ value) => fireEvent.change(field, { target: { value } });
const submit = async () => {
  await act(async () => {
    fireEvent.click(saveButton());
  });
};
const viewLink = () => screen.queryByRole("link", { name: /^Ver página pública/ });
const classesOf = (/** @type {Element} */ node) => [...node.classList];
const status = () => screen.getAllByRole("status").map((node) => node.textContent).join(" | ");

describe("a interface (a mesma do editor de conteúdo)", () => {
  it("tem a barra de ferramentas, o texto e a pré-visualização, o estado e o botão Salvar", () => {
    setup();
    expect(screen.getByRole("toolbar", { name: "Formatação do texto" })).toBeTruthy();
    expect(body().value).toBe("# Olá\n\nTexto.");
    expect(screen.getByRole("region", { name: "Pré-visualização do documento" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Estado de publicação" })).toBeTruthy();
    expect(screen.getByText("Publicado")).toBeTruthy();
    expect(saveButton()).toBeTruthy();
  });

  it("o bloco de edição e a pré-visualização têm a MESMA altura", () => {
    setup();
    const block = /** @type {HTMLElement} */ (body().parentElement);
    const preview = screen.getByRole("region", { name: "Pré-visualização do documento" });
    const heights = (/** @type {Element} */ node) => classesOf(node).filter((name) => /^(md:)?h-/.test(name)).sort();
    expect(heights(block)).toEqual(["h-[26rem]", "md:h-[34rem]"]);
    expect(heights(preview)).toEqual(heights(block));
    expect(classesOf(body())).toEqual(expect.arrayContaining(["flex-1", "min-h-0", "resize-none"]));
  });

  it("a pré-visualização mostra o texto digitado", async () => {
    setup();
    type(body(), "Novo **texto**");
    await waitFor(() => expect(screen.getByTestId("renderizado").textContent).toBe("Novo **texto**"));
  });

  it("a pré-visualização desloca os títulos como a página (headingOffset 1: o texto começa em h2)", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("renderizado").getAttribute("data-heading-offset")).toBe("1"));
  });

  it("a dica fixa: sem texto publicado a descrição continua aparecendo; os títulos começam em # e saem como h2", () => {
    setup();
    expect(screen.getByText(/Sem texto publicado, a descrição do espaço continua aparecendo\./)).toBeTruthy();
    const hint = document.body.textContent ?? "";
    expect(hint).toMatch(/Os títulos começam em # e saem como h2 na página \(o nome do espaço é o h1\)\./);
    expect(hint).not.toMatch(/começam em h2/);
  });

  it("o texto de um usuário é sempre texto, nunca HTML", () => {
    const hostile = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    setup({ initial: { ...PAGE, homeBody: hostile } });
    expect(body().value).toBe(hostile);
    expect(document.querySelector("form img, form script")).toBeNull();
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });

  it("usa só tokens de tema (nada de cores fixas)", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(slate|gray|zinc|neutral|red|blue)-\d/);
  });

  it("o atalho Ctrl+B do editor formata o texto", () => {
    setup({ initial: { ...PAGE, homeBody: "abc" } });
    const area = body();
    area.focus();
    area.setSelectionRange(0, 3);
    fireEvent.keyDown(area, { key: "b", ctrlKey: true });
    expect(area.value).toBe("**abc**");
  });
});

describe("as opções de cada alvo", () => {
  it("alvo 'pagina': 'Mostrar as coleções e os documentos', sem diretório", () => {
    setup({ target: "pagina" });
    const box = /** @type {HTMLInputElement} */ (screen.getByLabelText("Mostrar as coleções e os documentos"));
    expect(box.checked).toBe(true);
    expect(screen.queryByLabelText("Mostrar o diretório de espaços")).toBeNull();
    expect(screen.queryByLabelText("Título do diretório")).toBeNull();
  });

  it("alvo 'pagina': homeShowItems falso desliga a caixa", () => {
    setup({ target: "pagina", initial: { ...PAGE, homeShowItems: false } });
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Mostrar as coleções e os documentos")).checked).toBe(false);
  });

  it("alvo 'sistema': o diretório e o título dele, sem 'coleções e documentos'", () => {
    setup({ target: "sistema" });
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Mostrar o diretório de espaços")).checked).toBe(true);
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Título do diretório")).value).toBe("Espaços");
    expect(screen.queryByLabelText("Mostrar as coleções e os documentos")).toBeNull();
  });

  it("o título do diretório sem valor volta ao padrão 'Espaços'", () => {
    setup({ target: "sistema", initial: { ...SYSTEM, directoryTitle: null } });
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Título do diretório")).value).toBe("Espaços");
  });
});

describe("o que o HomeEditor envia (só o que mudou)", () => {
  it("só o texto: homeBody e mais nada; vai para PUT /api/home", async () => {
    const fetchMock = stubFetch();
    setup();
    type(body(), "Outro texto");
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/home");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "application/json" } });
    expect(sent(fetchMock)).toEqual({ homeBody: "Outro texto" });
  });

  it("só o estado: homeStatus e mais nada (o texto igual não vai)", async () => {
    const fetchMock = stubFetch();
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    await submit();
    expect(sent(fetchMock)).toEqual({ homeStatus: "DRAFT" });
  });

  it("só o interruptor da lista (alvo 'pagina'): homeShowItems", async () => {
    const fetchMock = stubFetch();
    setup();
    fireEvent.click(screen.getByLabelText("Mostrar as coleções e os documentos"));
    await submit();
    expect(sent(fetchMock)).toEqual({ homeShowItems: false });
  });

  it("alvo 'sistema' vai para PUT /api/configuration, com o diretório e o título só se mudaram", async () => {
    const fetchMock = stubFetch();
    setup({ target: "sistema" });
    fireEvent.click(screen.getByLabelText("Mostrar o diretório de espaços"));
    await submit();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/configuration");
    expect(sent(fetchMock)).toEqual({ directoryEnabled: false });
    type(screen.getByLabelText("Título do diretório"), "  Pessoas  ");
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    await submit();
    expect(sent(fetchMock, 1)).toEqual({ directoryTitle: "Pessoas", homeStatus: "DRAFT" });
  });

  it("o texto vai aparado; esvaziado vai como ''", async () => {
    const fetchMock = stubFetch();
    setup();
    type(body(), "  \n  ");
    await submit();
    expect(sent(fetchMock)).toEqual({ homeBody: "" });
  });

  it("sem alteração, nada é enviado e o aviso diz isso", async () => {
    const fetchMock = stubFetch();
    setup();
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(status()).toMatch(/Nenhuma alteração para salvar\./);
  });

  it("depois de salvar, o que foi gravado é a nova base: salvar de novo não reenvia", async () => {
    const fetchMock = stubFetch();
    setup();
    type(body(), "Gravado");
    await submit();
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    type(body(), "Gravado de novo");
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(fetchMock, 1)).toEqual({ homeBody: "Gravado de novo" });
  });

  it("o `client` injetado recebe o mesmo corpo parcial no lugar do fetch", async () => {
    const fetchMock = stubFetch();
    const save = vi.fn(async () => ({ ok: /** @type {const} */ (true), data: { homeBody: "x" } }));
    setup({ client: { save } });
    type(body(), "x");
    await submit();
    expect(save).toHaveBeenCalledWith({ homeBody: "x" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("o sucesso", () => {
  it("anuncia em aria-live, chama router.refresh e onSaved, e apaga o rascunho local", async () => {
    stubFetch();
    const onSaved = vi.fn();
    localStorage.setItem(PAGE_KEY, JSON.stringify({ values: { title: "", slug: "", body: "velho", status: "PUBLISHED" }, baseVersion: null, savedAt: SAVED_AT }));
    setup({ onSaved });
    type(body(), "Gravado");
    await submit();
    expect(status()).toMatch(/Página inicial salva às \d\d:\d\d\./);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ homeBody: "Gravado" });
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
  });

  it("adota o que o servidor devolveu (texto aparado)", async () => {
    stubFetch(() => okResponse({ homeBody: "Gravado", homeStatus: "PUBLISHED", homeShowItems: true }));
    setup();
    type(body(), "  Gravado  ");
    await submit();
    expect(body().value).toBe("Gravado");
  });

  it("enquanto envia, o botão fica desabilitado e o segundo clique não envia de novo", async () => {
    /** @type {(response: Response) => void} */
    let release = () => {};
    const fetchMock = stubFetch(() => new Promise((resolve) => { release = resolve; }));
    setup();
    type(body(), "x");
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvando…" }).hasAttribute("disabled")).toBe(true));
    fireEvent.submit(/** @type {HTMLFormElement} */ (body().closest("form")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release(okResponse({ homeBody: "x" })));
  });
});

describe("os erros: o texto digitado nunca se perde", () => {
  /** Digita, envia e devolve o texto da tela. */
  async function failWith(/** @type {Response} */ response) {
    stubFetch(() => response);
    setup();
    type(body(), "Texto importante");
    await submit();
    return body().value;
  }

  it("413: mensagem junto do texto; o texto fica na tela e no navegador", async () => {
    expect(await failWith(new Response("{}", { status: 413 }))).toBe("Texto importante");
    expect(screen.getByText("O texto é grande demais para ser enviado.")).toBeTruthy();
    expect(JSON.parse(String(localStorage.getItem(PAGE_KEY))).values.body).toBe("Texto importante");
    expect(screen.getByText(/O texto foi salvo neste navegador\./)).toBeTruthy();
  });

  it("422 VALIDATION_ERROR com o campo: a mensagem do servidor junto do campo certo", async () => {
    stubFetch(() => problem(422, "VALIDATION_ERROR", [{ field: "directoryTitle", message: "Título inválido." }]));
    setup({ target: "sistema" });
    type(body(), "Texto importante");
    fireEvent.click(screen.getByLabelText("Mostrar o diretório de espaços"));
    await submit();
    expect(within(screen.getByLabelText("Título do diretório").closest("div")).getByText("Título inválido.")).toBeTruthy();
    expect(body().value).toBe("Texto importante");
    // erro de campo, que se corrige na hora: não guarda no navegador
    expect(localStorage.getItem(SYSTEM_KEY)).toBeNull();
  });

  it("422 CONTENT_TOO_COMPLEX: a mensagem fica JUNTO DO TEXTO (homeBody) e o texto é guardado", async () => {
    stubFetch(() => problem(422, "CONTENT_TOO_COMPLEX", [{ field: "homeBody", message: "x" }]));
    setup();
    type(body(), "Fórmula");
    await submit();
    const alert = screen.getByText("O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.");
    expect(alert.getAttribute("role") ?? alert.parentElement?.getAttribute("role")).toBe("alert");
    expect(body().getAttribute("aria-invalid")).toBe("true");
    expect(body().value).toBe("Fórmula");
    expect(localStorage.getItem(PAGE_KEY)).not.toBeNull();
  });

  it("503 BUSY: com o tempo de espera", async () => {
    await failWith(problem(503, "BUSY", [], { "Retry-After": "3" }));
    expect(screen.getByText(/O servidor está ocupado agora\. Tente de novo em 3 segundos\./)).toBeTruthy();
    expect(body().value).toBe("Texto importante");
  });

  it("401: diz que a sessão expirou e oferece o login em outra aba", async () => {
    await failWith(problem(401, "UNAUTHENTICATED"));
    expect(screen.getByText(/Sua sessão expirou/)).toBeTruthy();
    const login = screen.getByRole("link", { name: "Abrir o login em outra aba" });
    expect(login.getAttribute("href")).toBe("/login");
    expect(login.getAttribute("target")).toBe("_blank");
  });

  it("403: a mensagem do alvo (o sistema é só do administrador)", async () => {
    stubFetch(() => problem(403, "FORBIDDEN"));
    setup({ target: "sistema" });
    type(body(), "x");
    await submit();
    expect(screen.getByText(/Só o administrador pode alterar a página inicial do sistema\./)).toBeTruthy();
  });

  it("429: com o tempo do Retry-After", async () => {
    await failWith(problem(429, "RATE_LIMITED", [], { "Retry-After": "1" }));
    expect(screen.getByText(/Muitas alterações em pouco tempo\. Aguarde um instante e tente de novo\. Tente de novo em 1 segundo\./)).toBeTruthy();
  });

  it("falha de rede", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });
    setup();
    type(body(), "Texto importante");
    await submit();
    expect(screen.getByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(body().value).toBe("Texto importante");
  });

  it("resposta que não é JSON (500 de um proxy): erro genérico, sem lançar", async () => {
    await failWith(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(screen.getByText(/O servidor não conseguiu salvar agora/)).toBeTruthy();
  });

  it("o armazenamento bloqueado: avisa para copiar o texto", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cheio");
    });
    stubFetch(() => problem(503, "BUSY"));
    setup();
    type(body(), "Texto importante");
    await submit();
    expect(screen.getByText(/copie o texto antes de sair desta página/)).toBeTruthy();
  });

  it("depois do erro, salvar de novo reenvia a mesma alteração (nada foi tomado como gravado)", async () => {
    let fail = true;
    const fetchMock = stubFetch((patch) => (fail ? problem(503, "BUSY") : okResponse(patch)));
    setup();
    type(body(), "Texto importante");
    await submit();
    fail = false;
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(fetchMock, 1)).toEqual({ homeBody: "Texto importante" });
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
  });
});

describe("a validação antes de enviar", () => {
  it("título do diretório vazio ou longo demais: erro junto do campo, nada enviado", async () => {
    const fetchMock = stubFetch();
    setup({ target: "sistema" });
    type(screen.getByLabelText("Título do diretório"), "   ");
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("O título do diretório precisa ter de 1 a 40 caracteres.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Título do diretório"));
    type(screen.getByLabelText("Título do diretório"), "x".repeat(41));
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    type(screen.getByLabelText("Título do diretório"), "x".repeat(40));
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("texto acima do limite (em bytes): erro junto do texto, nada enviado", async () => {
    const fetchMock = stubFetch();
    setup({ maxBodyBytes: 10 });
    type(body(), "ááááááá"); // 14 bytes
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/O texto tem 14 bytes; o máximo é 10/)).toBeTruthy();
    expect(body().getAttribute("aria-invalid")).toBe("true");
  });
});

describe("o rascunho local do texto", () => {
  /** Guarda um rascunho de teste, no formato do editor. */
  const seed = (/** @type {string} */ key, /** @type {string} */ text, /** @type {"PUBLISHED" | "DRAFT"} */ state = "PUBLISHED") =>
    localStorage.setItem(key, JSON.stringify({ values: { title: "", slug: "", body: text, status: state }, baseVersion: null, savedAt: SAVED_AT }));

  it("a chave é por usuário e por alvo: vitrine:rascunho:{userId}:inicio:{alvo}", async () => {
    stubFetch(() => problem(503, "BUSY"));
    setup({ target: "sistema" });
    type(body(), "no sistema");
    await submit();
    expect(JSON.parse(String(localStorage.getItem(SYSTEM_KEY))).values.body).toBe("no sistema");
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
  });

  it("restaura com aviso (e o estado) ao abrir, e o botão descarta", () => {
    seed(PAGE_KEY, "texto que só existe no navegador", "DRAFT");
    setup();
    expect(body().value).toBe("texto que só existe no navegador");
    expect(screen.getAllByText("Rascunho").length).toBeGreaterThan(0);
    const savedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(SAVED_AT));
    expect(status()).toContain(`Rascunho local restaurado (salvo em ${savedAt}).`);
    fireEvent.click(screen.getByRole("button", { name: "Descartar o rascunho local" }));
    expect(body().value).toBe("# Olá\n\nTexto.");
    expect(screen.getByText("Publicado")).toBeTruthy();
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
    expect(status()).toContain("Rascunho local descartado.");
    expect(screen.queryByRole("button", { name: "Descartar o rascunho local" })).toBeNull();
  });

  it("um rascunho igual ao que o servidor tem é ignorado (e removido)", () => {
    seed(PAGE_KEY, "# Olá\n\nTexto.");
    setup();
    expect(screen.queryByRole("button", { name: "Descartar o rascunho local" })).toBeNull();
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
  });

  it("o rascunho de outro usuário ou de outro alvo não aparece", () => {
    seed("vitrine:rascunho:u2:inicio:pagina", "de outro usuário");
    seed(SYSTEM_KEY, "do sistema");
    setup();
    expect(body().value).toBe("# Olá\n\nTexto.");
  });

  it("restaurar um rascunho conta como alteração pendente: avisa antes de sair e salva o que restou", async () => {
    const fetchMock = stubFetch();
    seed(PAGE_KEY, "restaurado");
    setup();
    await submit();
    expect(sent(fetchMock)).toEqual({ homeBody: "restaurado" });
  });

  it("ao sair com alteração não guardada em outro lugar, o texto vira rascunho local (e a próxima abertura o oferece)", () => {
    const { unmount } = setup();
    type(body(), "escrito e abandonado");
    unmount();
    expect(JSON.parse(String(localStorage.getItem(PAGE_KEY))).values.body).toBe("escrito e abandonado");
    setup();
    expect(body().value).toBe("escrito e abandonado");
  });

  it("sem alteração, sair não grava nada; depois de 'Sair' do painel (clearAllDrafts) a saída não grava mais", () => {
    const first = setup();
    first.unmount();
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
    const second = setup();
    type(body(), "alterado");
    clearAllDrafts();
    second.unmount();
    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
  });

  it("Ctrl+S guarda no navegador e avisa", () => {
    setup();
    type(body(), "guardado");
    fireEvent.keyDown(body(), { key: "s", ctrlKey: true });
    expect(JSON.parse(String(localStorage.getItem(PAGE_KEY))).values.body).toBe("guardado");
    expect(status()).toMatch(/Rascunho salvo neste navegador às \d\d:\d\d\./);
  });

  it("avisa ao recarregar com alteração pendente, e deixa de avisar depois de salvar", async () => {
    stubFetch();
    setup();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    type(body(), "x");
    expect(leave()).toBe(true);
    await submit();
    expect(leave()).toBe(false);
  });

  it("uma opção alterada também avisa ao sair (só existe nesta tela)", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Mostrar as coleções e os documentos"));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("o link 'Ver página pública' e a dica do rascunho", () => {
  it("com publicHref e o estado salvo publicado: o link abre em nova aba, noopener", () => {
    setup();
    const link = /** @type {HTMLAnchorElement} */ (viewLink());
    expect(link.getAttribute("href")).toBe("/maria");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(link.textContent).toContain("(abre em uma nova aba)");
  });

  it("o alvo 'sistema' aponta para '/'", () => {
    setup({ target: "sistema", publicHref: "/" });
    expect(viewLink()?.getAttribute("href")).toBe("/");
  });

  it("sem handle (publicHref nulo): sem link", () => {
    setup({ publicHref: null });
    expect(viewLink()).toBeNull();
  });

  it("um endereço que não é do site (//outro, https:, barra invertida) não vira link", () => {
    for (const bad of ["//outro-site.test/x", "https://outro-site.test", "/a\\b", "/a b", "javascript:alert(1)"]) {
      setup({ publicHref: bad });
      expect(viewLink(), bad).toBeNull();
      cleanup();
    }
  });

  it("com o estado SALVO em rascunho: a dica no lugar do link", () => {
    setup({ initial: { ...PAGE, homeStatus: "DRAFT" } });
    expect(viewLink()).toBeNull();
    expect(screen.getByText("O texto está em rascunho: a página pública mostra a descrição.")).toBeTruthy();
  });

  it("o estado só conta depois de salvo: passar para rascunho na tela não troca o link pela dica", async () => {
    stubFetch();
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    expect(viewLink()).toBeTruthy();
    expect(screen.queryByText(/O texto está em rascunho/)).toBeNull();
    await submit();
    expect(viewLink()).toBeNull();
    expect(screen.getByText(/O texto está em rascunho/)).toBeTruthy();
  });

  it("com alterações não salvas, avisa que o link abre a versão salva", () => {
    setup();
    expect(screen.queryByText(/abre a versão salva/)).toBeNull();
    type(body(), "mudei");
    expect(screen.getByText(/abre a versão salva, sem as alterações ainda não salvas/)).toBeTruthy();
  });
});

describe("home-client: saveHome", () => {
  it("PUT parcial para o endereço do alvo, sem version", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ homeBody: "x" }));
    const result = await saveHome({ target: "pagina", patch: { homeBody: "x" }, fetchImpl: /** @type {any} */ (fetchImpl) });
    expect(result).toEqual({ ok: true, data: { homeBody: "x" } });
    expect(/** @type {any} */ (fetchImpl).mock.calls[0][0]).toBe("/api/home");
    expect(JSON.parse(String(/** @type {any} */ (fetchImpl).mock.calls[0][1].body))).toEqual({ homeBody: "x" });
  });

  it("um erro de campo desconhecido vai para a mensagem geral, não some", async () => {
    stubFetch(() => problem(422, "VALIDATION_ERROR", [{ field: "outro", message: "Algo errado." }]));
    setup();
    type(body(), "x");
    await submit();
    expect(screen.getByText(/Algo errado\./)).toBeTruthy();
  });
});

describe("AppearanceTargetTabs com os rótulos da página inicial", () => {
  it("os padrões da aparência não mudam", () => {
    render(<AppearanceTargetTabs role="admin" active="sistema" />);
    expect(screen.getByRole("navigation", { name: "Aparência a editar" })).toBeTruthy();
    expect(screen.getByText("Aparência do sistema")).toBeTruthy();
    expect(screen.getByText("Minha página")).toBeTruthy();
  });

  it("rótulos próprios: 'Página inicial do sistema' e 'Minha página inicial'", () => {
    render(
      <AppearanceTargetTabs
        role="admin"
        active="pagina"
        systemHref="?alvo=sistema"
        pageHref="?alvo=pagina"
        labels={{ nav: "Página inicial a editar", system: "Página inicial do sistema", page: "Minha página inicial" }}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Página inicial a editar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Página inicial do sistema/ }).getAttribute("href")).toBe("?alvo=sistema");
    expect(screen.getByRole("link", { name: /^Minha página inicial/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByText("Aparência do sistema")).toBeNull();
  });

  it("só o administrador vê o seletor", () => {
    const { container } = render(<AppearanceTargetTabs role="user" active="pagina" labels={{ page: "Minha página inicial" }} />);
    expect(container.innerHTML).toBe("");
  });
});
