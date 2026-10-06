// @vitest-environment jsdom
// Formulário de usuário (RF27, UC13; RN20, RN21, RN22; ADR-024): criar e editar contra uma API
// simulada, erros por campo, o aviso e a ciência da troca de handle, o último administrador.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserForm } from "@/components/admin/UserForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const USER = { id: "u1", name: "Ana Souza", email: "ana@exemplo.com", handle: "ana", role: /** @type {const} */ ("user"), suspended: false, banReason: null, banExpires: null, mustChangePassword: false, createdAt: null, updatedAt: null };

/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (/** @type {string} */ code, /** @type {unknown[]} */ details = []) => ({ error: { code, message: "mensagem do servidor", details } });
/** @param {Response | (() => Promise<Response>)} reply */
const stub = (reply) => {
  const fetchMock = vi.fn(typeof reply === "function" ? reply : async () => reply);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const field = (/** @type {string | RegExp} */ label) => /** @type {HTMLInputElement} */ (screen.getByLabelText(label));
const set = (/** @type {string | RegExp} */ label, /** @type {string} */ value) => fireEvent.change(field(label), { target: { value } });
const submit = (/** @type {string | RegExp} */ name) => fireEvent.click(screen.getByRole("button", { name }));

describe("criar", () => {
  const fill = () => {
    set("E-mail", " Bia@Exemplo.com ");
    set("Nome de exibição", "  Bia Lima ");
    set(/^Handle/, "Bia");
  };

  it("abre com o foco no e-mail, com papel Usuário e sem campo de senha", () => {
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    expect(document.activeElement).toBe(field("E-mail"));
    expect(field("Papel").value).toBe("user");
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
  });

  it("valida antes de enviar: mensagem junto do campo, foco no primeiro e nada enviado", () => {
    const fetchMock = stub(json({}));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    submit("Criar usuário");
    expect(screen.getByText("O e-mail é obrigatório.")).toBeTruthy();
    expect(screen.getByText("O nome é obrigatório.")).toBeTruthy();
    expect(field("E-mail").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("E-mail"));
    set("E-mail", "isto-nao-e-email");
    set("Nome de exibição", "Bia");
    set(/^Handle/, "admin");
    submit("Criar usuário");
    expect(screen.getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(screen.getByText('O handle "admin" é reservado.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia o formulário normalizado e entrega a senha provisória a onDone", async () => {
    const fetchMock = stub(json({ data: { ...USER, id: "novo", email: "bia@exemplo.com", temporaryPassword: "Abcdefghjkmnpqrs" } }, 201));
    const onDone = vi.fn();
    render(<UserForm mode="create" currentUserId="admin" onDone={onDone} />);
    fill();
    submit("Criar usuário");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "bia@exemplo.com", name: "Bia Lima", handle: "bia", role: "user" });
    expect(onDone.mock.calls[0][0]).toMatchObject({ temporaryPassword: "Abcdefghjkmnpqrs", user: { id: "novo" } });
  });

  it("o formulário não guarda a senha provisória (nem na tela)", async () => {
    stub(json({ data: { ...USER, temporaryPassword: "SeGrEdOsEgReDo123" } }, 201));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    await waitFor(() => expect(screen.getByRole("button", { name: "Criar usuário" })).toBeTruthy());
    expect(document.body.innerHTML).not.toContain("SeGrEdOsEgReDo123");
  });

  it("handle em branco vai como null", async () => {
    const fetchMock = stub(json({ data: USER }, 201));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    set("E-mail", "c@x.com");
    set("Nome de exibição", "C");
    submit("Criar usuário");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).handle).toBeNull();
  });

  it("papel Administrador é enviado", async () => {
    const fetchMock = stub(json({ data: USER }, 201));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    fireEvent.change(field("Papel"), { target: { value: "admin" } });
    submit("Criar usuário");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).role).toBe("admin");
  });

  it("409 USER_CONFLICT do e-mail: a mensagem vai ao campo do e-mail, com o foco", async () => {
    stub(json(apiError("USER_CONFLICT", [{ field: "email" }]), 409));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    await screen.findByText("Já existe uma conta com este e-mail.");
    expect(field("E-mail").getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(field("E-mail")));
  });

  it("409 USER_CONFLICT do handle: a mensagem vai ao campo do handle", async () => {
    stub(json(apiError("USER_CONFLICT", [{ field: "handle" }]), 409));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    await screen.findByText("Já existe um usuário com este handle.");
    expect(field(/^Handle/).getAttribute("aria-invalid")).toBe("true");
  });

  it("422 do servidor: as mensagens por campo", async () => {
    stub(json(apiError("VALIDATION_ERROR", [{ field: "name", message: "O nome é obrigatório." }]), 422));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    await screen.findByText("O nome é obrigatório.");
  });

  it("falhas sem campo (rede, 500, sessão) vão à região geral e mantêm o que foi digitado", async () => {
    stub(async () => { throw new TypeError("falhou"); });
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    await screen.findByText(/Não foi possível conectar ao servidor/);
    expect(field("E-mail").value.trim()).toBe("Bia@Exemplo.com");
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Criar usuário" })).disabled).toBe(false);
  });

  it("enquanto envia: 'Enviando…', botão desabilitado, campos só de leitura", async () => {
    /** @type {(r: Response) => void} */
    let resolve = () => {};
    stub(() => new Promise((r) => (resolve = r)));
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} />);
    fill();
    submit("Criar usuário");
    const button = /** @type {HTMLButtonElement} */ (await screen.findByRole("button", { name: "Enviando…" }));
    expect(button.disabled).toBe(true);
    expect(field("E-mail").readOnly).toBe(true);
    resolve(json({ data: USER }, 201));
  });

  it("cancelar chama onCancel", () => {
    const onCancel = vi.fn();
    render(<UserForm mode="create" currentUserId="admin" onDone={() => {}} onCancel={onCancel} />);
    submit("Cancelar");
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("editar", () => {
  it("o e-mail é somente leitura e o foco abre no nome", () => {
    render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
    expect(field("E-mail").readOnly).toBe(true);
    expect(field("E-mail").value).toBe("ana@exemplo.com");
    expect(document.activeElement).toBe(field("Nome de exibição"));
    expect(screen.getByText(/não pode ser alterado/)).toBeTruthy();
  });

  it("envia só o que mudou", async () => {
    const fetchMock = stub(json({ data: { ...USER, name: "Ana Maria" } }));
    const onDone = vi.fn();
    render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={onDone} />);
    set("Nome de exibição", "Ana Maria");
    submit("Salvar alterações");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/users/u1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Ana Maria" });
    expect(onDone.mock.calls[0][0].temporaryPassword).toBeNull();
  });

  it("sem mudança: avisa 'Nada mudou.' e não envia", () => {
    const fetchMock = stub(json({}));
    render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
    submit("Salvar alterações");
    expect(screen.getByText("Nada mudou.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o papel muda para Administrador", async () => {
    const fetchMock = stub(json({ data: { ...USER, role: "admin" } }));
    render(<UserForm mode="edit" user={USER} currentUserId="admin" activeAdminCount={1} onDone={() => {}} />);
    fireEvent.change(field("Papel"), { target: { value: "admin" } });
    submit("Salvar alterações");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: "admin" });
  });

  describe("o handle (ADR-024)", () => {
    it("trocar o handle avisa que o endereço antigo deixa de existir, sem redirecionamento, e pede a ciência", async () => {
      const fetchMock = stub(json({ data: { ...USER, handle: "ana-s" } }));
      render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
      set(/^Handle/, "ana-s");
      expect(screen.getByText(/Não há redirecionamento/)).toBeTruthy();
      expect(screen.getByText("/ana", { selector: "strong" })).toBeTruthy();
      expect(screen.getByText("/ana-s", { selector: "strong" })).toBeTruthy();
      submit("Salvar alterações");
      expect(screen.getByText(/Confirme que você entende/)).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole("checkbox"));
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("checkbox"));
      submit("Salvar alterações");
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ handle: "ana-s" });
    });

    it("remover o handle também avisa (o espaço sai do ar) e envia null depois da ciência", async () => {
      const fetchMock = stub(json({ data: { ...USER, handle: null } }));
      render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
      set(/^Handle/, "  ");
      expect(screen.getByText(/tira o espaço público do ar/)).toBeTruthy();
      fireEvent.click(screen.getByRole("checkbox"));
      submit("Salvar alterações");
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ handle: null });
    });

    it("sem mudar o handle, nenhum aviso", () => {
      render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
      expect(screen.queryByText(/Não há redirecionamento/)).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("dar um handle a quem não tinha não avisa (nenhum endereço quebra)", () => {
      render(<UserForm mode="edit" user={{ ...USER, handle: null }} currentUserId="admin" onDone={() => {}} />);
      set(/^Handle/, "nova");
      expect(screen.queryByText(/Não há redirecionamento/)).toBeNull();
    });

    it("voltar ao handle original some com o aviso", () => {
      render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
      set(/^Handle/, "outro");
      expect(screen.getByRole("checkbox")).toBeTruthy();
      set(/^Handle/, "ana");
      expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("o aviso e o handle são texto puro", () => {
      render(<UserForm mode="edit" user={{ ...USER, handle: "ana" }} currentUserId="admin" onDone={() => {}} />);
      set(/^Handle/, "<img src=x onerror=alert(1)>");
      expect(document.querySelector("form img")).toBeNull();
    });
  });

  describe("o último administrador (RN22)", () => {
    const LAST = { ...USER, id: "adm", role: /** @type {const} */ ("admin") };

    it("o papel fica desabilitado, com a explicação, quando é o último administrador ativo", () => {
      render(<UserForm mode="edit" user={LAST} currentUserId="outro" activeAdminCount={1} onDone={() => {}} />);
      expect(field("Papel").disabled).toBe(true);
      expect(screen.getByText(/último administrador ativo/)).toBeTruthy();
    });

    it("havendo outro administrador, o papel é editável", () => {
      render(<UserForm mode="edit" user={LAST} currentUserId="outro" activeAdminCount={2} onDone={() => {}} />);
      expect(field("Papel").disabled).toBe(false);
    });

    it("se a tela errar, o 409 LAST_ADMIN do servidor aparece em português e o formulário segue aberto", async () => {
      stub(json(apiError("LAST_ADMIN"), 409));
      render(<UserForm mode="edit" user={LAST} currentUserId="outro" activeAdminCount={null} onDone={() => {}} />);
      fireEvent.change(field("Papel"), { target: { value: "user" } });
      submit("Salvar alterações");
      await screen.findByText(/último administrador ativo: ele não pode ser rebaixado/);
      expect(field("Papel").value).toBe("user");
    });
  });

  it("os valores do usuário são texto, nunca HTML", () => {
    render(<UserForm mode="edit" user={{ ...USER, name: "<b>Ana</b>", email: "<i>x</i>@a.com" }} currentUserId="admin" onDone={() => {}} />);
    expect(document.querySelector("form b, form i")).toBeNull();
    expect(field("Nome de exibição").value).toBe("<b>Ana</b>");
  });

  it("só usa tokens de tema", () => {
    const { container } = render(<UserForm mode="edit" user={USER} currentUserId="admin" onDone={() => {}} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});
