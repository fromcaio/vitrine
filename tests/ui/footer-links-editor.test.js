// @vitest-environment jsdom
// O editor do rodapé (RF24, RN17, UC20; ADR-035): o cliente (PUT da lista inteira, 422 por item), o
// IconPicker, e o FooterLinksEditor (até 8, um por ícone, https, mailto só no e-mail com o aviso de que
// fica público, ordem, estados, foco).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FooterLinksEditor } from "@/components/admin/FooterLinksEditor";
import { FooterLinksSection } from "@/components/admin/FooterLinksSection";
import { IconPicker } from "@/components/admin/IconPicker";
import { FOOTER_ENDPOINTS, MESSAGES as CLIENT_MESSAGES, createFooterClient } from "@/components/admin/footer-client";
import { FOOTER_ICONS, MAX_FOOTER_LINKS, MESSAGES } from "@/components/layout/footer-model";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (/** @type {unknown} */ body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("o cliente do rodapé", () => {
  it("os dois endereços (Tabela api-v1)", () => {
    expect(FOOTER_ENDPOINTS).toEqual({ page: "/api/footer-links", site: "/api/configuration/footer-links" });
  });

  it("PUT com { links } em JSON, na ordem; devolve a lista gravada", async () => {
    const links = [{ icon: "github", url: "https://github.com/a" }, { icon: "email", url: "mailto:a@b.co" }];
    const fetchMock = vi.fn().mockResolvedValue(json({ data: links }));
    const result = await createFooterClient("/api/footer-links", fetchMock).save(links);
    expect(result).toEqual({ ok: true, links });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/footer-links");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ links });
  });

  it("sem lista na resposta, vale a enviada; itens malformados na resposta são descartados", async () => {
    const links = [{ icon: "github", url: "https://github.com/a" }];
    expect(await createFooterClient("/x", vi.fn().mockResolvedValue(new Response(null, { status: 204 }))).save(links)).toEqual({ ok: true, links });
    const odd = await createFooterClient("/x", vi.fn().mockResolvedValue(json({ data: [{ icon: "x", url: "https://x.com/a", extra: 1 }, { icon: 3 }, null] }))).save(links);
    expect(odd).toEqual({ ok: true, links: [{ icon: "x", url: "https://x.com/a" }] });
  });

  it("usa o fetch global quando não recebe um", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createFooterClient("/api/footer-links").save([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("422: um details por item, indexado pela posição (links[2].url)", async () => {
    const body = { error: { code: "VALIDATION_ERROR", message: "m", details: [{ field: "links[2].url", message: "Use https." }, { field: "links[0].icon", message: "Ícone inválido." }, { field: "links[2].icon", message: "repetida" }, { field: "outro", message: "x" }] } };
    const result = await createFooterClient("/x", vi.fn().mockResolvedValue(json(body, 422))).save([]);
    expect(result).toEqual({ ok: false, kind: "validation", message: CLIENT_MESSAGES.rejected, rows: { 2: "Use https.", 0: "Ícone inválido." } });
  });

  it.each([
    [401, { error: { code: "UNAUTHENTICATED" } }, "unauthenticated", CLIENT_MESSAGES.unauthenticated],
    [403, { error: { code: "FORBIDDEN" } }, "forbidden", CLIENT_MESSAGES.forbidden],
    [403, { error: { code: "PASSWORD_CHANGE_REQUIRED" } }, "password-change", CLIENT_MESSAGES.passwordChange],
    [413, { error: { code: "PAYLOAD_TOO_LARGE" } }, "too-large", CLIENT_MESSAGES.tooLarge],
    [500, { error: { code: "INTERNAL" } }, "server", CLIENT_MESSAGES.server],
  ])("%i %j -> %s", async (status, body, kind, message) => {
    const result = await createFooterClient("/x", vi.fn().mockResolvedValue(json(body, status))).save([]);
    expect(result).toMatchObject({ ok: false, kind, message, rows: {} });
  });

  it("429 cita o Retry-After; falha de rede tem mensagem própria", async () => {
    const limited = await createFooterClient("/x", vi.fn().mockResolvedValue(json({}, 429, { "Retry-After": "12" }))).save([]);
    expect(limited).toMatchObject({ kind: "rate-limited", message: `${CLIENT_MESSAGES.rateLimited} Tente de novo em 12 segundos.` });
    const net = await createFooterClient("/x", vi.fn().mockRejectedValue(new TypeError("x"))).save([]);
    expect(net).toMatchObject({ ok: false, kind: "network", message: CLIENT_MESSAGES.network });
  });

  it("a sessão expirada usa o mesmo texto dos formulários de aparência (o login é oferecido)", async () => {
    const { MESSAGES: formMessages } = await import("@/components/admin/appearance-model");
    expect(CLIENT_MESSAGES.unauthenticated).toBe(formMessages.unauthenticated);
  });
});

describe("IconPicker", () => {
  it("oferece os dezoito ícones, com o nome, e escolhe pelo select nativo", () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="ic">Ícone</label>
        <IconPicker id="ic" value="github" onChange={onChange} />
      </>,
    );
    const select = /** @type {HTMLSelectElement} */ (screen.getByLabelText("Ícone"));
    expect([...select.options].map((o) => o.value)).toEqual([...FOOTER_ICONS]);
    expect(select.options[0].textContent).toBe("GitHub");
    fireEvent.change(select, { target: { value: "orcid" } });
    expect(onChange).toHaveBeenCalledWith("orcid");
  });

  it("os ícones já usados em outros links ficam desabilitados e marcados; o próprio valor, não", () => {
    render(
      <>
        <label htmlFor="ic">Ícone</label>
        <IconPicker id="ic" value="github" onChange={() => {}} taken={["github", "orcid"]} />
      </>,
    );
    const options = [...(/** @type {HTMLSelectElement} */ (screen.getByLabelText("Ícone")).options)];
    const github = options.find((o) => o.value === "github");
    const orcid = options.find((o) => o.value === "orcid");
    expect(github?.disabled).toBe(false);
    expect(orcid?.disabled).toBe(true);
    expect(orcid?.textContent).toBe("ORCID (já usado)");
    expect(options.filter((o) => o.disabled)).toHaveLength(1);
  });

  it("o desenho do ícone escolhido é decorativo", () => {
    const { container } = render(<IconPicker id="ic" value="youtube" onChange={() => {}} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

/** @param {Partial<{ save: any }>} [over] */
const fakeClient = (over = {}) => ({ save: vi.fn(async (links) => ({ ok: true, links })), ...over });
const groups = () => screen.queryAllByRole("group", { name: /^Link \d+:/ });
const urlField = (/** @type {number} */ index) => /** @type {HTMLInputElement} */ (within(groups()[index]).getByLabelText(/^Endereço/));
const iconField = (/** @type {number} */ index) => /** @type {HTMLSelectElement} */ (within(groups()[index]).getByLabelText("Ícone"));
const typeUrl = (/** @type {number} */ index, /** @type {string} */ value) => fireEvent.change(urlField(index), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: /^Salvar o rodapé|^Salvando/ }));
const add = () => fireEvent.click(screen.getByRole("button", { name: "Adicionar link" }));
const INITIAL = [{ icon: "github", url: "https://github.com/maria" }, { icon: "email", url: "mailto:maria@exemplo.com" }];

describe("FooterLinksEditor: a lista", () => {
  it("mostra os links gravados, na ordem, cada um num grupo com o nome do ícone", () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    expect(groups().map((g) => g.getAttribute("aria-label"))).toEqual(["Link 1: GitHub", "Link 2: E-mail"]);
    expect(urlField(0).value).toBe("https://github.com/maria");
    // no e-mail, o campo mostra só o endereço (o mailto: é montado ao enviar)
    expect(urlField(1).value).toBe("maria@exemplo.com");
    expect(screen.getByText("2 de 8 links.")).toBeTruthy();
  });

  it("vazio: 'Nenhum link no rodapé.' e o texto de apoio do alvo", () => {
    const { unmount } = render(<FooterLinksEditor initial={[]} client={fakeClient()} />);
    expect(screen.getByText("Nenhum link no rodapé.")).toBeTruthy();
    expect(screen.getByText(/rodapé do seu espaço/)).toBeTruthy();
    unmount();
    render(<FooterLinksEditor initial={[]} client={fakeClient()} scope="site" />);
    expect(screen.getByText(/o portal, o login e o painel do administrador/)).toBeTruthy();
  });

  it("ignora o que a lista gravada traz de inválido (ícone fora da lista) e corta em 8", () => {
    const stored = [{ icon: "tiktok", url: "https://tiktok.com/a" }, ...FOOTER_ICONS.filter((i) => i !== "email").slice(0, 9).map((icon) => ({ icon, url: `https://exemplo.com/${icon}` }))];
    render(<FooterLinksEditor initial={stored} client={fakeClient()} />);
    expect(groups()).toHaveLength(8);
    expect(groups()[0].getAttribute("aria-label")).toBe("Link 1: GitHub");
  });

  it("'Adicionar link' acrescenta um com o primeiro ícone livre e leva o foco ao endereço dele", async () => {
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/a" }]} client={fakeClient()} />);
    add();
    expect(groups()).toHaveLength(2);
    expect(iconField(1).value).toBe("linkedin");
    await waitFor(() => expect(document.activeElement).toBe(urlField(1)));
  });

  it("o teto: com 8 links, 'Adicionar link' fica desabilitado e o limite é dito", () => {
    const eight = FOOTER_ICONS.slice(0, MAX_FOOTER_LINKS).map((icon) => ({ icon, url: icon === "email" ? "mailto:a@b.co" : `https://exemplo.com/${icon}` }));
    render(<FooterLinksEditor initial={eight} client={fakeClient()} />);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Adicionar link" })).disabled).toBe(true);
    expect(screen.getByText(MESSAGES.full)).toBeTruthy();
  });

  it("'Remover' tira o link e leva o foco ao 'Adicionar link'", async () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover o link 1 (GitHub)" }));
    expect(groups().map((g) => g.getAttribute("aria-label"))).toEqual(["Link 1: E-mail"]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Adicionar link" })));
  });

  it("subir e descer mudam a ordem; o primeiro não sobe, o último não desce; o foco acompanha", async () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Subir o link 1 (GitHub)" })).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Descer o link 2 (E-mail)" })).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Descer o link 1 (GitHub)" }));
    expect(groups().map((g) => g.getAttribute("aria-label"))).toEqual(["Link 1: E-mail", "Link 2: GitHub"]);
    // o GitHub é agora o último: o foco vai ao 'Subir' dele (o 'Descer' ficou desabilitado)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Subir o link 2 (GitHub)" })));
  });

  it("o ícone já usado em outro link fica desabilitado no seletor", () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    const options = [...iconField(0).options];
    expect(options.find((o) => o.value === "email")?.disabled).toBe(true);
    expect(options.find((o) => o.value === "github")?.disabled).toBe(false);
  });
});

describe("FooterLinksEditor: o e-mail é público", () => {
  it("o aviso aparece só no ícone de e-mail e descreve o campo", () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    const notes = screen.getAllByText(MESSAGES.emailPublic);
    expect(notes).toHaveLength(1);
    expect(urlField(1).getAttribute("aria-describedby")).toContain(/** @type {string} */ (notes[0].id));
    expect(within(groups()[0]).queryByText(MESSAGES.emailPublic)).toBeNull();
  });

  it("trocar um link para e-mail mostra o aviso e esvazia o campo (a natureza do que se digita muda)", () => {
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/maria" }]} client={fakeClient()} />);
    expect(screen.queryByText(MESSAGES.emailPublic)).toBeNull();
    fireEvent.change(iconField(0), { target: { value: "email" } });
    expect(screen.getByText(MESSAGES.emailPublic)).toBeTruthy();
    expect(urlField(0).value).toBe("");
    expect(urlField(0).getAttribute("inputmode")).toBe("email");
  });

  it("trocar entre dois ícones de rede mantém o endereço", () => {
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/maria" }]} client={fakeClient()} />);
    fireEvent.change(iconField(0), { target: { value: "orcid" } });
    expect(urlField(0).value).toBe("https://github.com/maria");
  });
});

describe("FooterLinksEditor: validação antes de enviar", () => {
  it.each([
    ["http://exemplo.com", MESSAGES.https],
    ["javascript:alert(1)", MESSAGES.https],
    ["exemplo.com", MESSAGES.https],
    ["", MESSAGES.required],
  ])("o endereço %j num ícone de rede: %s, no campo, com o foco e sem enviar", (value, message) => {
    const client = fakeClient();
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/maria" }]} client={client} />);
    typeUrl(0, value);
    save();
    expect(client.save).not.toHaveBeenCalled();
    expect(within(groups()[0]).getByRole("alert").textContent).toContain(message);
    expect(urlField(0).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(urlField(0));
  });

  it("e-mail inválido é recusado; https no ícone de e-mail também; mailto: não vale em rede", () => {
    const client = fakeClient();
    render(<FooterLinksEditor initial={[{ icon: "email", url: "mailto:a@b.co" }, { icon: "github", url: "https://github.com/a" }]} client={client} />);
    typeUrl(0, "https://exemplo.com");
    typeUrl(1, "mailto:oi@exemplo.com");
    save();
    expect(client.save).not.toHaveBeenCalled();
    expect(within(groups()[0]).getByRole("alert").textContent).toContain(MESSAGES.email);
    expect(within(groups()[1]).getByRole("alert").textContent).toContain(MESSAGES.https);
  });

  it("editar o campo apaga o erro dele", () => {
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/maria" }]} client={fakeClient()} />);
    typeUrl(0, "http://x");
    save();
    expect(within(groups()[0]).getByRole("alert")).toBeTruthy();
    typeUrl(0, "https://x.com");
    expect(within(groups()[0]).queryByRole("alert")).toBeNull();
    expect(urlField(0).getAttribute("aria-invalid")).toBeNull();
  });

  it("dois links com o mesmo ícone são recusados (pelo seletor não dá, mas a validação confere)", () => {
    // O estado do seletor impede a duplicata; a validação é a segunda barreira. Força-a via validateLinks no modelo.
    const client = fakeClient();
    render(<FooterLinksEditor initial={[{ icon: "github", url: "https://github.com/a" }]} client={client} />);
    add();
    const second = iconField(1);
    // O ícone do 2º link é 'linkedin'; um select nativo permite forçar o valor de um <option> desabilitado.
    fireEvent.change(second, { target: { value: "github" } });
    typeUrl(1, "https://github.com/b");
    save();
    expect(client.save).not.toHaveBeenCalled();
    expect(within(groups()[1]).getByRole("alert").textContent).toContain(MESSAGES.duplicated);
  });
});

describe("FooterLinksEditor: salvar", () => {
  it("envia a lista inteira, na ordem, com o mailto: montado, e confirma", async () => {
    const client = fakeClient();
    const onSaved = vi.fn();
    render(<FooterLinksEditor initial={INITIAL} client={client} onSaved={onSaved} />);
    typeUrl(0, "  https://github.com/outra  ");
    typeUrl(1, "novo@exemplo.com");
    save();
    await screen.findByText(/^Rodapé salvo às/);
    expect(client.save).toHaveBeenCalledWith([
      { icon: "github", url: "https://github.com/outra" },
      { icon: "email", url: "mailto:novo@exemplo.com" },
    ]);
    expect(onSaved).toHaveBeenCalledWith([
      { icon: "github", url: "https://github.com/outra" },
      { icon: "email", url: "mailto:novo@exemplo.com" },
    ]);
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
  });

  it("aceita o e-mail já com o prefixo mailto: no campo", async () => {
    const client = fakeClient();
    render(<FooterLinksEditor initial={[]} client={client} />);
    add();
    fireEvent.change(iconField(0), { target: { value: "email" } });
    typeUrl(0, "mailto:oi@exemplo.com");
    save();
    await screen.findByText(/^Rodapé salvo às/);
    expect(client.save).toHaveBeenCalledWith([{ icon: "email", url: "mailto:oi@exemplo.com" }]);
  });

  it("esvaziar a lista é permitido: envia { links: [] }", async () => {
    const client = fakeClient();
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover o link 1 (GitHub)" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover o link 1 (E-mail)" }));
    save();
    await screen.findByText(/^Rodapé salvo às/);
    expect(client.save).toHaveBeenCalledWith([]);
  });

  it("sem mudança: 'Nenhuma alteração para salvar' e nada é enviado", () => {
    const client = fakeClient();
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    save();
    expect(client.save).not.toHaveBeenCalled();
    expect(screen.getByText("Nenhuma alteração para salvar.")).toBeTruthy();
  });

  it("alterações pendentes são ditas, e o aviso de 'salvo' some quando o autor volta a editar", async () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    expect(screen.getByText("Nenhuma alteração pendente.")).toBeTruthy();
    typeUrl(0, "https://github.com/outra");
    expect(screen.getByText("Há alterações ainda não gravadas.")).toBeTruthy();
    save();
    await screen.findByText(/^Rodapé salvo às/);
    typeUrl(0, "https://github.com/terceira");
    expect(screen.queryByText(/^Rodapé salvo às/)).toBeNull();
  });

  it("durante o envio: 'Salvando…' desabilitado e aria-busy", async () => {
    let finish = /** @type {(value: any) => void} */ (() => {});
    const client = fakeClient({ save: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    const { container } = render(<FooterLinksEditor initial={INITIAL} client={client} />);
    typeUrl(0, "https://github.com/outra");
    save();
    const busy = await screen.findByRole("button", { name: "Salvando…" });
    expect(/** @type {HTMLButtonElement} */ (busy).disabled).toBe(true);
    expect(container.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ ok: true, links: [{ icon: "github", url: "https://github.com/outra" }, INITIAL[1]] }));
    await screen.findByText(/^Rodapé salvo às/);
  });

  it("422 por item: a mensagem do servidor vai à linha certa, o foco vai a ela e o rascunho fica", async () => {
    const client = fakeClient({
      save: vi.fn().mockResolvedValue({ ok: false, kind: "validation", message: CLIENT_MESSAGES.rejected, rows: { 1: "O e-mail não é válido." } }),
    });
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    typeUrl(0, "https://github.com/outra");
    save();
    await waitFor(() => expect(within(groups()[1]).getByRole("alert").textContent).toContain("O e-mail não é válido."));
    expect(screen.getByText(CLIENT_MESSAGES.rejected)).toBeTruthy();
    expect(document.activeElement).toBe(urlField(1));
    expect(urlField(0).value).toBe("https://github.com/outra");
    expect(screen.getByText("Há alterações ainda não gravadas.")).toBeTruthy();
  });

  it("sessão expirada: a mensagem geral oferece o login em outra aba", async () => {
    const client = fakeClient({ save: vi.fn().mockResolvedValue({ ok: false, kind: "unauthenticated", message: CLIENT_MESSAGES.unauthenticated, rows: {} }) });
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    typeUrl(0, "https://github.com/outra");
    save();
    expect(await screen.findByRole("link", { name: "Abrir o login em outra aba" })).toBeTruthy();
  });

  it("falha de rede: mensagem geral, rascunho preservado", async () => {
    const client = fakeClient({ save: vi.fn().mockResolvedValue({ ok: false, kind: "network", message: CLIENT_MESSAGES.network, rows: {} }) });
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    typeUrl(0, "https://github.com/outra");
    save();
    await screen.findByText(CLIENT_MESSAGES.network);
    expect(urlField(0).value).toBe("https://github.com/outra");
  });

  it("a tela adota a lista devolvida pelo servidor, a menos que o autor tenha editado durante o envio", async () => {
    let finish = /** @type {(value: any) => void} */ (() => {});
    const client = fakeClient({ save: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    render(<FooterLinksEditor initial={INITIAL} client={client} />);
    typeUrl(0, "https://github.com/primeira");
    save();
    await screen.findByRole("button", { name: "Salvando…" });
    typeUrl(0, "https://github.com/segunda");
    await act(async () => finish({ ok: true, links: [{ icon: "github", url: "https://github.com/primeira" }, INITIAL[1]] }));
    await screen.findByRole("button", { name: "Salvar o rodapé" });
    expect(urlField(0).value).toBe("https://github.com/segunda");
    expect(screen.getByText("Há alterações ainda não gravadas.")).toBeTruthy();
  });
});

describe("FooterLinksEditor: acessibilidade", () => {
  it("campos com rótulo, erros ligados por aria-describedby, regiões vivas sempre presentes, só tokens de tema", () => {
    const { container } = render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    expect(screen.getByRole("group", { name: "Links do rodapé" })).toBeTruthy();
    for (const index of [0, 1]) {
      expect(urlField(index)).toBeTruthy();
      expect(iconField(index)).toBeTruthy();
    }
    expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });

  it("os botões de cada linha dizem o link a que se referem", () => {
    render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    for (const name of ["Subir o link 1 (GitHub)", "Descer o link 1 (GitHub)", "Remover o link 1 (GitHub)", "Subir o link 2 (E-mail)", "Remover o link 2 (E-mail)"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("não é filho de <form> e é um <form> próprio", () => {
    const { container } = render(<FooterLinksEditor initial={INITIAL} client={fakeClient()} />);
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });
});

describe("FooterLinksSection", () => {
  it("título 'Rodapé' (h2 por padrão; h3 sob um h2) e o cliente do alvo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ icon: "github", url: "https://github.com/novo" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<FooterLinksSection links={INITIAL} scope="site" />);
    expect(screen.getByRole("heading", { level: 2, name: "Rodapé" })).toBeTruthy();
    typeUrl(0, "https://github.com/novo");
    save();
    await screen.findByText(/^Rodapé salvo às/);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/configuration/footer-links");
    unmount();
    render(<FooterLinksSection links={INITIAL} scope="page" heading="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Rodapé" })).toBeTruthy();
    typeUrl(0, "https://github.com/novo2");
    save();
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/footer-links"));
  });
});
