// Configuração do better-auth do M16 (ADR-029), com o plugin `admin` real sobre o banco temporário:
// campos próprios com `input: false` (CT38), sem cache de cookie e suspensão que vale mesmo com a
// sessão ainda no banco (CT41), papéis personalizados (sem personificação), ganchos do handle (RN20)
// e a mensagem de quem tenta entrar suspenso (RN23).
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, bannedUserMessage, getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { authRequest, createAdminSession, createTestUser, createUserSession, resetDatabase, signIn } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const headersOf = (/** @type {string} */ cookie) => new Headers({ cookie });

/** Mensagem do erro lançado por uma chamada de `auth.api.*` que deve falhar. @param {() => Promise<unknown>} fn */
async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    const e = /** @type {any} */ (error);
    return { status: e?.statusCode ?? e?.status, code: e?.body?.code, message: e?.body?.message ?? e?.message };
  }
  return null;
}

describe("campos próprios e sessão (CT38)", () => {
  it("handle e mustChangePassword não aceitam entrada (input: false)", () => {
    const fields = /** @type {any} */ (auth.options.user?.additionalFields);
    expect(fields.handle).toMatchObject({ type: "string", input: false });
    expect(fields.mustChangePassword).toMatchObject({ type: "boolean", input: false });
  });

  it("o cache de cookie de sessão está desligado", () => {
    expect(/** @type {any} */ (auth.options.session?.cookieCache?.enabled)).toBe(false);
  });

  it("o cadastro público está desabilitado e a personificação, sem permissão para o administrador", async () => {
    expect(/** @type {any} */ (auth.options.emailAndPassword?.disableSignUp)).toBe(true);
    const { cookie } = await createAdminSession();
    const ana = await createTestUser({ email: "ana@exemplo.test" });

    const denied = await failure(() => auth.api.impersonateUser({ headers: headersOf(cookie), body: { userId: ana.id } }));
    expect(denied?.status).toBe(403);
    expect(await prisma.session.count({ where: { impersonatedBy: { not: null } } })).toBe(0);
  });

  it("o usuário comum não tem nenhuma permissão do plugin; o administrador tem as de gestão de contas", async () => {
    const admin = await createAdminSession();
    const ana = await createUserSession({ email: "ana@exemplo.test" });

    expect(await failure(() => auth.api.listUsers({ headers: headersOf(ana.cookie), query: {} }))).toMatchObject({ status: 403 });
    expect(await failure(() => auth.api.createUser({ headers: headersOf(ana.cookie), body: { email: "x@exemplo.test", name: "X", password: "senha-ficticia-123" } }))).toMatchObject({ status: 403 });
    expect(await failure(() => auth.api.setRole({ headers: headersOf(ana.cookie), body: { userId: ana.id, role: "admin" } }))).toMatchObject({ status: 403 });
    expect(await failure(() => auth.api.banUser({ headers: headersOf(ana.cookie), body: { userId: admin.userId } }))).toMatchObject({ status: 403 });

    const listed = await auth.api.listUsers({ headers: headersOf(admin.cookie), query: {} });
    expect(listed.total).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).role).toBe("user");
  });

  it("o papel padrão é user", async () => {
    const created = await auth.api.createUser({ body: { email: "sem-papel@exemplo.test", name: "Sem Papel", password: "senha-ficticia-123" } });
    expect(created.user.role).toBe("user");
  });
});

describe("suspensão e sessão (RN23; CT41)", () => {
  it("getSession devolve a sessão de quem não está suspenso", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    expect((await getSession(headersOf(ana.cookie)))?.user).toMatchObject({ email: "ana@exemplo.test", role: "user", mustChangePassword: false });
  });

  it("getSession recusa o cookie de quem foi suspenso depois do login, mesmo com a sessão no banco", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "teste" } });

    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(1); // a sessão não foi revogada
    expect(await getSession(headersOf(ana.cookie))).toBeNull();
    // o pacote, sozinho, ainda a devolveria: a recusa é do Vitrine (sem cache de cookie, o banco é consultado)
    expect(await auth.api.getSession({ headers: headersOf(ana.cookie) })).not.toBeNull();
  });

  it("a suspensão com prazo vencido deixa de valer sozinha, sem ação do administrador", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "x", banExpires: new Date(Date.now() - 1000) } });
    expect(await getSession(headersOf(ana.cookie))).not.toBeNull();

    await prisma.user.update({ where: { id: ana.id }, data: { banExpires: new Date(Date.now() + 60_000) } });
    expect(await getSession(headersOf(ana.cookie))).toBeNull();
  });

  it("login suspenso com a senha certa: 403 BANNED_USER com o motivo e o prazo; sem sessão nem cookie", async () => {
    const until = new Date("2099-01-02T15:30:00Z");
    const ana = await createTestUser({ email: "ana@exemplo.test", banned: true, banReason: "Spam repetido", banExpires: until });

    const { response } = await signIn({ email: ana.email, password: ana.password });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("BANNED_USER");
    expect(body.message).toContain("Sua conta está suspensa.");
    expect(body.message).toContain("Motivo: Spam repetido");
    expect(body.message).toContain("02/01/2099");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
  });

  it("login suspenso com a senha errada recebe a mensagem genérica e não revela a suspensão (UC08, A4)", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test", banned: true, banReason: "Spam" });

    const { response } = await signIn({ email: ana.email, password: "senha-incorreta-000" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(JSON.stringify(body)).not.toContain("suspensa");
  });

  it("a suspensão sem prazo não vence", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test", banned: true, banReason: "x" });
    expect((await signIn({ email: ana.email, password: ana.password })).response.status).toBe(403);
  });

  it("suspensão vencida: o login volta a funcionar e o plugin limpa o marcador", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test", banned: true, banReason: "x", banExpires: new Date(Date.now() - 60_000) });

    expect((await signIn({ email: ana.email, password: ana.password })).response.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).toMatchObject({ banned: false, banReason: null, banExpires: null });
  });

  it("bannedUserMessage: sem prazo nem motivo, só a frase base", () => {
    expect(bannedUserMessage({})).toBe("Sua conta está suspensa.");
    expect(bannedUserMessage({ banReason: "Spam" })).toBe("Sua conta está suspensa. Motivo: Spam.");
  });

  it("bannedUserMessage: o motivo termina em ponto antes do prazo (ou mantém o seu ponto final)", () => {
    const banExpires = new Date("2026-10-10T12:00:00Z");

    expect(bannedUserMessage({ banReason: "Violação das regras da plataforma", banExpires })).toBe(
      "Sua conta está suspensa. Motivo: Violação das regras da plataforma. A suspensão vai até 10/10/2026, 12:00 (UTC).",
    );
    for (const ending of [".", "!", "?"]) {
      const message = bannedUserMessage({ banReason: `Basta${ending}`, banExpires });
      expect(message).toContain(`Motivo: Basta${ending} A suspensão`);
      expect(message).not.toContain(`${ending}.`);
    }
  });

  it("bannedUserMessage: espaços sobrando no motivo não viram ponto solto", () => {
    expect(bannedUserMessage({ banReason: "  Spam  " })).toBe("Sua conta está suspensa. Motivo: Spam.");
    expect(bannedUserMessage({ banReason: "   " })).toBe("Sua conta está suspensa.");
  });
});

describe("handle: normalização e validação nos ganchos do banco (RN20)", () => {
  it("normaliza o handle (aparas e minúsculas) ao criar", async () => {
    const created = await auth.api.createUser({
      body: { email: "ana@exemplo.test", name: "Ana", password: "senha-ficticia-123", data: { handle: "  Ana-Silva " } },
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } })).handle).toBe("ana-silva");
  });

  it("recusa handle reservado, curto, longo, com hífen nas pontas, repetido ou com caracteres inválidos", async () => {
    const invalid = ["admin", "API", "login", "logout", "_next", "ab", "a".repeat(31), "-ana", "ana-", "ana--silva", "ana_silva", "ana.silva", "ana silva", "aná"];
    for (const [index, handle] of invalid.entries()) {
      const error = await failure(() =>
        auth.api.createUser({ body: { email: `u${index}@exemplo.test`, name: "U", password: "senha-ficticia-123", data: { handle } } }),
      );
      expect(error, handle).not.toBeNull();
      expect(error?.code, handle).toBe("INVALID_HANDLE");
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("a mesma validação vale na atualização pelo adaptador interno", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test", handle: "ana" });
    const ctx = await auth.$context;

    await ctx.internalAdapter.updateUser(ana.id, { handle: "  NOVA-ana  " });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).handle).toBe("nova-ana");

    expect((await failure(() => ctx.internalAdapter.updateUser(ana.id, { handle: "Admin" })))?.code).toBe("INVALID_HANDLE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).handle).toBe("nova-ana");
  });

  it("atualizar outros campos não exige handle", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test" });
    const ctx = await auth.$context;
    await ctx.internalAdapter.updateUser(ana.id, { name: "Ana Nova" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).name).toBe("Ana Nova");
  });

  it("handle repetido não é aceito pelo banco (único)", async () => {
    await createTestUser({ email: "ana@exemplo.test", handle: "ana" });
    await expect(createTestUser({ email: "outra@exemplo.test", handle: "ana" })).rejects.toBeTruthy();
    expect(await prisma.user.count()).toBe(1);
  });

  it("as rotas do pacote seguem sem aceitar o handle (input: false): sign-in não cria nem altera", async () => {
    const response = await authRequest("/sign-up/email", { body: { name: "X", email: "x@exemplo.test", password: "senha-ficticia-123", handle: "x-x" } });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count()).toBe(0);
  });
});
