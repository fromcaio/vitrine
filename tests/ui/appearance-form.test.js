// @vitest-environment jsdom
// Formulários de aparência e de configuração do site (RF18, RF19, RF24, RF30, RF31, RN09, RN17,
// RN25, RN27, RN28; CT23, CT24, CT48; A-015 etapa 3): campos, avisos de contraste por modo (locais
// e do servidor), restaurar os padrões, envio parcial, pré-visualização nos dois modos e as
// mensagens de 401, 403, 422, 429. A API é um fetch simulado; o navegador de verdade fica para o
// ensaio sobre o build de produção.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { ConfigurationForm } from "@/components/admin/ConfigurationForm";
import { DEFAULT_PALETTES } from "@/lib/theme";

// O Markdown é testado à parte (markdown-renderer.test.js): aqui basta ver que o texto chega a ele.
vi.mock("@/components/markdown/MarkdownRenderer", async () => {
  const { createElement } = await import("react");
  return { MarkdownRenderer: ({ markdown }) => createElement("div", { "data-testid": "renderizado" }, markdown) };
});

const RECORD = {
  siteName: "Espaço da Maria",
  siteDescription: "Notas de aula",
  logoUrl: null,
  faviconUrl: null,
  discordUrl: null,
  githubUrl: "https://github.com/maria",
  youtubeUrl: null,
  instagramUrl: null,
  linkedinUrl: null,
  twitchUrl: null,
  ...DEFAULT_PALETTES.light,
  ...DEFAULT_PALETTES.dark,
};
const CONFIG = { ...RECORD, siteName: "Vitrine", homeBody: "# Bem-vindo", directoryEnabled: true };

const jsonResponse = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const failure = (/** @type {number} */ status, /** @type {unknown[]} */ details = [], code = "VALIDATION_ERROR", headers = {}) =>
  jsonResponse(status, { error: { code, message: "m", details } }, headers);
const saved = (/** @type {object} */ data, /** @type {unknown[]} */ warnings = []) => jsonResponse(200, { data, warnings });

/** @param {...(Response | (() => Promise<Response>))} responses */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (typeof response === "function") fetchMock.mockImplementationOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bodyOf = (/** @type {import("vitest").Mock<any>} */ fetchMock, call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);
const field = (/** @type {string} */ label) => /** @type {HTMLInputElement} */ (screen.getByLabelText(label, { selector: "input, textarea" }));
const palette = (/** @type {"clara" | "noturna"} */ which) => screen.getByRole("group", { name: `Paleta ${which}` });
const color = (/** @type {"clara" | "noturna"} */ which, /** @type {string} */ label) =>
  /** @type {HTMLInputElement} */ (within(palette(which)).getByLabelText(label, { selector: 'input[type="text"]' }));
const typeIn = (/** @type {HTMLInputElement} */ input, /** @type {string} */ value) => fireEvent.change(input, { target: { value } });
const saveButton = () => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: /^Salvar|Salvando/ }));
const submit = () => fireEvent.click(saveButton());
const previewOf = (/** @type {"claro" | "noturno"} */ mode) => screen.getByRole("group", { name: `Pré-visualização do modo ${mode}` });

describe("estrutura e acessibilidade", () => {
  it("tem os blocos de identidade, redes, as duas paletas e as duas pré-visualizações", () => {
    render(<AppearanceForm initial={RECORD} />);
    for (const name of ["Identidade", "Redes sociais", "Paleta clara", "Paleta noturna"]) expect(screen.getByRole("group", { name })).toBeTruthy();
    expect(previewOf("claro")).toBeTruthy();
    expect(previewOf("noturno")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pré-visualização" })).toBeTruthy();
  });

  it("mostra os valores iniciais; o que é nulo vira campo vazio", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(field("Nome do espaço").value).toBe("Espaço da Maria");
    expect(field("Descrição").value).toBe("Notas de aula");
    expect(field("GitHub").value).toBe("https://github.com/maria");
    expect(field("Discord").value).toBe("");
    expect(field("Logotipo").value).toBe("");
    expect(color("clara", "Primária").value).toBe("#2563eb");
    expect(color("noturna", "Primária").value).toBe("#60a5fa");
  });

  it("a aparência chama o campo de nome do espaço; a configuração, do site, e só ela tem o portal", () => {
    const { unmount } = render(<AppearanceForm initial={RECORD} />);
    expect(screen.queryByRole("group", { name: "Portal" })).toBeNull();
    unmount();
    render(<ConfigurationForm initial={CONFIG} />);
    expect(field("Nome do site").value).toBe("Vitrine");
    expect(screen.getByRole("group", { name: "Portal" })).toBeTruthy();
  });

  it("os seis links sociais têm rótulo, e o logotipo e o favicon explicam o que vale (D-10)", () => {
    render(<AppearanceForm initial={RECORD} />);
    for (const name of ["Discord", "GitHub", "YouTube", "Instagram", "LinkedIn", "Twitch"]) expect(field(name)).toBeTruthy();
    expect(screen.getAllByText(/URL http\(s\) ou caminho de um arquivo de public\//)).toHaveLength(2);
    expect(field("Logotipo").getAttribute("aria-describedby")).toMatch(/-hint$/);
  });

  it("cada paleta tem três campos de cor, cada um com texto e seletor nativo", () => {
    render(<AppearanceForm initial={RECORD} />);
    for (const which of /** @type {const} */ (["clara", "noturna"])) {
      for (const label of ["Primária", "Secundária", "Destaque"]) {
        expect(color(which, label)).toBeTruthy();
        expect(within(palette(which)).getByLabelText(`${label}: seletor de cor`)).toBeTruthy();
      }
    }
  });

  it("os avisos de contraste são regiões aria-live educadas, sempre presentes", () => {
    render(<AppearanceForm initial={RECORD} />);
    for (const which of /** @type {const} */ (["clara", "noturna"])) {
      expect(palette(which).querySelector('[aria-live="polite"]')).toBeTruthy();
    }
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<ConfigurationForm initial={CONFIG} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|text-black|(bg|text|border)-(slate|gray|zinc|neutral|red|blue)-\d/);
  });

  it("não usa a validação nativa do navegador (as mensagens são as do servidor)", () => {
    const { container } = render(<AppearanceForm initial={RECORD} />);
    expect(container.querySelector("form")?.hasAttribute("novalidate")).toBe(true);
  });
});

describe("aviso de contraste por modo, enquanto se edita (RN09, RN27; CT24)", () => {
  it("as paletas padrão não têm aviso", async () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(screen.queryByText(/abaixo do mínimo/)).toBeNull();
  });

  it("uma primária noturna escura demais avisa só na paleta noturna, no campo darkPrimaryColor", async () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    const warning = await within(palette("noturna")).findByText(/A cor primária noturna tem contraste de .* com o fundo noturno \(#0A0A0A\)/);
    expect(warning.closest("li")?.getAttribute("data-field")).toBe("darkPrimaryColor");
    expect(within(palette("clara")).queryByText(/abaixo do mínimo/)).toBeNull();
  });

  it("uma primária clara clara demais avisa só na paleta clara, contra o branco", async () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("clara", "Primária"), "#ffff00");
    const warning = await within(palette("clara")).findByText(/A cor primária tem contraste de .* com o branco/);
    expect(warning.closest("li")?.getAttribute("data-field")).toBe("primaryColor");
    expect(within(palette("noturna")).queryByText(/abaixo do mínimo/)).toBeNull();
  });

  it("corrigir a cor faz o aviso sumir", async () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Destaque"), "#111111");
    await within(palette("noturna")).findByText(/destaque noturna/);
    typeIn(color("noturna", "Destaque"), "#fbbf24");
    await waitFor(() => expect(within(palette("noturna")).queryByText(/destaque noturna/)).toBeNull());
  });

  it("o aviso é adiado: digitar não o anuncia a cada tecla", async () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    expect(within(palette("noturna")).queryByText(/abaixo do mínimo/)).toBeNull();
    await within(palette("noturna")).findByText(/abaixo do mínimo/);
  });

  it("não bloqueia o salvamento (RN09): a gravação segue com o aviso na tela", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, darkPrimaryColor: "#333333" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    await within(palette("noturna")).findByText(/abaixo do mínimo/);
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock)).toEqual({ darkPrimaryColor: "#333333" });
  });
});

describe("restaurar as paletas padrão (ADR-031)", () => {
  it("restaura só a paleta do botão clicado, e o aviso daquele modo some", async () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("clara", "Primária"), "#ffff00");
    typeIn(color("noturna", "Primária"), "#333333");
    await within(palette("noturna")).findByText(/abaixo do mínimo/);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta noturna padrão" }));
    expect(color("noturna", "Primária").value).toBe("#60a5fa");
    expect(color("clara", "Primária").value).toBe("#ffff00");
    await waitFor(() => expect(within(palette("noturna")).queryByText(/abaixo do mínimo/)).toBeNull());
    expect(within(palette("clara")).getByText(/abaixo do mínimo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta clara padrão" }));
    expect(color("clara", "Primária").value).toBe("#2563eb");
  });

  it("restaura as três cores do modo e o envio leva só as que diferiam da gravada", async () => {
    const custom = { ...RECORD, darkPrimaryColor: "#fdba74", darkSecondaryColor: "#7c2d12", darkAccentColor: "#fb923c" };
    const fetchMock = stubFetch(saved(RECORD));
    render(<AppearanceForm initial={custom} />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta noturna padrão" }));
    for (const [label, value] of [["Primária", "#60a5fa"], ["Secundária", "#cbd5e1"], ["Destaque", "#fbbf24"]]) {
      expect(color("noturna", label).value).toBe(value);
    }
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock)).toEqual({ darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" });
  });

  it("apaga o erro de formato das cores restauradas", () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("clara", "Primária"), "#12");
    submit();
    expect(within(palette("clara")).getByText("A cor deve estar no formato #RRGGBB.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta clara padrão" }));
    expect(within(palette("clara")).queryByText("A cor deve estar no formato #RRGGBB.")).toBeNull();
  });

  it("restaurar uma paleta que já é a padrão não cria alteração", () => {
    render(<AppearanceForm initial={RECORD} />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta clara padrão" }));
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
  });
});

describe("envio parcial (PUT /api/appearance)", () => {
  it("envia só o que mudou, como JSON, e confirma", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, siteName: "Novo nome" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "  Novo nome ");
    expect(screen.getByText("Há alterações ainda não gravadas.")).toBeTruthy();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/appearance");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(bodyOf(fetchMock)).toEqual({ siteName: "Novo nome" });
    expect(await screen.findByText(/^Aparência salva às \d{2}:\d{2}\.$/)).toBeTruthy();
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
  });

  it("depois de gravar, a base é a gravada: sem nova mudança, não há envio", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, siteName: "Novo nome" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "Novo nome");
    submit();
    await screen.findByText(/Aparência salva/);
    submit();
    expect(await screen.findByText("Nenhuma alteração para salvar.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sem alteração nenhuma, não envia e avisa", async () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={RECORD} />);
    submit();
    expect(await screen.findByText("Nenhuma alteração para salvar.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a cor vai em minúsculas e a descrição aparada", async () => {
    const fetchMock = stubFetch(saved(RECORD));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("clara", "Destaque"), "#B45300");
    typeIn(field("Descrição"), "  Outra descrição  ");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ accentColor: "#b45300", siteDescription: "Outra descrição" });
  });

  it("um link esvaziado vai como cadeia vazia (o servidor o remove); um link novo vai como está", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, githubUrl: null, twitchUrl: "https://twitch.tv/maria" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("GitHub"), "");
    typeIn(field("Twitch"), "https://twitch.tv/maria");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ githubUrl: "", twitchUrl: "https://twitch.tv/maria" });
  });

  it("enquanto grava, o botão fica desabilitado e diz 'Salvando…'", async () => {
    let finish = /** @type {(response: Response) => void} */ (() => {});
    const fetchMock = stubFetch(() => new Promise((resolve) => { finish = resolve; }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "Outro");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent).toBe("Salvando…");
    finish(saved({ ...RECORD, siteName: "Outro" }));
    await screen.findByText(/Aparência salva/);
    expect(saveButton().disabled).toBe(false);
  });

  it("o servidor aparou os textos: a tela adota o valor gravado se o autor não editou durante o envio", async () => {
    stubFetch(saved({ ...RECORD, siteName: "Gravado", siteDescription: null }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "  Gravado ");
    typeIn(field("Descrição"), "");
    submit();
    await screen.findByText(/Aparência salva/);
    expect(field("Nome do espaço").value).toBe("Gravado");
    expect(field("Descrição").value).toBe("");
  });

  it("uma edição feita durante o envio não se perde", async () => {
    let finish = /** @type {(response: Response) => void} */ (() => {});
    const fetchMock = stubFetch(() => new Promise((resolve) => { finish = resolve; }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "Primeiro");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    typeIn(field("Nome do espaço"), "Segundo");
    finish(saved({ ...RECORD, siteName: "Primeiro" }));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(field("Nome do espaço").value).toBe("Segundo");
    expect(screen.getByText("Há alterações ainda não gravadas.")).toBeTruthy();
  });
});

describe("avisos do servidor depois de gravar (RN26)", () => {
  const SERVER_WARNING = { code: "LOW_CONTRAST", field: "darkPrimaryColor", ratio: 1.6, minimum: 4.5, message: "A cor primária noturna tem contraste de 1,60:1 com o fundo noturno (#0A0A0A), abaixo do mínimo de 4,5:1 (WCAG 2.1 AA)." };

  it("mostra o aviso do servidor na paleta do modo, e o OK no outro modo", async () => {
    stubFetch(saved({ ...RECORD, darkPrimaryColor: "#333333" }, [SERVER_WARNING]));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    submit();
    expect(await within(palette("noturna")).findByText(SERVER_WARNING.message, { selector: "span" })).toBeTruthy();
    expect(within(palette("noturna")).getByText("Contraste na última gravação (servidor)")).toBeTruthy();
    expect(within(palette("clara")).getByText("O servidor não encontrou problemas de contraste.")).toBeTruthy();
  });

  it("o aviso diz que ficou nas notificações, e a mensagem de gravação continua", async () => {
    stubFetch(saved({ ...RECORD, darkPrimaryColor: "#333333" }, [SERVER_WARNING]));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    submit();
    const notice = await screen.findByText(/Aparência salva às/);
    expect(notice.textContent).toContain("O servidor avisou sobre o contraste (abaixo) e registrou o aviso nas suas notificações.");
  });

  it("uma gravação sem avisos mostra o OK nos dois modos, e a paleta corrigida tira o aviso", async () => {
    stubFetch(saved({ ...RECORD, darkPrimaryColor: "#333333" }, [SERVER_WARNING]), saved(RECORD, []));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#333333");
    submit();
    await within(palette("noturna")).findByText(SERVER_WARNING.message, { selector: "span" });
    fireEvent.click(screen.getByRole("button", { name: "Restaurar a paleta noturna padrão" }));
    submit();
    await waitFor(() => expect(within(palette("noturna")).queryByText(SERVER_WARNING.message, { selector: "span" })).toBeNull());
    expect(within(palette("noturna")).getByText("O servidor não encontrou problemas de contraste.")).toBeTruthy();
    expect((await screen.findByText(/Aparência salva às/)).textContent).not.toContain("notificações");
  });

  it("os avisos do servidor só aparecem depois da primeira gravação", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(screen.queryByText("Contraste na última gravação (servidor)")).toBeNull();
  });
});

describe("validação no navegador, sem enviar", () => {
  it("o nome em branco, com o foco nele", () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "   ");
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("O nome do site é obrigatório.")).toBeTruthy();
    expect(field("Nome do espaço").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Nome do espaço"));
  });

  it("a cor fora do formato, no campo da paleta certa", () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Secundária"), "azul");
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(palette("noturna")).getByText("A cor deve estar no formato #RRGGBB.")).toBeTruthy();
    expect(within(palette("clara")).queryByText("A cor deve estar no formato #RRGGBB.")).toBeNull();
    expect(document.activeElement).toBe(color("noturna", "Secundária"));
  });

  it("o link que não é http(s), com o foco no primeiro campo inválido na ordem da tela", () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Instagram"), "javascript:alert(1)");
    typeIn(field("Discord"), "discord.gg/x");
    typeIn(field("Logotipo"), "logo.png");
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Informe uma URL absoluta com protocolo http ou https.")).toHaveLength(2);
    expect(screen.getByText("Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).")).toBeTruthy();
    expect(document.activeElement).toBe(field("Logotipo"));
  });

  it("editar o campo apaga o erro dele", () => {
    stubFetch();
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Twitch"), "ftp://x");
    submit();
    expect(screen.getByText("Informe uma URL absoluta com protocolo http ou https.")).toBeTruthy();
    typeIn(field("Twitch"), "https://twitch.tv/x");
    expect(screen.queryByText("Informe uma URL absoluta com protocolo http ou https.")).toBeNull();
    expect(field("Twitch").getAttribute("aria-invalid")).toBeNull();
  });

  it("logotipo por caminho de public/ e link vazio são válidos", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, logoUrl: "/logo.png" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Logotipo"), "/logo.png");
    typeIn(field("Discord"), "   ");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ logoUrl: "/logo.png" });
  });
});

describe("erros da API em português; o rascunho fica na tela", () => {
  async function failWith(/** @type {Response | (() => Promise<Response>)} */ response, kind = "appearance") {
    const fetchMock = stubFetch(response);
    if (kind === "appearance") render(<AppearanceForm initial={RECORD} />);
    else render(<ConfigurationForm initial={CONFIG} />);
    typeIn(field(kind === "appearance" ? "Nome do espaço" : "Nome do site"), "Nome editado");
    typeIn(color("clara", "Destaque"), "#aa5500");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    return fetchMock;
  }

  it("401: a sessão expirou, com o link do login e as alterações na tela", async () => {
    await failWith(failure(401, [], "UNAUTHENTICATED"));
    expect(await screen.findByText(/Sua sessão expirou\. Entre de novo para salvar\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir o login em outra aba" }).getAttribute("href")).toBe("/login");
    expect(field("Nome do espaço").value).toBe("Nome editado");
    expect(color("clara", "Destaque").value).toBe("#aa5500");
    expect(saveButton().disabled).toBe(false);
  });

  it("403 na aparência e 403 na configuração têm textos próprios", async () => {
    await failWith(failure(403, [], "FORBIDDEN"));
    expect(await screen.findByText("Você não tem permissão para alterar esta aparência.")).toBeTruthy();
    cleanup();
    await failWith(failure(403, [], "FORBIDDEN"), "configuration");
    expect(await screen.findByText("Só o administrador pode alterar a configuração do site.")).toBeTruthy();
  });

  it("422: a mensagem de cada campo fica nele, o foco vai ao primeiro e o rascunho permanece", async () => {
    await failWith(
      failure(422, [
        { field: "accentColor", message: "A cor deve estar no formato #RRGGBB." },
        { field: "siteName", message: "O nome do site é obrigatório." },
      ]),
    );
    expect(await within(palette("clara")).findByText("A cor deve estar no formato #RRGGBB.")).toBeTruthy();
    expect(screen.getByText("O nome do site é obrigatório.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Nome do espaço"));
    expect(field("Nome do espaço").value).toBe("Nome editado");
  });

  it("422 com um campo desconhecido vira a mensagem geral", async () => {
    await failWith(failure(422, [{ field: "outro", message: "Algo estranho." }]));
    expect(await screen.findByText("Algo estranho.")).toBeTruthy();
  });

  it("429: pede para aguardar e diz os segundos do Retry-After", async () => {
    await failWith(failure(429, [], "RATE_LIMITED", { "Retry-After": "42" }));
    expect(await screen.findByText(/Muitas alterações em pouco tempo\..* Tente de novo em 42 segundos\./)).toBeTruthy();
  });

  it("5xx e sem rede: mensagens de servidor e de conexão", async () => {
    await failWith(new Response("<html>erro</html>", { status: 502 }));
    expect(await screen.findByText("O servidor não conseguiu salvar agora. Tente de novo em instantes.")).toBeTruthy();
    cleanup();
    await failWith(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("depois de um erro, corrigir e salvar de novo envia o mesmo rascunho", async () => {
    const fetchMock = stubFetch(failure(429, [], "RATE_LIMITED"), saved({ ...RECORD, siteName: "Nome editado" }));
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "Nome editado");
    submit();
    await screen.findByText(/Muitas alterações/);
    submit();
    await screen.findByText(/Aparência salva/);
    expect(bodyOf(fetchMock, 1)).toEqual({ siteName: "Nome editado" });
    expect(screen.queryByText(/Muitas alterações/)).toBeNull();
  });
});

describe("pré-visualização nos dois modos (RF31)", () => {
  const styleOf = (/** @type {"claro" | "noturno"} */ mode) =>
    (previewOf(mode).querySelector(".vitrine-tema")?.getAttribute("style") ?? "").toLowerCase();

  it("é inerte (não entra na ordem de tabulação) e usa o modo forçado de cada lado", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(previewOf("claro").classList.contains("vitrine-modo-claro")).toBe(true);
    expect(previewOf("noturno").classList.contains("vitrine-modo-escuro")).toBe(true);
    for (const mode of /** @type {const} */ (["claro", "noturno"])) {
      expect(previewOf(mode).querySelector("[inert]")).toBeTruthy();
      expect(previewOf(mode).querySelector("main")?.id).toMatch(/-amostra$/);
      expect(previewOf(mode).querySelector("button[role], [role=group][aria-label='Modo de cor']")).toBeNull();
    }
  });

  it("os ids dos <main> das duas amostras diferem entre si e do da página", () => {
    render(<AppearanceForm initial={RECORD} />);
    const ids = [...document.querySelectorAll("main")].map((main) => main.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("conteudo-principal");
  });

  it("o style de cada amostra tem as dez variáveis com as cores do rascunho", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(styleOf("claro")).toContain("--vitrine-light-primary: #2563eb");
    expect(styleOf("claro")).toContain("--vitrine-dark-primary: #60a5fa");
    expect(styleOf("noturno")).toContain("--vitrine-dark-secondary: #cbd5e1");
    expect(styleOf("claro").match(/--vitrine-(light|dark)-/g)).toHaveLength(10);
  });

  it("acompanha o que se digita: a cor noturna muda a variável dark, a clara muda a light", () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("noturna", "Primária"), "#FF00FF");
    expect(styleOf("noturno")).toContain("--vitrine-dark-primary: #ff00ff");
    expect(styleOf("claro")).toContain("--vitrine-light-primary: #2563eb");
    typeIn(color("clara", "Primária"), "#00FF00");
    expect(styleOf("claro")).toContain("--vitrine-light-primary: #00ff00");
  });

  it("o texto sobre a cor é calculado por modo (secundária escura no noturno pede texto claro)", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(styleOf("noturno")).toContain("--vitrine-dark-on-secondary: #000000");
    typeIn(color("noturna", "Secundária"), "#1e3a8a");
    expect(styleOf("noturno")).toContain("--vitrine-dark-on-secondary: #ffffff");
    expect(styleOf("claro")).toContain("--vitrine-light-on-secondary: #ffffff");
  });

  it("uma cor ainda incompleta não derruba a pré-visualização: vale a gravada", () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(color("clara", "Primária"), "#12");
    expect(styleOf("claro")).toContain("--vitrine-light-primary: #2563eb");
  });

  it("mostra o nome digitado, o logotipo válido e só os links preenchidos e válidos", () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Nome do espaço"), "Nome ao vivo");
    typeIn(field("Logotipo"), "https://exemplo.com/logo.png");
    typeIn(field("Twitch"), "https://twitch.tv/maria");
    typeIn(field("Discord"), "discord.gg/invalido");
    for (const mode of /** @type {const} */ (["claro", "noturno"])) {
      const preview = within(previewOf(mode));
      expect(preview.getAllByText("Nome ao vivo").length).toBeGreaterThan(0);
      expect(previewOf(mode).querySelector("img")?.getAttribute("src")).toBe("https://exemplo.com/logo.png");
      expect([...previewOf(mode).querySelectorAll("footer a")].map((a) => a.getAttribute("aria-label"))).toEqual([
        "GitHub (abre em uma nova aba)",
        "Twitch (abre em uma nova aba)",
      ]);
    }
  });

  it("um logotipo inválido não vira imagem", () => {
    render(<AppearanceForm initial={RECORD} />);
    typeIn(field("Logotipo"), "javascript:alert(1)");
    submit();
    expect(previewOf("claro").querySelector("img")).toBeNull();
  });

  it("a pré-visualização não rouba o foco ao editar", () => {
    render(<AppearanceForm initial={RECORD} />);
    const input = color("clara", "Primária");
    input.focus();
    typeIn(input, "#AA0000");
    expect(document.activeElement).toBe(input);
  });
});

describe("configuração do site: portal e diretório (RF30, RN28)", () => {
  it("envia para /api/configuration, só o que mudou", async () => {
    const fetchMock = stubFetch(saved({ ...CONFIG, directoryEnabled: false }));
    render(<ConfigurationForm initial={CONFIG} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar o diretório de espaços no portal" }));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/configuration");
    expect(bodyOf(fetchMock)).toEqual({ directoryEnabled: false });
    expect(await screen.findByText(/^Configuração salva às/)).toBeTruthy();
  });

  it("o diretório vem marcado se a configuração o liga, e desmarcado se a desliga", () => {
    const { unmount } = render(<ConfigurationForm initial={CONFIG} />);
    expect(/** @type {HTMLInputElement} */ (screen.getByRole("checkbox")).checked).toBe(true);
    unmount();
    render(<ConfigurationForm initial={{ ...CONFIG, directoryEnabled: false }} />);
    expect(/** @type {HTMLInputElement} */ (screen.getByRole("checkbox")).checked).toBe(false);
  });

  it("o texto do portal vai no corpo quando muda; o Markdown é do autor", async () => {
    const fetchMock = stubFetch(saved({ ...CONFIG, homeBody: "# Novo\n\ntexto" }));
    render(<ConfigurationForm initial={CONFIG} />);
    typeIn(field("Texto do portal (Markdown)"), "# Novo\n\ntexto");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ homeBody: "# Novo\n\ntexto" });
  });

  it("mostra o consumo em bytes e recusa o texto acima do limite, sem enviar (RN25)", () => {
    const fetchMock = stubFetch();
    render(<ConfigurationForm initial={{ ...CONFIG, homeBody: "abc" }} maxBodyBytes={10} />);
    expect(screen.getByText(/3 de 10 bytes/)).toBeTruthy();
    typeIn(field("Texto do portal (Markdown)"), "ação ação ação");
    expect(screen.getByText(/20 de 10 bytes/)).toBeTruthy();
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("O texto do portal tem 20 bytes; o máximo é 10 (0 KiB).").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(field("Texto do portal (Markdown)"));
  });

  it("o limite é do servidor: 422 QUOTA_EXCEEDED mostra os bytes no campo do texto, e o rascunho fica", async () => {
    stubFetch(failure(422, [{ field: "body", bytes: 300000, max: 262144 }], "QUOTA_EXCEEDED"));
    render(<ConfigurationForm initial={CONFIG} />);
    typeIn(field("Texto do portal (Markdown)"), "# um texto");
    submit();
    expect(await screen.findByText("O texto do portal tem 300000 bytes; o máximo é 262144 (256 KiB).")).toBeTruthy();
    expect(field("Texto do portal (Markdown)").value).toBe("# um texto");
    expect(field("Texto do portal (Markdown)").getAttribute("aria-invalid")).toBe("true");
  });

  it("a pré-visualização do texto é opcional e usa o MarkdownRenderer", async () => {
    render(<ConfigurationForm initial={CONFIG} />);
    expect(screen.queryByTestId("renderizado")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Pré-visualizar o texto do portal" });
    fireEvent.click(toggle);
    expect((await screen.findByTestId("renderizado")).textContent).toBe("# Bem-vindo");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("renderizado")).toBeNull();
  });

  it("tem os mesmos blocos de identidade, redes e paletas da aparência, com o aviso por modo", async () => {
    render(<ConfigurationForm initial={CONFIG} />);
    for (const name of ["Identidade", "Redes sociais", "Paleta clara", "Paleta noturna"]) expect(screen.getByRole("group", { name })).toBeTruthy();
    typeIn(color("noturna", "Primária"), "#222222");
    await within(palette("noturna")).findByText(/primária noturna/);
  });
});

describe("alterações não gravadas", () => {
  it("avisa antes de sair só enquanto há alterações", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    render(<AppearanceForm initial={RECORD} />);
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    typeIn(field("Nome do espaço"), "Outro");
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    typeIn(field("Nome do espaço"), "Espaço da Maria");
    expect(remove.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });
});
