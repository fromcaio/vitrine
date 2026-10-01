// Autenticação com o better-auth real sobre o SQLite temporário (M03): administrador inicial
// (RF22), login (CT01, parte de API), erro genérico (CT02), encerramento de sessão (CT05),
// cadastro público desabilitado (CT06), expiração (RN12) e limitação de tentativas (RNF03).
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureInitialAdmin, getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN, authRequest, cookieFrom, nextIp, resetDatabase, signIn } from "./helpers";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await resetDatabase();
  // O better-auth registra em log as tentativas inválidas; silenciado para não poluir a saída.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("administrador inicial (RF22, D-03)", () => {
  it("cria o usuário com credencial de e-mail e senha", async () => {
    const result = await ensureInitialAdmin(ADMIN);

    expect(result.status).toBe("created");
    expect(result.user).toMatchObject({ email: ADMIN.email, name: ADMIN.name });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email }, include: { accounts: true } });
    expect(user.emailVerified).toBe(true);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({ providerId: "credential", accountId: user.id });
  });

  it("guarda a senha somente como hash (RNF03)", async () => {
    await ensureInitialAdmin(ADMIN);
    const account = await prisma.account.findFirstOrThrow();

    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(ADMIN.password);
  });

  it("é idempotente: repetir não duplica nem altera a senha", async () => {
    await ensureInitialAdmin(ADMIN);
    const again = await ensureInitialAdmin({ ...ADMIN, password: "outra-senha-ficticia-456", name: "Outro Nome" });

    expect(again.status).toBe("exists");
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.account.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).name).toBe(ADMIN.name);

    expect((await signIn(ADMIN)).response.status).toBe(200);
    expect((await signIn({ ...ADMIN, password: "outra-senha-ficticia-456" })).response.status).toBe(401);
  });

  it("trata o e-mail sem diferenciar maiúsculas", async () => {
    await ensureInitialAdmin(ADMIN);
    const again = await ensureInitialAdmin({ ...ADMIN, email: "  ADMIN@Exemplo.TEST " });

    expect(again.status).toBe("exists");
    expect(await prisma.user.count()).toBe(1);
  });

  it("não cria um segundo administrador com outro e-mail (D-13)", async () => {
    await ensureInitialAdmin(ADMIN);
    const other = await ensureInitialAdmin({ ...ADMIN, email: "outro@exemplo.test" });

    expect(other).toEqual({ status: "conflict", user: null });
    expect(await prisma.user.count()).toBe(1);
  });

  it("completa a credencial de um usuário criado por execução interrompida", async () => {
    await prisma.user.create({ data: { name: ADMIN.name, email: ADMIN.email, emailVerified: true } });

    const result = await ensureInitialAdmin(ADMIN);

    expect(result.status).toBe("repaired");
    expect(await prisma.user.count()).toBe(1);
    expect((await signIn(ADMIN)).response.status).toBe(200);
  });
});

describe("login (RF01, UC08)", () => {
  beforeEach(async () => {
    await ensureInitialAdmin(ADMIN);
  });

  it("CT01: credenciais válidas criam a sessão no banco e gravam o cookie", async () => {
    const { response } = await signIn(ADMIN);

    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({ email: ADMIN.email });

    const sessions = await prisma.session.findMany({ include: { user: true } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].user.email).toBe(ADMIN.email);
    // RN12: a sessão expira em 7 dias
    const lifetime = sessions[0].expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(6.9 * DAY_IN_MS);
    expect(lifetime).toBeLessThanOrEqual(7 * DAY_IN_MS);
  });

  it("o cookie de sessão é HttpOnly e SameSite (RNF03)", async () => {
    const { response } = await signIn(ADMIN);
    const sessionCookie = response.headers.getSetCookie().find((cookie) => cookie.includes("session_token"));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
    expect(sessionCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(sessionCookie).toMatch(/;\s*Path=\//i);
  });

  it("a senha não aparece na resposta", async () => {
    const { response } = await signIn(ADMIN);
    expect(await response.text()).not.toContain(ADMIN.password);
  });

  it("CT02: senha errada e e-mail inexistente devolvem a mesma resposta genérica", async () => {
    const wrongPassword = (await signIn({ ...ADMIN, password: "senha-incorreta-000" })).response;
    const unknownEmail = (await signIn({ email: "ninguem@exemplo.test", password: ADMIN.password })).response;

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const [first, second] = [await wrongPassword.json(), await unknownEmail.json()];
    expect(first).toEqual(second);
    expect(first.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(wrongPassword.headers.getSetCookie()).toEqual([]);
    expect(await prisma.session.count()).toBe(0);
  });

  it("GET /api/auth/get-session devolve a sessão com cookie válido e nulo sem cookie", async () => {
    const { cookie } = await signIn(ADMIN);

    const withCookie = await authRequest("/get-session", { method: "GET", cookie });
    expect(withCookie.status).toBe(200);
    expect((await withCookie.json()).user.email).toBe(ADMIN.email);

    const withoutCookie = await authRequest("/get-session", { method: "GET" });
    expect(withoutCookie.status).toBe(200);
    expect(await withoutCookie.json()).toBeNull();
  });

  it("getSession valida a sessão no banco e recusa cookie forjado", async () => {
    const { cookie } = await signIn(ADMIN);

    expect((await getSession(new Headers({ cookie })))?.user.email).toBe(ADMIN.email);
    expect(await getSession(new Headers())).toBeNull();
    expect(await getSession(new Headers({ cookie: "better-auth.session_token=forjado.assinatura" }))).toBeNull();
  });

  it("RN12: sessão expirada equivale a nenhuma sessão", async () => {
    const { cookie } = await signIn(ADMIN);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await getSession(new Headers({ cookie }))).toBeNull();
  });

  it("RNF03: limita as tentativas de login por IP", async () => {
    const ip = nextIp();
    const attempt = () => signIn({ ...ADMIN, password: "senha-incorreta-000" }, { ip });

    for (let i = 0; i < 5; i++) expect((await attempt()).response.status).toBe(401);
    expect((await attempt()).response.status).toBe(429);
    // Nem a senha correta passa enquanto o limite estiver esgotado
    expect((await signIn(ADMIN, { ip })).response.status).toBe(429);
    // Outro IP não é afetado
    expect((await signIn(ADMIN)).response.status).toBe(200);
  });
});

describe("encerramento de sessão (RF20)", () => {
  it("CT05: invalida a sessão no banco e remove o cookie", async () => {
    await ensureInitialAdmin(ADMIN);
    const { cookie } = await signIn(ADMIN);
    expect(await prisma.session.count()).toBe(1);

    const response = await authRequest("/sign-out", { cookie, body: {} });

    expect(response.status).toBe(200);
    expect(await prisma.session.count()).toBe(0);
    const cleared = response.headers.getSetCookie().find((entry) => entry.includes("session_token"));
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cookieFrom(response)).toMatch(/session_token=(;|$)/);
    // O cookie antigo não vale mais
    expect(await getSession(new Headers({ cookie }))).toBeNull();
  });
});

describe("cadastro público (RF22)", () => {
  it("CT06: POST /api/auth/sign-up/email é recusado, antes e depois do bootstrap", async () => {
    const signUp = () =>
      authRequest("/sign-up/email", {
        body: { name: "Intruso", email: "intruso@exemplo.test", password: "senha-ficticia-123" },
      });

    const beforeBootstrap = await signUp();
    expect(beforeBootstrap.status).toBe(400);
    expect((await beforeBootstrap.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
    expect(await prisma.user.count()).toBe(0);

    await ensureInitialAdmin(ADMIN);
    const afterBootstrap = await signUp();
    expect(afterBootstrap.status).toBe(400);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.user.findUnique({ where: { email: "intruso@exemplo.test" } })).toBeNull();
  });
});
