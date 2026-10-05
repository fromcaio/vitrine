// @vitest-environment jsdom
// Formulário de troca de senha (RF28, UC14, RN21; A-015 etapa 2): validação no navegador, envio a
// POST /api/users/me/password ({ current, next }), mensagens em português para 401, 403, 422 e 429,
// a variante da troca obrigatória (senha provisória) e a garantia de que as senhas não ficam em
// estado nem em armazenamento do navegador.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";

const jsonResponse = (/** @type {number} */ status, /** @type {unknown} */ payload, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });
const failure = (/** @type {number} */ status, /** @type {unknown[]} */ details = [], headers = {}) =>
  jsonResponse(status, { error: { code: "X", message: "m", details } }, headers);

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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const field = (/** @type {string} */ label) => /** @type {HTMLInputElement} */ (screen.getByLabelText(label));
const submitButton = () => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: /Trocar senha|Definir nova senha|Enviando/ }));

function fill({ current = "senha-antiga-123", next = "senha-nova-456", confirm = next } = {}, labels = { current: "Senha atual" }) {
  fireEvent.change(field(labels.current), { target: { value: current } });
  fireEvent.change(field("Nova senha"), { target: { value: next } });
  fireEvent.change(field("Confirmar a nova senha"), { target: { value: confirm } });
}

async function submitAndWait(/** @type {import("vitest").Mock<any>} */ fetchMock) {
  fireEvent.click(submitButton());
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

describe("campos e acessibilidade", () => {
  it("tem os três campos de senha, com rótulo e autocomplete corretos", () => {
    render(<PasswordChangeForm />);
    expect(field("Senha atual").type).toBe("password");
    expect(field("Senha atual").autocomplete).toBe("current-password");
    expect(field("Nova senha").autocomplete).toBe("new-password");
    expect(field("Confirmar a nova senha").autocomplete).toBe("new-password");
    expect(field("Nova senha").getAttribute("aria-describedby")).toMatch(/-hint$/);
    expect(screen.getByText(/De 8 a 128 caracteres/)).toBeTruthy();
  });

  it("as regiões de alerta e de status existem desde o início, vazias", () => {
    render(<PasswordChangeForm />);
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("validação no navegador", () => {
  it.each([
    ["senha atual vazia", { current: "" }, "Senha atual", "Informe a senha atual."],
    ["nova senha curta (7)", { next: "1234567", confirm: "1234567" }, "Nova senha", "A nova senha deve ter ao menos 8 caracteres."],
    ["nova senha longa (129)", { next: "a".repeat(129), confirm: "a".repeat(129) }, "Nova senha", "A nova senha deve ter no máximo 128 caracteres."],
    ["nova senha igual à atual", { current: "mesma-senha-1", next: "mesma-senha-1", confirm: "mesma-senha-1" }, "Nova senha", "A nova senha deve ser diferente da atual."],
    ["confirmação diferente", { confirm: "outra-coisa-999" }, "Confirmar a nova senha", "A confirmação não é igual à nova senha."],
  ])("recusa %s, sem enviar, e foca o campo com erro", (_name, values, label, message) => {
    const fetchMock = stubFetch();
    render(<PasswordChangeForm />);
    fill(values);
    fireEvent.click(submitButton());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeTruthy();
    expect(field(label).getAttribute("aria-invalid")).toBe("true");
    expect(field(label).getAttribute("aria-describedby")).toContain("-error");
    expect(document.activeElement).toBe(field(label));
  });

  it("aceita 8 e 128 caracteres exatos", async () => {
    for (const length of [8, 128]) {
      const fetchMock = stubFetch(jsonResponse(200, { data: { changed: true } }));
      render(<PasswordChangeForm />);
      const next = "x".repeat(length);
      fill({ next, confirm: next });
      await submitAndWait(fetchMock);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).next).toBe(next);
      cleanup();
    }
  });

  it("vários erros: todos aparecem e o foco vai ao primeiro campo", () => {
    stubFetch();
    render(<PasswordChangeForm />);
    fill({ current: "", next: "curta", confirm: "diferente" });
    fireEvent.click(submitButton());
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
    expect(document.activeElement).toBe(field("Senha atual"));
  });

  it("corrigir e reenviar limpa os erros", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { changed: true } }));
    render(<PasswordChangeForm />);
    fill({ confirm: "diferente" });
    fireEvent.click(submitButton());
    expect(screen.getByText("A confirmação não é igual à nova senha.")).toBeTruthy();
    fill();
    await submitAndWait(fetchMock);
    expect(screen.queryByText("A confirmação não é igual à nova senha.")).toBeNull();
  });
});

describe("envio (RF28)", () => {
  it("envia só { current, next } a POST /api/users/me/password, como JSON", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { changed: true } }));
    render(<PasswordChangeForm />);
    fill({ current: "senha-antiga-123", next: "senha-nova-456" });
    await submitAndWait(fetchMock);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/me/password");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ current: "senha-antiga-123", next: "senha-nova-456" });
  });

  it("depois de trocar: confirma, esvazia os campos e (fora da troca obrigatória) não navega", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { changed: true } }));
    const navigate = vi.fn();
    render(<PasswordChangeForm navigate={navigate} />);
    fill();
    await submitAndWait(fetchMock);

    expect(await screen.findByText("Senha alterada. As suas outras sessões foram encerradas.")).toBeTruthy();
    expect(field("Senha atual").value).toBe("");
    expect(field("Nova senha").value).toBe("");
    expect(field("Confirmar a nova senha").value).toBe("");
    expect(navigate).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(false);
  });

  it("enquanto envia, o botão fica desabilitado e diz 'Enviando…'", async () => {
    let finish = /** @type {(r: Response) => void} */ (() => {});
    const fetchMock = stubFetch(() => new Promise((resolve) => { finish = resolve; }));
    render(<PasswordChangeForm />);
    fill();
    await submitAndWait(fetchMock);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toBe("Enviando…");
    finish(jsonResponse(200, { data: {} }));
    await screen.findByText(/Senha alterada/);
  });
});

describe("as senhas não ficam guardadas", () => {
  it("não vão ao localStorage nem ao sessionStorage, e os campos não são controlados (sem atributo value)", async () => {
    const fetchMock = stubFetch(failure(422, [{ field: "current", message: "A senha atual está incorreta." }]));
    render(<PasswordChangeForm />);
    fill({ current: "segredo-atual-aaa", next: "segredo-novo-bbb" });
    for (const label of ["Senha atual", "Nova senha", "Confirmar a nova senha"]) expect(field(label).hasAttribute("value")).toBe(false);
    await submitAndWait(fetchMock);
    await screen.findByText("A senha atual está incorreta.");

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.body.innerHTML).not.toContain("segredo-atual-aaa");
    expect(document.body.innerHTML).not.toContain("segredo-novo-bbb");
  });

  it("não escreve as senhas no console", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((method) => vi.spyOn(console, /** @type {"log"} */ (method)).mockImplementation(() => {}));
    const fetchMock = stubFetch(failure(500));
    render(<PasswordChangeForm />);
    fill({ current: "segredo-atual-aaa", next: "segredo-novo-bbb" });
    await submitAndWait(fetchMock);
    await screen.findByText(/não conseguiu trocar a senha/);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/segredo-/);
  });
});

describe("mensagens de erro em português (401, 403, 422, 429)", () => {
  async function failWith(/** @type {Response | (() => Promise<Response>)} */ response) {
    const fetchMock = stubFetch(response);
    render(<PasswordChangeForm />);
    fill();
    await submitAndWait(fetchMock);
    return fetchMock;
  }

  it("401: a sessão expirou, com o link para o login", async () => {
    await failWith(failure(401));
    expect(await screen.findByText(/Sua sessão expirou\. Entre de novo para trocar a senha\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
  });

  it("403: sem permissão", async () => {
    await failWith(failure(403));
    expect(await screen.findByText("Você não tem permissão para trocar esta senha.")).toBeTruthy();
  });

  it("422 da senha atual errada: a mensagem do servidor fica no campo da senha atual", async () => {
    await failWith(failure(422, [{ field: "current", message: "A senha atual está incorreta." }]));
    expect(await screen.findByText("A senha atual está incorreta.")).toBeTruthy();
    expect(field("Senha atual").getAttribute("aria-invalid")).toBe("true");
    expect(field("Nova senha").getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(field("Senha atual"));
  });

  it("422 da nova senha igual à atual (recusa do servidor): fica no campo da nova senha", async () => {
    await failWith(failure(422, [{ field: "next", message: "A nova senha deve ser diferente da atual." }]));
    expect(await screen.findByText("A nova senha deve ser diferente da atual.")).toBeTruthy();
    expect(field("Nova senha").getAttribute("aria-invalid")).toBe("true");
  });

  it("422 de tamanho (campo password do better-auth): também no campo da nova senha", async () => {
    await failWith(failure(422, [{ field: "password", message: "A senha deve ter de 8 a 128 caracteres." }]));
    expect(await screen.findByText("A senha deve ter de 8 a 128 caracteres.")).toBeTruthy();
    expect(field("Nova senha").getAttribute("aria-invalid")).toBe("true");
  });

  it("422 de um campo desconhecido vira mensagem geral; sem detalhes, a mensagem de dados recusados", async () => {
    await failWith(failure(422, [{ field: "outro", message: "Algo estranho." }]));
    expect(await screen.findByText("Algo estranho.")).toBeTruthy();
    cleanup();
    await failWith(failure(422, []));
    expect(await screen.findByText(/O servidor não aceitou os dados enviados/)).toBeTruthy();
  });

  it("429: pede para aguardar e, com o cabeçalho Retry-After, diz quantos segundos", async () => {
    await failWith(failure(429, [], { "Retry-After": "42" }));
    expect(await screen.findByText(/Muitas tentativas\. Aguarde um instante e tente novamente\. Tente de novo em 42 segundos\./)).toBeTruthy();
    cleanup();
    await failWith(failure(429, [], { "Retry-After": "1" }));
    expect(await screen.findByText(/Tente de novo em 1 segundo\./)).toBeTruthy();
    cleanup();
    await failWith(failure(429));
    const alert = await screen.findByText(/Muitas tentativas/);
    expect(alert.textContent).not.toMatch(/Tente de novo em/);
  });

  it("5xx e corpo que não é JSON: mensagem de servidor, sem lançar", async () => {
    await failWith(new Response("<html>erro</html>", { status: 502 }));
    expect(await screen.findByText("O servidor não conseguiu trocar a senha agora. Tente de novo em instantes.")).toBeTruthy();
  });

  it("sem rede: mensagem de conexão, e o botão volta a habilitar", async () => {
    await failWith(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(submitButton().disabled).toBe(false);
  });

  it("um erro não esvazia os campos nem libera nada (o autor corrige e reenvia)", async () => {
    const fetchMock = await failWith(failure(422, [{ field: "current", message: "A senha atual está incorreta." }]));
    await screen.findByText("A senha atual está incorreta.");
    expect(field("Nova senha").value).toBe("senha-nova-456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("troca obrigatória (RN21; variante mandatory)", () => {
  const props = { mandatory: true };

  it("explica a senha provisória, chama o campo de provisória e muda o botão", () => {
    render(<PasswordChangeForm {...props} />);
    expect(screen.getByText(/senha provisória/, { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/o resto do painel fica bloqueado/)).toBeTruthy();
    expect(field("Senha provisória")).toBeTruthy();
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    expect(submitButton().textContent).toBe("Definir nova senha");
  });

  it("a variante comum não mostra a explicação", () => {
    render(<PasswordChangeForm />);
    expect(screen.queryByText(/o resto do painel fica bloqueado/)).toBeNull();
    expect(submitButton().textContent).toBe("Trocar senha");
  });

  it("ao terminar, vai ao painel (/admin por padrão) e diz isso", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { changed: true } }));
    const navigate = vi.fn();
    render(<PasswordChangeForm {...props} navigate={navigate} />);
    fill({ current: "provisoria-1234567", next: "definitiva-9876" }, { current: "Senha provisória" });
    await submitAndWait(fetchMock);

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/admin");
    expect(screen.getByText("Senha definida. Levando você ao painel…")).toBeTruthy();
    // Segue desabilitado até a página de destino carregar.
    expect(submitButton().disabled).toBe(true);
  });

  it("vai ao destino que o Core informou", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: {} }));
    const navigate = vi.fn();
    render(<PasswordChangeForm {...props} redirectTo="/admin/conteudo" navigate={navigate} />);
    fill({}, { current: "Senha provisória" });
    await submitAndWait(fetchMock);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/conteudo"));
  });

  it("não vai ao painel enquanto a troca não deu certo (erro, validação ou rede)", async () => {
    const navigate = vi.fn();
    const fetchMock = stubFetch(failure(422, [{ field: "current", message: "A senha atual está incorreta." }]), () => Promise.reject(new TypeError("x")));
    render(<PasswordChangeForm {...props} navigate={navigate} />);
    fill({ confirm: "diferente" }, { current: "Senha provisória" });
    fireEvent.click(submitButton()); // validação
    fill({}, { current: "Senha provisória" });
    await submitAndWait(fetchMock); // 422
    await screen.findByText("A senha atual está incorreta.");
    fireEvent.click(submitButton()); // rede
    await screen.findByText(/Não foi possível conectar/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("recusa a senha nova igual à provisória, sem enviar", () => {
    const fetchMock = stubFetch();
    render(<PasswordChangeForm {...props} />);
    fill({ current: "provisoria-1234567", next: "provisoria-1234567" }, { current: "Senha provisória" });
    fireEvent.click(submitButton());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("A nova senha deve ser diferente da atual.")).toBeTruthy();
  });
});
