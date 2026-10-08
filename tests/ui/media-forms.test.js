// @vitest-environment jsdom
// O envio de imagens e o rodapé dentro dos formulários (A-028): `AppearanceForm` (a página do usuário),
// `SiteIdentityForm` e `ConfigurationForm` (o sistema) e o avatar do `ProfileForm`. Cada alvo fala com a
// API certa (Tabela api-v1); sem as props `media`/`footerLinks`/`avatar`, as seções não aparecem; os
// campos de URL de logotipo e favicon e as redes fixas já não existem.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { ConfigurationForm } from "@/components/admin/ConfigurationForm";
import { ProfileForm } from "@/components/admin/ProfileForm";
import { SiteIdentityForm } from "@/components/admin/SiteIdentityForm";
import { DEFAULT_PALETTES } from "@/lib/theme";

beforeEach(() => refresh.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RECORD = { siteName: "Espaço da Maria", siteDescription: "Notas", ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark };
const CONFIG = { ...RECORD, siteName: "Vitrine", homeBody: "# Bem-vindo", directoryEnabled: true };
const FOOTER = [{ icon: "github", url: "https://github.com/maria" }];
const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Uma API de mídia simulada: devolve um /media/<id> novo a cada PUT. */
function stubApi() {
  const fetchMock = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => {
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (String(url).endsWith("footer-links")) return json({ data: JSON.parse(String(init.body)).links });
    return json({ data: { id: "novo1", url: "/media/novo1", width: 64, height: 64 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const file = (/** @type {string} */ type = "image/png") => new File([new Uint8Array(8)], "a.png", { type });
const previewOf = (/** @type {"claro" | "noturno"} */ mode) => screen.getByRole("group", { name: `Pré-visualização do modo ${mode}` });
const chooseIn = (/** @type {string} */ legend, /** @type {File} */ chosen) => {
  const group = screen.getByRole("group", { name: legend });
  fireEvent.change(/** @type {HTMLInputElement} */ (within(group).getByLabelText(/^Arquivo:/)), { target: { files: [chosen] } });
  return group;
};

describe("sem as props de mídia, as seções não aparecem", () => {
  it("AppearanceForm e SiteIdentityForm", () => {
    for (const element of [<AppearanceForm key="a" initial={RECORD} />, <SiteIdentityForm key="s" initial={CONFIG} />]) {
      const { unmount } = render(element);
      expect(screen.queryByRole("group", { name: "Logotipo" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Favicon" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Links do rodapé" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Rodapé" })).toBeNull();
      unmount();
    }
  });
});

describe("AppearanceForm (a página do usuário)", () => {
  it("mostra o logotipo e o favicon (com a imagem atual) e o rodapé, em seções próprias", () => {
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: "/media/logo1", faviconUrl: "/media/fav1" }} footerLinks={FOOTER} />);
    expect(within(screen.getByRole("group", { name: "Logotipo" })).getByRole("img", { name: "Logotipo atual" }).getAttribute("src")).toBe("/media/logo1");
    expect(within(screen.getByRole("group", { name: "Favicon" })).getByRole("img", { name: "Favicon atual" }).getAttribute("src")).toBe("/media/fav1");
    expect(screen.getByRole("heading", { level: 2, name: "Rodapé" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Links do rodapé" })).toBeTruthy();
  });

  it("os campos de URL de logotipo e favicon e as redes fixas deixaram de existir", () => {
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: null }} footerLinks={[]} />);
    for (const name of ["Discord", "GitHub", "YouTube", "Instagram", "LinkedIn", "Twitch", "Ícone da aba (favicon)"]) expect(screen.queryByLabelText(name)).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Logotipo" })).toBeNull();
  });

  it("a ajuda diz o que vale sem imagem: a do sistema", () => {
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: null }} />);
    expect(screen.getByText(/Sem imagem, vale a do sistema\./)).toBeTruthy();
    expect(screen.getByText(/Sem imagem, vale o do sistema\./)).toBeTruthy();
  });

  it("enviar o logotipo: PUT /api/appearance/logo, multipart, e a pré-visualização dos DOIS modos passa a mostrar o /media/<id>", async () => {
    const fetchMock = stubApi();
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: null }} />);
    expect(previewOf("claro").querySelector("img")).toBeNull();
    const group = chooseIn("Logotipo", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar logotipo" }));
    await within(group).findByText("Logotipo enviado.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/appearance/logo");
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
    for (const mode of /** @type {const} */ (["claro", "noturno"])) expect(previewOf(mode).querySelector("img")?.getAttribute("src")).toBe("/media/novo1");
  });

  it("enviar e remover o favicon: /api/appearance/favicon", async () => {
    const fetchMock = stubApi();
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: "/media/fav1" }} />);
    const group = screen.getByRole("group", { name: "Favicon" });
    fireEvent.click(within(group).getByRole("button", { name: "Remover favicon" }));
    await within(group).findByText("Favicon removido.");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/appearance/favicon");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    chooseIn("Favicon", file("image/jpeg"));
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar favicon" }));
    await within(group).findByText("Favicon enviado.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/appearance/favicon");
  });

  it("remover o logotipo tira a imagem da pré-visualização", async () => {
    stubApi();
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: "/media/logo1", faviconUrl: null }} />);
    expect(previewOf("claro").querySelector("img")?.getAttribute("src")).toBe("/media/logo1");
    const group = screen.getByRole("group", { name: "Logotipo" });
    fireEvent.click(within(group).getByRole("button", { name: "Remover logotipo" }));
    await within(group).findByText("Logotipo removido.");
    expect(previewOf("claro").querySelector("img")).toBeNull();
  });

  it("o envio da imagem não suja o formulário nem entra no PUT de texto", async () => {
    const fetchMock = stubApi();
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: null }} />);
    const group = chooseIn("Logotipo", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar logotipo" }));
    await within(group).findByText("Logotipo enviado.");
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar a aparência" }));
    expect(await screen.findByText("Nenhuma alteração para salvar.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um logotipo atual que não é /media/<id> é ignorado", () => {
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: "https://exemplo.com/logo.png", faviconUrl: "javascript:alert(1)" }} />);
    expect(screen.queryByRole("img", { name: "Logotipo atual" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Favicon atual" })).toBeNull();
    expect(previewOf("claro").querySelector("img")).toBeNull();
  });

  it("o rodapé grava no próprio espaço: PUT /api/footer-links com { links }", async () => {
    const fetchMock = stubApi();
    render(<AppearanceForm initial={RECORD} footerLinks={FOOTER} />);
    const group = screen.getByRole("group", { name: "Link 1: GitHub" });
    fireEvent.change(within(group).getByLabelText(/^Endereço/), { target: { value: "https://github.com/outra" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar o rodapé" }));
    await screen.findByText(/^Rodapé salvo às/);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/footer-links");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ links: [{ icon: "github", url: "https://github.com/outra" }] });
  });

  it("os clientes recebidos por prop têm prioridade (nenhum fetch)", async () => {
    const fetchMock = stubApi();
    const logo = { upload: vi.fn().mockResolvedValue({ ok: true, url: "/media/simulado", id: "simulado", width: 1, height: 1 }), remove: vi.fn() };
    const footer = { save: vi.fn(async (links) => ({ ok: true, links })) };
    render(<AppearanceForm initial={RECORD} media={{ logoUrl: null, faviconUrl: null }} footerLinks={FOOTER} clients={{ logo, footer }} />);
    const group = chooseIn("Logotipo", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar logotipo" }));
    await within(group).findByText("Logotipo enviado.");
    expect(logo.upload).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/^Endereço/), { target: { value: "https://github.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar o rodapé" }));
    await screen.findByText(/^Rodapé salvo às/);
    expect(footer.save).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SiteIdentityForm (o sistema)", () => {
  it("fala com a API do sistema: /api/configuration/logo, /favicon e /footer-links", async () => {
    const fetchMock = stubApi();
    render(<SiteIdentityForm initial={CONFIG} media={{ logoUrl: null, faviconUrl: null }} footerLinks={FOOTER} />);
    expect(screen.getByText(/Sem imagem, vale o logotipo padrão\./)).toBeTruthy();
    let group = chooseIn("Logotipo", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar logotipo" }));
    await within(group).findByText("Logotipo enviado.");
    group = chooseIn("Favicon", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar favicon" }));
    await within(group).findByText("Favicon enviado.");
    fireEvent.change(screen.getByLabelText(/^Endereço/), { target: { value: "https://github.com/sistema" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar o rodapé" }));
    await screen.findByText(/^Rodapé salvo às/);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/configuration/logo", "/api/configuration/favicon", "/api/configuration/footer-links"]);
  });
});

describe("ConfigurationForm", () => {
  it("repassa as seções ao formulário do sistema, com o título do rodapé um nível abaixo (h3 sob o h2)", () => {
    render(<ConfigurationForm initial={CONFIG} media={{ logoUrl: "/media/logo1", faviconUrl: null }} footerLinks={FOOTER} />);
    expect(screen.getByRole("heading", { level: 2, name: "Aparência do sistema" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Rodapé" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Logotipo" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Links do rodapé" })).toBeTruthy();
  });

  it("sem as props, continua como era (sem as seções)", () => {
    render(<ConfigurationForm initial={CONFIG} />);
    expect(screen.queryByRole("group", { name: "Logotipo" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Rodapé" })).toBeNull();
  });
});

describe("ProfileForm: o avatar", () => {
  const USER = { name: "Ana Souza", email: "ana@exemplo.com", handle: "ana", role: /** @type {const} */ ("user") };

  it("sem a prop avatar, a seção não aparece", () => {
    render(<ProfileForm user={USER} />);
    expect(screen.queryByRole("group", { name: "Avatar" })).toBeNull();
  });

  it("com avatar: a imagem atual, e sem imagem as iniciais do nome no lugar", () => {
    const { unmount } = render(<ProfileForm user={USER} avatar={{ url: "/media/av1" }} />);
    expect(screen.getByRole("img", { name: "Avatar atual" }).getAttribute("src")).toBe("/media/av1");
    unmount();
    render(<ProfileForm user={USER} avatar={{ url: null }} />);
    const group = screen.getByRole("group", { name: "Avatar" });
    expect(group.textContent).toContain("AS");
    expect(within(group).queryByRole("button", { name: /^Remover/ })).toBeNull();
  });

  it("enviar: PUT /api/users/me/avatar e o painel é atualizado (router.refresh)", async () => {
    const fetchMock = stubApi();
    render(<ProfileForm user={USER} avatar={{ url: null }} />);
    const group = chooseIn("Avatar", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar avatar" }));
    await within(group).findByText("Avatar enviado.");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/users/me/avatar");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("remover: DELETE e refresh", async () => {
    const fetchMock = stubApi();
    render(<ProfileForm user={USER} avatar={{ url: "/media/av1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover avatar" }));
    await screen.findByText("Avatar removido.");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("o cliente recebido por prop vale; o formulário do nome continua inteiro (um <form> só, o do nome)", async () => {
    stubApi();
    const avatarClient = { upload: vi.fn().mockResolvedValue({ ok: true, url: "/media/x", id: "x", width: 1, height: 1 }), remove: vi.fn() };
    const { container } = render(<ProfileForm user={USER} avatar={{ url: null }} avatarClient={avatarClient} />);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(screen.getByLabelText("Nome de exibição")).toBeTruthy();
    const group = chooseIn("Avatar", file());
    fireEvent.click(await within(group).findByRole("button", { name: "Enviar avatar" }));
    await within(group).findByText("Avatar enviado.");
    expect(avatarClient.upload).toHaveBeenCalledTimes(1);
  });
});
