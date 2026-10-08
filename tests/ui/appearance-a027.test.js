// @vitest-environment jsdom
// Formulários de aparência e de configuração na A-027 (épico v1; D-34, D-35, D-38, D-40, D-41): o
// `router.refresh()` depois de salvar (defeito do item 6), a barra superior (`showLogo`/`showName`,
// "pelo menos um ligado"), o par de ícones do botão de modo, a HERANÇA da aparência do sistema, o
// título do diretório, a divisão do ConfigurationForm e o seletor do alvo do administrador. A API é
// um fetch simulado e o roteador, um dublê; o navegador de verdade fica para o ensaio sobre o build.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});
vi.mock("@/components/markdown/MarkdownRenderer", async () => {
  const { createElement } = await import("react");
  return { MarkdownRenderer: ({ markdown }) => createElement("div", { "data-testid": "renderizado" }, markdown) };
});

import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { ConfigurationForm } from "@/components/admin/ConfigurationForm";
import { PortalSettingsForm } from "@/components/admin/PortalSettingsForm";
import { SiteIdentityForm } from "@/components/admin/SiteIdentityForm";
import { MESSAGES } from "@/components/admin/appearance-model";
import { DEFAULT_PALETTES } from "@/lib/theme";

const RECORD = {
  siteName: "Espaço da Maria",
  siteDescription: null,
  ...DEFAULT_PALETTES.light,
  ...DEFAULT_PALETTES.dark,
};
const SYSTEM = {
  siteName: "Vitrine da Casa",
  primaryColor: "#112233",
  secondaryColor: "#223344",
  accentColor: "#334455",
  darkPrimaryColor: "#ccddee",
  darkSecondaryColor: "#bbccdd",
  darkAccentColor: "#aabbcc",
};
const INHERITING = {
  ...RECORD,
  siteName: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  darkPrimaryColor: null,
  darkSecondaryColor: null,
  darkAccentColor: null,
};
const SITE = { ...RECORD, siteName: "Vitrine", homeBody: "# Bem-vindo", directoryEnabled: true, directoryTitle: "Espaços" };

const json = (/** @type {number} */ status, /** @type {unknown} */ body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const failure = (/** @type {number} */ status, /** @type {unknown[]} */ details = [], code = "VALIDATION_ERROR") =>
  json(status, { error: { code, message: "m", details } });
const saved = (/** @type {object} */ data, /** @type {unknown[]} */ warnings = []) => json(200, { data, warnings });

/** @param {...Response} responses */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  refresh.mockClear();
});
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
const submit = () => fireEvent.click(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: /^Salvar|Salvando/ })));
const previewOf = (/** @type {"claro" | "noturno"} */ mode) => screen.getByRole("group", { name: `Pré-visualização do modo ${mode}` });
const topbar = () => screen.getByRole("group", { name: "Barra superior" });
const logoBox = () => /** @type {HTMLInputElement} */ (within(topbar()).getByRole("checkbox", { name: "Mostrar o logotipo" }));
const nameBox = () => /** @type {HTMLInputElement} */ (within(topbar()).getByRole("checkbox", { name: "Mostrar o nome" }));

describe("router.refresh() depois de salvar (defeito do item 6: o layout do painel persiste)", () => {
  const cases = /** @type {const} */ ([
    ["AppearanceForm", () => <AppearanceForm initial={RECORD} />, "/api/appearance", () => typeIn(field("Nome do espaço"), "Outro")],
    ["SiteIdentityForm", () => <SiteIdentityForm initial={SITE} />, "/api/configuration", () => typeIn(color("clara", "Primária"), "#1d4ed8")],
    ["PortalSettingsForm", () => <PortalSettingsForm initial={SITE} />, "/api/configuration", () => typeIn(field("Título do diretório"), "Pessoas")],
  ]);

  it.each(cases)("%s: chama refresh UMA vez depois de um salvamento bem-sucedido, e depois do onSaved", async (_name, element, url, edit) => {
    const order = /** @type {string[]} */ ([]);
    refresh.mockImplementation(() => order.push("refresh"));
    const fetchMock = stubFetch(saved({ ...SITE, siteName: "Outro", primaryColor: "#1d4ed8", directoryTitle: "Pessoas" }));
    const onSaved = vi.fn(() => order.push("onSaved"));
    render(element().type === AppearanceForm ? <AppearanceForm initial={RECORD} onSaved={onSaved} /> : element().type === SiteIdentityForm ? <SiteIdentityForm initial={SITE} onSaved={onSaved} /> : <PortalSettingsForm initial={SITE} onSaved={onSaved} />);
    edit();
    submit();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(url);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0]).toMatchObject({ siteName: "Outro" });
    expect(order).toEqual(["onSaved", "refresh"]);
  });

  it("não chama refresh quando o servidor recusa (422, 403, 500) nem quando a rede cai", async () => {
    for (const response of [failure(422, [{ field: "siteName", message: "x" }]), failure(403, [], "FORBIDDEN"), json(500, {}), null]) {
      cleanup();
      const fetchMock = vi.fn();
      if (response) fetchMock.mockResolvedValueOnce(response);
      else fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);
      render(<AppearanceForm initial={RECORD} />);
      typeIn(field("Nome do espaço"), "Outro");
      submit();
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("button", { name: /^Salvar/ })).toBeTruthy());
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it("não chama refresh quando não há nada a salvar nem quando a validação local barra o envio", () => {
    const fetchMock = stubFetch();
    render(<SiteIdentityForm initial={SITE} />);
    submit();
    expect(screen.getByText("Nenhuma alteração para salvar.")).toBeTruthy();
    typeIn(color("clara", "Primária"), "azul");
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("o ConfigurationForm (as duas partes) também atualiza o painel depois de cada salvamento", async () => {
    stubFetch(saved({ ...SITE, primaryColor: "#1d4ed8" }), saved({ ...SITE, directoryTitle: "Pessoas" }));
    render(<ConfigurationForm initial={SITE} />);
    typeIn(color("clara", "Primária"), "#1d4ed8");
    fireEvent.click(screen.getByRole("button", { name: "Salvar a aparência do sistema" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    typeIn(field("Título do diretório"), "Pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Salvar o portal" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });
});

describe("barra superior: showLogo e showName (D-34)", () => {
  it.each([
    ["AppearanceForm", () => <AppearanceForm initial={RECORD} />],
    ["SiteIdentityForm", () => <SiteIdentityForm initial={SITE} />],
  ])("%s: os dois vêm ligados quando o registro não os traz", (_name, element) => {
    render(element());
    expect(logoBox().checked).toBe(true);
    expect(nameBox().checked).toBe(true);
  });

  it("respeita o que o registro diz (showLogo falso)", () => {
    render(<AppearanceForm initial={{ ...RECORD, showLogo: false }} />);
    expect(logoBox().checked).toBe(false);
    expect(nameBox().checked).toBe(true);
  });

  it("desligar um vai no corpo, e só ele", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, showLogo: false }));
    render(<AppearanceForm initial={RECORD} />);
    fireEvent.click(logoBox());
    expect(logoBox().checked).toBe(false);
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ showLogo: false });
  });

  it("desligar o ÚLTIMO ligado é recusado, com a mensagem, sem enviar", () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={{ ...RECORD, showLogo: false }} />);
    fireEvent.click(nameBox());
    expect(nameBox().checked).toBe(true);
    expect(within(topbar()).getByText(MESSAGES.topbar)).toBeTruthy();
    expect(within(topbar()).getByRole("alert").textContent).toContain(MESSAGES.topbar);
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("e a regra vale nos dois sentidos (o logo é o último)", () => {
    render(<SiteIdentityForm initial={{ ...SITE, showName: false }} />);
    fireEvent.click(logoBox());
    expect(logoBox().checked).toBe(true);
    expect(within(topbar()).getByText(MESSAGES.topbar)).toBeTruthy();
  });

  it("ligar o outro de volta tira a mensagem e libera desligar o primeiro", () => {
    render(<AppearanceForm initial={{ ...RECORD, showLogo: false }} />);
    fireEvent.click(nameBox()); // recusado
    fireEvent.click(logoBox()); // liga o logo
    expect(within(topbar()).queryByText(MESSAGES.topbar)).toBeNull();
    fireEvent.click(nameBox()); // agora o nome pode sair
    expect(nameBox().checked).toBe(false);
  });

  it("a pré-visualização acompanha: sem nome, o nome sai da barra; sem logo, sai o desenho", () => {
    render(<AppearanceForm initial={RECORD} />);
    const banner = () => within(previewOf("claro")).getByRole("banner", { hidden: true });
    expect(within(banner()).getByText("Espaço da Maria")).toBeTruthy();
    expect(banner().querySelector("svg[data-testid='logo-padrao']")).toBeTruthy();
    fireEvent.click(nameBox());
    // O texto visível some (o nome acessível do logo, no <title> do desenho, continua).
    expect(within(banner()).queryByText("Espaço da Maria", { ignore: "script, style, title" })).toBeNull();
    fireEvent.click(nameBox());
    fireEvent.click(logoBox());
    expect(banner().querySelector("svg[data-testid='logo-padrao']")).toBeNull();
    expect(within(banner()).getByText("Espaço da Maria")).toBeTruthy();
  });

  it("um erro 422 do servidor sobre showName aparece no bloco da barra", async () => {
    stubFetch(failure(422, [{ field: "showName", message: "Mensagem do servidor." }]));
    render(<AppearanceForm initial={RECORD} />);
    fireEvent.click(logoBox());
    submit();
    expect(await within(topbar()).findByText("Mensagem do servidor.")).toBeTruthy();
  });
});

describe("par de ícones do botão de modo (D-35): só o sistema o escolhe", () => {
  const pairGroup = () => screen.getByRole("group", { name: "Ícones do botão de modo claro/escuro" });

  it("a aparência do usuário não o tem", () => {
    render(<AppearanceForm initial={RECORD} />);
    expect(screen.queryByRole("group", { name: "Ícones do botão de modo claro/escuro" })).toBeNull();
  });

  it("o sistema tem os quatro pares, cada um com a pré-visualização dos dois ícones e o nome em texto", () => {
    render(<SiteIdentityForm initial={SITE} />);
    const radios = within(pairGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(radios.map((radio) => /** @type {HTMLInputElement} */ (radio).value)).toEqual(["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);
    for (const radio of radios) {
      expect(radio.closest("label").querySelectorAll("svg")).toHaveLength(2);
    }
    const drawings = radios.map((radio) => radio.closest("label").querySelector("span[aria-hidden]").innerHTML);
    expect(new Set(drawings).size).toBe(4);
    for (const name of ["Sol e lua", "Sol e lua, de contorno", "Lâmpada acesa e apagada", "Círculo meio cheio"]) {
      expect(within(pairGroup()).getByRole("radio", { name })).toBeTruthy();
    }
  });

  it("o padrão (sem modeIconPair no registro) é Sol e lua; o do registro é respeitado", () => {
    const first = render(<SiteIdentityForm initial={SITE} />);
    expect(/** @type {HTMLInputElement} */ (within(pairGroup()).getByRole("radio", { name: "Sol e lua" })).checked).toBe(true);
    first.unmount();
    render(<SiteIdentityForm initial={{ ...SITE, modeIconPair: "lightbulb" }} />);
    expect(/** @type {HTMLInputElement} */ (within(pairGroup()).getByRole("radio", { name: "Lâmpada acesa e apagada" })).checked).toBe(true);
  });

  it("escolher outro vai no corpo; o mesmo par não vai", async () => {
    const fetchMock = stubFetch(saved({ ...SITE, modeIconPair: "contrast_half" }));
    render(<SiteIdentityForm initial={SITE} />);
    submit();
    expect(screen.getByText("Nenhuma alteração para salvar.")).toBeTruthy();
    fireEvent.click(within(pairGroup()).getByRole("radio", { name: "Círculo meio cheio" }));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ modeIconPair: "contrast_half" });
  });

  it("os radios formam um grupo (a seta troca de opção) e têm o mesmo nome", () => {
    render(<SiteIdentityForm initial={SITE} />);
    const names = new Set(within(pairGroup()).getAllByRole("radio").map((radio) => /** @type {HTMLInputElement} */ (radio).name));
    expect(names.size).toBe(1);
  });
});

describe("herança da aparência do sistema na AppearanceForm (D-40)", () => {
  const swatches = (/** @type {"claro" | "noturno"} */ mode) => screen.getByRole("list", { name: `Paleta do sistema, modo ${mode}` });

  it("uma paleta nula mostra 'usa a paleta do sistema' com as cores do sistema como referência, só leitura", () => {
    render(<AppearanceForm initial={INHERITING} system={SYSTEM} />);
    expect(within(palette("clara")).getByText(/usa a paleta do sistema/)).toBeTruthy();
    const list = swatches("claro");
    expect(within(list).getByText("#112233")).toBeTruthy();
    expect(within(list).getByText("#223344")).toBeTruthy();
    expect(within(list).getByText("#334455")).toBeTruthy();
    expect(within(swatches("noturno")).getByText("#ccddee")).toBeTruthy();
    // Nenhum campo de cor editável enquanto herda.
    expect(within(palette("clara")).queryByLabelText("Primária", { selector: 'input[type="text"]' })).toBeNull();
  });

  it("o nome vazio herda: o aviso diz qual é o nome do sistema, que aparece como sugestão", () => {
    render(<AppearanceForm initial={INHERITING} system={SYSTEM} />);
    expect(field("Nome do espaço").value).toBe("");
    expect(field("Nome do espaço").placeholder).toBe("Vitrine da Casa");
    expect(screen.getByText("Vazio: usa o nome do sistema (Vitrine da Casa).")).toBeTruthy();
    // E a pré-visualização mostra o nome efetivo.
    expect(within(within(previewOf("claro")).getByRole("banner", { hidden: true })).getByText("Vitrine da Casa")).toBeTruthy();
  });

  it("sem a referência do sistema, o nome sugerido é Vitrine e a paleta é a padrão", () => {
    render(<AppearanceForm initial={INHERITING} />);
    expect(field("Nome do espaço").placeholder).toBe("Vitrine");
    expect(within(swatches("claro")).getByText(DEFAULT_PALETTES.light.primaryColor)).toBeTruthy();
  });

  it("a pré-visualização mostra a paleta EFETIVA (a do sistema) nos modos herdados", () => {
    render(<AppearanceForm initial={INHERITING} system={SYSTEM} />);
    const claro = within(previewOf("claro")).getByRole("banner", { hidden: true }).closest(".vitrine-tema");
    const noturno = previewOf("noturno").querySelector(".vitrine-tema");
    expect(claro.getAttribute("style")).toContain("#112233");
    expect(noturno.getAttribute("style")).toContain("#ccddee");
  });

  it("sem alterar nada, salvar não envia nada (as paletas herdadas continuam herdadas)", () => {
    const fetchMock = stubFetch();
    render(<AppearanceForm initial={INHERITING} system={SYSTEM} />);
    submit();
    expect(screen.getByText("Nenhuma alteração para salvar.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'Definir uma paleta própria' libera os campos, começando pelas cores do sistema, e envia as TRÊS", async () => {
    const fetchMock = stubFetch(saved({ ...INHERITING, primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" }));
    render(<AppearanceForm initial={INHERITING} system={SYSTEM} />);
    fireEvent.click(screen.getByRole("button", { name: "Definir uma paleta clara própria" }));
    expect(color("clara", "Primária").value).toBe("#112233");
    expect(color("clara", "Secundária").value).toBe("#223344");
    expect(color("clara", "Destaque").value).toBe("#334455");
    // O modo noturno segue herdando.
    expect(within(palette("noturna")).getByText(/usa a paleta do sistema/)).toBeTruthy();
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" });
  });

  it("'Usar a aparência do sistema' anula SÓ a paleta do modo (as três cores como null)", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, darkPrimaryColor: null, darkSecondaryColor: null, darkAccentColor: null }));
    render(<AppearanceForm initial={RECORD} system={SYSTEM} />);
    expect(color("noturna", "Primária").value).toBe(DEFAULT_PALETTES.dark.darkPrimaryColor);
    fireEvent.click(screen.getByRole("button", { name: "Usar a aparência do sistema (paleta noturna)" }));
    expect(within(palette("noturna")).getByText(/usa a paleta do sistema/)).toBeTruthy();
    expect(color("clara", "Primária").value).toBe(DEFAULT_PALETTES.light.primaryColor); // a clara não mudou
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ darkPrimaryColor: null, darkSecondaryColor: null, darkAccentColor: null });
  });

  it("a paleta própria mostra a do sistema como referência e o botão de herdar; o contraste continua avisando", async () => {
    render(<AppearanceForm initial={RECORD} system={SYSTEM} />);
    expect(within(palette("clara")).getByText("Referência: a paleta do sistema.")).toBeTruthy();
    expect(within(swatches("claro")).getByText("#112233")).toBeTruthy();
    typeIn(color("clara", "Primária"), "#ffff00");
    await within(palette("clara")).findByText(/abaixo do mínimo/);
  });

  it("o aviso de contraste não aparece na paleta herdada", async () => {
    render(<AppearanceForm initial={INHERITING} system={{ ...SYSTEM, primaryColor: "#fefefe" }} />);
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(within(palette("clara")).queryByText(/abaixo do mínimo/)).toBeNull();
  });

  it("o nome esvaziado vai como null; herdar e depois personalizar de novo volta ao estado gravado sem alterações", async () => {
    const fetchMock = stubFetch(saved({ ...RECORD, siteName: null }));
    render(<AppearanceForm initial={RECORD} system={SYSTEM} />);
    typeIn(field("Nome do espaço"), "");
    fireEvent.click(screen.getByRole("button", { name: "Usar a aparência do sistema (paleta clara)" }));
    fireEvent.click(screen.getByRole("button", { name: "Definir uma paleta clara própria" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar a aparência do sistema (paleta clara)" }));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({
      siteName: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
    });
  });

  it("depois de salvar a herança, a nova base é a gravada (sem nova alteração, nada a enviar)", async () => {
    stubFetch(saved({ ...RECORD, darkPrimaryColor: null, darkSecondaryColor: null, darkAccentColor: null }));
    render(<AppearanceForm initial={RECORD} system={SYSTEM} />);
    fireEvent.click(screen.getByRole("button", { name: "Usar a aparência do sistema (paleta noturna)" }));
    submit();
    await screen.findByText(/Aparência salva às/);
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    expect(within(palette("noturna")).getByText(/usa a paleta do sistema/)).toBeTruthy();
  });

  it("o formulário do SISTEMA nunca tem herança: paleta sempre completa, com 'Restaurar'", () => {
    render(<SiteIdentityForm initial={SITE} />);
    expect(screen.queryByText(/usa a paleta do sistema/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Usar a aparência do sistema/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar a paleta clara padrão" })).toBeTruthy();
  });
});

describe("PortalSettingsForm: o título do diretório (D-38)", () => {
  it("vem com Espaços por padrão e mostra o contador", () => {
    render(<PortalSettingsForm initial={{ homeBody: "x", directoryEnabled: true }} />);
    expect(field("Título do diretório").value).toBe("Espaços");
    expect(screen.getByText(/De 1 a 40 caracteres \(7 de 40\)/)).toBeTruthy();
  });

  it("trocar o título vai no corpo, aparado", async () => {
    const fetchMock = stubFetch(saved({ ...SITE, directoryTitle: "Pessoas" }));
    render(<PortalSettingsForm initial={SITE} />);
    typeIn(field("Título do diretório"), "  Pessoas ");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).toEqual({ directoryTitle: "Pessoas" });
    expect(await screen.findByText(/^Portal salvo às/)).toBeTruthy();
  });

  it("vazio ou com mais de 40 caracteres é recusado no navegador, com o foco no campo", () => {
    const fetchMock = stubFetch();
    render(<PortalSettingsForm initial={SITE} />);
    typeIn(field("Título do diretório"), "   ");
    submit();
    expect(screen.getByText(MESSAGES.directoryTitle)).toBeTruthy();
    expect(field("Título do diretório").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Título do diretório"));
    typeIn(field("Título do diretório"), "a".repeat(41));
    submit();
    expect(screen.getByText(MESSAGES.directoryTitle)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("40 caracteres passam; editar apaga o erro", async () => {
    const fetchMock = stubFetch(saved({ ...SITE, directoryTitle: "a".repeat(40) }));
    render(<PortalSettingsForm initial={SITE} />);
    typeIn(field("Título do diretório"), "");
    submit();
    expect(screen.getByText(MESSAGES.directoryTitle)).toBeTruthy();
    typeIn(field("Título do diretório"), "a".repeat(40));
    expect(screen.queryByText(MESSAGES.directoryTitle)).toBeNull();
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("um erro 422 do servidor sobre o título fica no campo", async () => {
    stubFetch(failure(422, [{ field: "directoryTitle", message: "Título inválido." }]));
    render(<PortalSettingsForm initial={SITE} />);
    typeIn(field("Título do diretório"), "Novo");
    submit();
    expect(await screen.findByText("Título inválido.")).toBeTruthy();
    expect(field("Título do diretório").getAttribute("aria-invalid")).toBe("true");
  });

  it("não tem nenhum campo de identidade visual (paleta, nome, redes)", () => {
    render(<PortalSettingsForm initial={SITE} />);
    expect(screen.queryByRole("group", { name: "Paleta clara" })).toBeNull();
    expect(screen.queryByLabelText("Nome do site")).toBeNull();
    expect(screen.queryByRole("group", { name: "Barra superior" })).toBeNull();
  });
});

describe("ConfigurationForm: as duas partes, cada uma com o seu envio", () => {
  it("a identidade envia só a identidade, e o portal só o portal", async () => {
    const fetchMock = stubFetch(saved(SITE), saved(SITE));
    render(<ConfigurationForm initial={SITE} />);
    expect(screen.getAllByRole("button", { name: /^Salvar/ }).map((b) => b.textContent)).toEqual(["Salvar a aparência do sistema", "Salvar o portal"]);
    typeIn(field("Nome do site"), "Vitrine 2");
    fireEvent.click(screen.getByRole("button", { name: "Salvar a aparência do sistema" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock, 0)).toEqual({ siteName: "Vitrine 2" });
    typeIn(field("Título do diretório"), "Pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Salvar o portal" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchMock, 1)).toEqual({ directoryTitle: "Pessoas" });
  });
});

describe("AppearanceTargetTabs: o seletor do alvo do administrador (D-41)", () => {
  it("o administrador vê os dois alvos como links, com os endereços padrão", () => {
    render(<AppearanceTargetTabs role="admin" active="sistema" />);
    const nav = screen.getByRole("navigation", { name: "Aparência a editar" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["?alvo=sistema", "?alvo=pagina"]);
    expect(within(nav).getByRole("link", { name: /Aparência do sistema/ })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: /Minha página/ })).toBeTruthy();
  });

  it("o usuário comum NÃO o vê (nem sem papel)", () => {
    for (const role of ["user", undefined, "", "ADMIN"]) {
      cleanup();
      const { container } = render(<AppearanceTargetTabs role={role} active="pagina" />);
      expect(container.innerHTML, String(role)).toBe("");
    }
  });

  it("o alvo corrente leva aria-current=page (e só ele), e a troca de alvo troca a marca", () => {
    const { rerender } = render(<AppearanceTargetTabs role="admin" active="sistema" />);
    expect(screen.getByRole("link", { name: /Aparência do sistema/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Minha página/ }).getAttribute("aria-current")).toBeNull();
    rerender(<AppearanceTargetTabs role="admin" active="pagina" />);
    expect(screen.getByRole("link", { name: /Minha página/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Aparência do sistema/ }).getAttribute("aria-current")).toBeNull();
  });

  it("os endereços chegam por props", () => {
    render(<AppearanceTargetTabs role="admin" active="sistema" systemHref="/admin/aparencia?alvo=sistema" pageHref="/admin/aparencia?alvo=pagina" />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin/aparencia?alvo=sistema", "/admin/aparencia?alvo=pagina"]);
  });

  it("o alvo corrente se distingue sem a cor (sublinhado e negrito) e só usa tokens", () => {
    const { container } = render(<AppearanceTargetTabs role="admin" active="sistema" />);
    const current = screen.getByRole("link", { name: /Aparência do sistema/ });
    expect(current.className).toMatch(/underline/);
    expect(current.className).toMatch(/font-semibold/);
    expect(screen.getByRole("link", { name: /Minha página/ }).className).not.toMatch(/(^| )underline( |$)/);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});
