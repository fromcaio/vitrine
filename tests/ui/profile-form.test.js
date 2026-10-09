// @vitest-environment jsdom
// Perfil do usuário (RF28, UC14; RN20, RN21; M20): só o nome é editável; e-mail, handle e papel são
// somente leitura; envio por PATCH /api/users/me; mensagens por campo e gerais; nada de HTML do usuário.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ProfileForm } from "@/components/admin/ProfileForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const USER = { name: "Ana Souza", email: "ana@exemplo.com", handle: "ana", role: /** @type {const} */ ("user") };

/** @param {Response | (() => Promise<Response>)} reply */
function stubFetch(reply) {
  const fetchMock = vi.fn(typeof reply === "function" ? reply : async () => reply);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const nameField = () => /** @type {HTMLInputElement} */ (screen.getByLabelText("Nome de exibição"));
const save = () => fireEvent.click(screen.getByRole("button", { name: /Salvar nome|Salvando/ }));
const type = (/** @type {string} */ value) => fireEvent.change(nameField(), { target: { value } });

describe("campos", () => {
  it("o nome vem preenchido e é editável", () => {
    render(<ProfileForm user={USER} />);
    expect(nameField().value).toBe("Ana Souza");
    expect(nameField().readOnly).toBe(false);
  });

  it("e-mail, handle e papel são somente leitura, com a explicação de quem os altera", () => {
    render(<ProfileForm user={USER} />);
    const email = /** @type {HTMLInputElement} */ (screen.getByLabelText("E-mail"));
    const handle = /** @type {HTMLInputElement} */ (screen.getByLabelText(/Endereço do seu espaço/));
    const role = /** @type {HTMLInputElement} */ (screen.getByLabelText("Papel"));
    expect([email.value, handle.value, role.value]).toEqual(["ana@exemplo.com", "ana", "Usuário"]);
    for (const field of [email, handle, role]) expect(field.readOnly).toBe(true);
    expect(screen.getAllByText(/Só o administrador/).length).toBeGreaterThanOrEqual(3);
  });

  it("o papel de administrador aparece em português", () => {
    render(<ProfileForm user={{ ...USER, role: "admin" }} />);
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Papel")).value).toBe("Administrador");
  });

  it("sem handle: explica que o espaço público não existe", () => {
    render(<ProfileForm user={{ ...USER, handle: null }} />);
    expect(screen.getByText(/ainda não tem um handle/)).toBeTruthy();
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText(/Endereço do seu espaço/)).value).toBe("");
  });

  it("com handle e spaceHref: o espaço é um link; sem spaceHref, só texto", () => {
    const { unmount } = render(<ProfileForm user={USER} spaceHref="/ana" />);
    expect(screen.getByRole("link", { name: "/ana" }).getAttribute("href")).toBe("/ana");
    unmount();
    render(<ProfileForm user={USER} />);
    expect(screen.queryByRole("link", { name: "/ana" })).toBeNull();
    expect(screen.getByText("/ana", { selector: "strong" })).toBeTruthy();
  });

  it("o texto do usuário nunca vira HTML", () => {
    render(<ProfileForm user={{ ...USER, name: "<img src=x onerror=alert(1)>", email: "<b>x</b>@a.com" }} />);
    expect(document.querySelector("form img, form b")).toBeNull();
    expect(nameField().value).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("validação no navegador", () => {
  it("nome vazio: mensagem no campo, foco nele e nada enviado", () => {
    const fetchMock = stubFetch(json({}));
    render(<ProfileForm user={USER} />);
    type("   ");
    save();
    expect(screen.getByText("O nome é obrigatório.")).toBeTruthy();
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(nameField());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mais de 100 caracteres é recusado; 100 passa", async () => {
    const fetchMock = stubFetch(json({ data: { name: "a".repeat(100) } }));
    render(<ProfileForm user={USER} />);
    type("a".repeat(101));
    save();
    expect(screen.getByText("O nome deve ter no máximo 100 caracteres.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    type("a".repeat(100));
    save();
    await screen.findByText("Nome atualizado.");
  });

  it("o nome igual ao gravado não vai ao servidor", () => {
    const fetchMock = stubFetch(json({}));
    render(<ProfileForm user={USER} />);
    type("  Ana Souza  ");
    save();
    expect(screen.getByText("O nome não mudou.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("envio", () => {
  it("envia PATCH /api/users/me só com { name }, aparado, e confirma", async () => {
    const fetchMock = stubFetch(json({ data: { name: "Ana Maria" } }));
    const onSaved = vi.fn();
    render(<ProfileForm user={USER} onSaved={onSaved} />);
    type("  Ana Maria  ");
    save();
    await screen.findByText("Nome atualizado.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/me");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "Ana Maria" });
    expect(onSaved).toHaveBeenCalledWith("Ana Maria");
    expect(nameField().value).toBe("Ana Maria");
  });

  it("depois de salvar, o mesmo nome já não é uma mudança", async () => {
    const fetchMock = stubFetch(json({ data: { name: "Ana Maria" } }));
    render(<ProfileForm user={USER} />);
    type("Ana Maria");
    save();
    await screen.findByText("Nome atualizado.");
    save();
    expect(screen.getByText("O nome não mudou.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enquanto envia: 'Salvando…', botão desabilitado e campo só de leitura (o foco não se perde)", async () => {
    /** @type {(r: Response) => void} */
    let resolve = () => {};
    stubFetch(() => new Promise((r) => (resolve = r)));
    render(<ProfileForm user={USER} />);
    nameField().focus();
    type("Novo");
    save();
    const button = /** @type {HTMLButtonElement} */ (await screen.findByRole("button", { name: "Salvando…" }));
    expect(button.disabled).toBe(true);
    expect(nameField().readOnly).toBe(true);
    expect(document.activeElement).toBe(nameField());
    resolve(json({ data: { name: "Novo" } }));
    await screen.findByText("Nome atualizado.");
  });

  it("e-mail, handle e papel nunca são enviados", async () => {
    const fetchMock = stubFetch(json({ data: { name: "Novo" } }));
    render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText("Nome atualizado.");
    expect(fetchMock.mock.calls[0][1].body).not.toMatch(/email|handle|role/);
  });
});

describe("falhas", () => {
  it("422 com detalhe do campo: mostra no campo e põe o foco nele", async () => {
    stubFetch(json({ error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "name", message: "O nome é obrigatório." }] } }, 422));
    render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText("O nome é obrigatório.");
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
  });

  it("422 sem detalhe do campo: mensagem geral", async () => {
    stubFetch(json({ error: { code: "VALIDATION_ERROR", message: "x", details: [] } }, 422));
    render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/O servidor não aceitou o nome enviado/);
  });

  it("401 oferece o login; 403 e 5xx e rede têm mensagem própria", async () => {
    stubFetch(json({}, 401));
    const first = render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/Sua sessão expirou/);
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
    first.unmount();

    stubFetch(json({}, 403));
    const second = render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/Você não tem permissão/);
    second.unmount();

    stubFetch(json({}, 500));
    const third = render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/não conseguiu salvar agora/);
    third.unmount();

    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/Não foi possível conectar ao servidor/);
  });

  it("429 cita o Retry-After", async () => {
    stubFetch(json({}, 429, { "Retry-After": "30" }));
    render(<ProfileForm user={USER} />);
    type("Novo");
    save();
    await screen.findByText(/Muitas tentativas\. Aguarde um instante e tente novamente\. Tente de novo em 30 segundos\./);
  });

  it("a falha mantém o que foi digitado e habilita de novo o botão", async () => {
    stubFetch(json({}, 500));
    render(<ProfileForm user={USER} />);
    type("Digitado");
    save();
    await screen.findByText(/não conseguiu salvar agora/);
    expect(nameField().value).toBe("Digitado");
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Salvar nome" })).disabled).toBe(false);
  });
});

describe("acessibilidade", () => {
  it("regiões vivas sempre presentes, rótulos ligados e só tokens de tema", () => {
    const { container } = render(<ProfileForm user={USER} />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(nameField().getAttribute("aria-describedby")).toMatch(/-hint$/);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});
