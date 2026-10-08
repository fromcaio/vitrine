// Modelo da gestão de usuários (RF27; RN20 a RN24; ADR-024): regras da matriz de autorização que a
// tela respeita, validação do formulário e modelos de endereço. Ambiente node, sem DOM.
import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  NAME_MAX_LENGTH,
  RESERVED_HANDLES,
  adjustActiveAdmins,
  expandUserHref,
  formatWhen,
  handleChangeBreaksUrls,
  handleError,
  normalizeHandleInput,
  normalizePage,
  normalizeUser,
  permissionsFor,
  statesOf,
  validateUserForm,
} from "@/components/admin/user-model";
import { HANDLE_MAX_LENGTH as S_MAX, HANDLE_MIN_LENGTH as S_MIN, HANDLE_PATTERN as S_PATTERN, NAME_MAX_LENGTH as S_NAME, RESERVED_HANDLES as S_RESERVED, handleError as serverHandleError } from "@/lib/validators";

/** @param {Partial<import("@/components/admin/user-model").PublicUser>} [over] */
const user = (over = {}) => ({
  id: "u1", name: "Ana Souza", email: "ana@exemplo.com", handle: "ana", role: /** @type {const} */ ("user"), suspended: false,
  banReason: null, banExpires: null, avatarImageId: null, mustChangePassword: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: null, ...over,
});

describe("as regras repetem as do servidor", () => {
  it("handle: limites, padrão e nomes reservados", () => {
    expect([HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH]).toEqual([S_MIN, S_MAX]);
    expect(HANDLE_PATTERN.source).toBe(S_PATTERN.source);
    // A interface reserva tudo o que o servidor reserva e, desde o épico v1 (ADR-034), também "media" (o Core
    // acrescenta o mesmo nome ao servidor); a lista da interface pode ser a maior sem quebrar este teste.
    for (const name of S_RESERVED) expect(RESERVED_HANDLES).toContain(name);
    expect(RESERVED_HANDLES).toContain("media");
    expect(NAME_MAX_LENGTH).toBe(S_NAME);
    expect(EMAIL_MAX_LENGTH).toBe(254);
  });

  it("handleError dá a mesma mensagem que o servidor, em amostras", () => {
    for (const sample of ["ab", "a".repeat(31), "-ab", "a--b", "Ab", "admin", "api", "login", "logout", "ana", "a-b-c", "123"]) {
      expect(handleError(sample)).toBe(serverHandleError(sample));
    }
  });
});

describe("normalizeUser e normalizePage", () => {
  it("só os campos conhecidos, com os tipos certos", () => {
    const result = normalizeUser({ id: "x", name: 5, email: "e@x.com", handle: "", role: "root", suspended: "sim", mustChangePassword: true, passwordHash: "segredo", extra: 1 });
    expect(result).toEqual({ id: "x", name: "", email: "e@x.com", handle: null, role: "user", suspended: false, banReason: null, banExpires: null, avatarImageId: null, mustChangePassword: true, createdAt: null, updatedAt: null });
    expect(JSON.stringify(result)).not.toMatch(/segredo/);
  });

  it("sem id não é usuário", () => {
    expect(normalizeUser({ name: "x" })).toBeNull();
    expect(normalizeUser(null)).toBeNull();
    expect(normalizeUser({ id: "" })).toBeNull();
  });

  it("a página: itens saneados, total, limit e offset com padrões", () => {
    expect(normalizePage({ data: [{ id: "a" }, { nope: 1 }], total: 7, limit: 20, offset: 40 })).toMatchObject({ total: 7, limit: 20, offset: 40 });
    expect(normalizePage({ data: [{ id: "a" }, { nope: 1 }], total: 7, limit: 20, offset: 40 }).users).toHaveLength(1);
    expect(normalizePage(null)).toEqual({ users: [], total: 0, limit: 50, offset: 0 });
    expect(normalizePage({ data: [{ id: "a" }], total: "x", limit: 0, offset: -3 })).toMatchObject({ total: 1, limit: 1, offset: 0 });
  });
});

describe("permissionsFor: a tela só oferece o que a matriz aceita", () => {
  it("um usuário comum, outro: tudo permitido", () => {
    expect(permissionsFor(user(), { currentUserId: "admin", activeAdminCount: 2 })).toMatchObject({ self: false, canSuspend: true, canDelete: true, canChangeRole: true, canReactivate: false });
  });

  it("a PRÓPRIA conta não se suspende nem se exclui (403), com a explicação", () => {
    const p = permissionsFor(user({ id: "me", role: "admin" }), { currentUserId: "me", activeAdminCount: 3 });
    expect(p).toMatchObject({ self: true, canSuspend: false, canDelete: false });
    expect(p.suspendReason).toMatch(/sua conta/);
    expect(p.deleteReason).toMatch(/sua conta/);
  });

  it("o ÚLTIMO administrador ativo não é rebaixado, suspenso nem excluído (409)", () => {
    const p = permissionsFor(user({ id: "a", role: "admin" }), { currentUserId: "outro", activeAdminCount: 1 });
    expect(p).toMatchObject({ lastAdmin: true, canSuspend: false, canDelete: false, canChangeRole: false });
    expect(p.roleReason).toMatch(/último administrador/);
  });

  it("havendo outro administrador ativo, o administrador pode ser suspenso, excluído e rebaixado", () => {
    expect(permissionsFor(user({ role: "admin" }), { currentUserId: "outro", activeAdminCount: 2 })).toMatchObject({ lastAdmin: false, canSuspend: true, canDelete: true, canChangeRole: true });
  });

  it("um administrador JÁ suspenso não conta como ativo: não é 'o último'", () => {
    expect(permissionsFor(user({ role: "admin", suspended: true }), { currentUserId: "outro", activeAdminCount: 1 })).toMatchObject({ lastAdmin: false, canReactivate: true, canSuspend: false });
  });

  it("sem saber quantos administradores há, não bloqueia (o servidor decide)", () => {
    expect(permissionsFor(user({ role: "admin" }), { currentUserId: "outro" })).toMatchObject({ lastAdmin: false, canDelete: true });
    expect(permissionsFor(user({ role: "admin" }), { currentUserId: "outro", activeAdminCount: null }).lastAdmin).toBe(false);
  });

  it("um usuário comum nunca é 'o último administrador'", () => {
    expect(permissionsFor(user(), { currentUserId: "outro", activeAdminCount: 1 }).lastAdmin).toBe(false);
  });

  it("quem já está suspenso se reativa, mesmo sendo a própria conta", () => {
    expect(permissionsFor(user({ id: "me", suspended: true }), { currentUserId: "me", activeAdminCount: 2 })).toMatchObject({ canReactivate: true, suspendReason: null });
  });
});

describe("adjustActiveAdmins", () => {
  const admin = user({ role: "admin" });
  it("suspender, reativar, rebaixar, promover e excluir mantêm a contagem em dia", () => {
    expect(adjustActiveAdmins(3, admin, { ...admin, suspended: true })).toBe(2);
    expect(adjustActiveAdmins(2, { ...admin, suspended: true }, admin)).toBe(3);
    expect(adjustActiveAdmins(3, admin, { ...admin, role: "user" })).toBe(2);
    expect(adjustActiveAdmins(2, user(), { ...user(), role: "admin" })).toBe(3);
    expect(adjustActiveAdmins(3, admin, null)).toBe(2);
    expect(adjustActiveAdmins(3, user(), null)).toBe(3);
  });

  it("nunca fica negativa e, sem contagem, continua sem contagem", () => {
    expect(adjustActiveAdmins(0, admin, null)).toBe(0);
    expect(adjustActiveAdmins(undefined, admin, null)).toBeNull();
    expect(adjustActiveAdmins(null, admin, null)).toBeNull();
  });
});

describe("statesOf: o estado em texto", () => {
  it("ativo", () => {
    expect(statesOf(user())).toEqual([{ key: "active", label: "Ativo", detail: null }]);
  });

  it("suspenso com prazo diz até quando; sem prazo diz 'sem prazo'", () => {
    const withDeadline = statesOf(user({ suspended: true, banExpires: "2026-12-25T15:30:00.000Z" }))[0];
    expect(withDeadline).toMatchObject({ key: "suspended", label: "Suspenso" });
    expect(withDeadline.detail).toBe(`até ${formatWhen("2026-12-25T15:30:00.000Z")}`);
    expect(withDeadline.detail).toMatch(/25\/12\/2026/);
    expect(statesOf(user({ suspended: true }))[0].detail).toBe("sem prazo");
  });

  it("senha provisória pendente é um estado a mais", () => {
    expect(statesOf(user({ mustChangePassword: true })).map((s) => s.key)).toEqual(["active", "pending"]);
    expect(statesOf(user({ suspended: true, mustChangePassword: true })).map((s) => s.key)).toEqual(["suspended", "pending"]);
  });

  it("um prazo ilegível não derruba", () => {
    expect(statesOf(user({ suspended: true, banExpires: "lixo" }))[0].detail).toBe("sem prazo");
  });
});

describe("handle", () => {
  it("normaliza: apara, minúsculas, vazio é null", () => {
    expect(normalizeHandleInput("  AnA ")).toBe("ana");
    expect(normalizeHandleInput("   ")).toBeNull();
    expect(normalizeHandleInput("")).toBeNull();
  });

  it("null é válido (sem espaço público)", () => {
    expect(handleError(null)).toBeNull();
  });

  it("trocar ou remover um handle que existe quebra URLs; dar um a quem não tinha, não", () => {
    expect(handleChangeBreaksUrls("ana", "ana-s")).toBe(true);
    expect(handleChangeBreaksUrls("ana", null)).toBe(true);
    expect(handleChangeBreaksUrls("ana", "ana")).toBe(false);
    expect(handleChangeBreaksUrls(null, "ana")).toBe(false);
    expect(handleChangeBreaksUrls(null, null)).toBe(false);
  });
});

describe("validateUserForm", () => {
  const ok = { email: " ANA@Exemplo.com ", name: "  Ana  ", handle: " Ana ", role: "user" };

  it("cria: normaliza e-mail, nome e handle", () => {
    expect(validateUserForm(ok, "create")).toEqual({ errors: {}, value: { email: "ana@exemplo.com", name: "Ana", handle: "ana", role: "user" } });
  });

  it("editar: não leva o e-mail", () => {
    const { value, errors } = validateUserForm({ ...ok, email: "" }, "edit");
    expect(errors).toEqual({});
    expect("email" in value).toBe(false);
  });

  it("e-mail: obrigatório, formato e tamanho (só na criação)", () => {
    expect(validateUserForm({ ...ok, email: "" }, "create").errors.email).toBe("O e-mail é obrigatório.");
    for (const bad of ["ana", "ana@", "@x.com", "a b@x.com", "ana@x"]) expect(validateUserForm({ ...ok, email: bad }, "create").errors.email, bad).toBe("Informe um e-mail válido.");
    expect(validateUserForm({ ...ok, email: `${"a".repeat(250)}@x.com` }, "create").errors.email).toBe("O e-mail é longo demais.");
  });

  it("nome: obrigatório e até 100 caracteres depois de aparado", () => {
    expect(validateUserForm({ ...ok, name: "   " }, "create").errors.name).toBe("O nome é obrigatório.");
    expect(validateUserForm({ ...ok, name: "a".repeat(101) }, "create").errors.name).toBe("O nome deve ter no máximo 100 caracteres.");
    expect(validateUserForm({ ...ok, name: ` ${"a".repeat(100)} ` }, "create").errors.name).toBeUndefined();
  });

  it("handle: vazio vira null (sem espaço); inválido e reservado têm a mensagem do servidor", () => {
    expect(validateUserForm({ ...ok, handle: "  " }, "create").value.handle).toBeNull();
    expect(validateUserForm({ ...ok, handle: "ab" }, "create").errors.handle).toMatch(/de 3 a 30/);
    expect(validateUserForm({ ...ok, handle: "admin" }, "create").errors.handle).toBe('O handle "admin" é reservado.');
    expect(validateUserForm({ ...ok, handle: "a b" }, "create").errors.handle).toMatch(/apenas letras minúsculas/);
  });

  it("papel: só admin ou user", () => {
    expect(validateUserForm({ ...ok, role: "root" }, "create").errors.role).toMatch(/Administrador ou Usuário/);
    expect(validateUserForm({ ...ok, role: "admin" }, "create").value.role).toBe("admin");
  });
});

describe("expandUserHref (modelo de texto)", () => {
  it("troca {id} e {handle}, codificando", () => {
    expect(expandUserHref("/admin/usuarios/{id}/conteudo", { id: "a b" })).toBe("/admin/usuarios/a%20b/conteudo");
    expect(expandUserHref("/{handle}", { handle: "ana" })).toBe("/ana");
    expect(expandUserHref("/{id}/{id}", { id: "k" })).toBe("/k/k");
  });
});
