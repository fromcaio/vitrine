// Comandos de terminal (ADR-029, item 8; CT06, RN22): `ensureInitialAdmin` (admin:create) cria o
// primeiro administrador, é idempotente e recupera o acesso quando não resta administrador ativo; e
// `resetUserPassword` (admin:reset-password) define a senha, revoga as sessões e liga a troca
// obrigatória. Better-auth real sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureInitialAdmin, getSession, resetUserPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN, PASSWORD, createTestUser, createUserSession, resetDatabase, signIn } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const row = (/** @type {string} */ email) =>
  prisma.user.findUniqueOrThrow({ where: { email }, select: { role: true, handle: true, banned: true, mustChangePassword: true } });
const loginStatus = async (/** @type {string} */ email, /** @type {string} */ password) =>
  (await signIn({ email, password })).response.status;

describe("admin:create com ADMIN_HANDLE", () => {
  it("cria o administrador com o handle normalizado", async () => {
    const result = await ensureInitialAdmin({ ...ADMIN, handle: "  Portal " });

    expect(result.status).toBe("created");
    expect(await row(ADMIN.email)).toMatchObject({ role: "admin", handle: "portal", mustChangePassword: false });
    expect(await loginStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  it("sem handle, o administrador é criado sem espaço público (handle nulo)", async () => {
    await ensureInitialAdmin(ADMIN);
    expect((await row(ADMIN.email)).handle).toBeNull();
    for (const handle of [undefined, null, "", "   "]) {
      await resetDatabase();
      expect((await ensureInitialAdmin({ ...ADMIN, handle })).status).toBe("created");
    }
  });

  it("recusa um handle inválido ou reservado sem criar o usuário (status invalid)", async () => {
    for (const handle of ["Admin!", "admin", "api", "login", "logout", "ab", "-x-", "a--b"]) {
      const result = await ensureInitialAdmin({ ...ADMIN, handle });
      expect(result.status, handle).toBe("invalid");
      expect(result.message, handle).toBeTruthy();
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("recusa o handle já usado por outra conta (conflict handle-taken), mesmo suspensa", async () => {
    await createTestUser({ email: "ana@exemplo.test", handle: "portal", role: "admin", banned: true, banReason: "x" });
    await prisma.user.update({ where: { email: "ana@exemplo.test" }, data: { role: "user" } });
    // sem nenhum administrador ativo, o e-mail novo seria criado, mas o handle está ocupado
    const result = await ensureInitialAdmin({ ...ADMIN, handle: "portal" });

    expect(result).toEqual({ status: "conflict", reason: "handle-taken", user: null });
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("admin:create e a recuperação de acesso (RN22)", () => {
  it("com administrador ativo, outro e-mail é recusado e nada é criado (conflict admin-exists)", async () => {
    await ensureInitialAdmin(ADMIN);
    const result = await ensureInitialAdmin({ ...ADMIN, email: "outro@exemplo.test" });

    expect(result).toEqual({ status: "conflict", reason: "admin-exists", user: null });
    expect(await prisma.user.count()).toBe(1);
  });

  it("com administrador ativo, o e-mail de um usuário comum não é promovido (conflict not-admin)", async () => {
    await ensureInitialAdmin(ADMIN);
    await createTestUser({ email: "ana@exemplo.test" });

    const result = await ensureInitialAdmin({ ...ADMIN, email: "ana@exemplo.test" });

    expect(result).toMatchObject({ status: "conflict", reason: "not-admin" });
    expect((await row("ana@exemplo.test")).role).toBe("user");
  });

  it("sem administrador ativo (rebaixado), o mesmo e-mail é promovido e volta a entrar", async () => {
    await ensureInitialAdmin(ADMIN);
    await prisma.user.update({ where: { email: ADMIN.email }, data: { role: "user" } });

    const result = await ensureInitialAdmin(ADMIN);

    expect(result.status).toBe("recovered");
    expect((await row(ADMIN.email)).role).toBe("admin");
    expect(await loginStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  it("sem administrador ativo (suspenso), o mesmo e-mail é promovido e a suspensão é levantada", async () => {
    await ensureInitialAdmin(ADMIN);
    await prisma.user.update({ where: { email: ADMIN.email }, data: { banned: true, banReason: "x", banExpires: null } });

    const result = await ensureInitialAdmin(ADMIN);

    expect(result.status).toBe("recovered");
    expect(await row(ADMIN.email)).toMatchObject({ role: "admin", banned: false });
    expect(await loginStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  it("sem administrador ativo (todos suspensos), um e-mail novo cria o administrador", async () => {
    await ensureInitialAdmin(ADMIN);
    await prisma.user.update({ where: { email: ADMIN.email }, data: { banned: true, banExpires: null } });

    const result = await ensureInitialAdmin({ ...ADMIN, email: "novo@exemplo.test" });

    expect(result.status).toBe("created");
    expect(await prisma.user.count({ where: { role: "admin", banned: false } })).toBe(1);
  });

  it("suspensão com prazo vencido não conta: o administrador segue ativo e o e-mail novo é recusado", async () => {
    await ensureInitialAdmin(ADMIN);
    await prisma.user.update({ where: { email: ADMIN.email }, data: { banned: true, banExpires: new Date(Date.now() - 1000) } });

    const result = await ensureInitialAdmin({ ...ADMIN, email: "novo@exemplo.test" });

    expect(result).toEqual({ status: "conflict", reason: "admin-exists", user: null });
  });

  it("administrador suspenso com outro ativo existindo: o e-mail dele é recusado, não promovido", async () => {
    await createTestUser({ email: "a1@exemplo.test", role: "admin" });
    await createTestUser({ email: "a2@exemplo.test", role: "admin", banned: true, banReason: "x" });

    const result = await ensureInitialAdmin({ ...ADMIN, email: "a2@exemplo.test" });

    expect(result).toMatchObject({ status: "conflict", reason: "not-admin" });
    expect((await row("a2@exemplo.test")).banned).toBe(true);
  });

  it("administrador sem credencial (execução interrompida) é reparado", async () => {
    await ensureInitialAdmin(ADMIN);
    await prisma.account.deleteMany();

    expect((await ensureInitialAdmin(ADMIN)).status).toBe("repaired");
    expect(await loginStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  it("o usuário recuperado sem credencial recebe a senha informada", async () => {
    await createTestUser({ email: ADMIN.email, role: "user" });
    await prisma.account.deleteMany();

    expect((await ensureInitialAdmin(ADMIN)).status).toBe("recovered");
    expect(await loginStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  it("três execuções simultâneas em banco vazio criam um só administrador e todas terminam bem", async () => {
    const results = await Promise.allSettled([ensureInitialAdmin(ADMIN), ensureInitialAdmin(ADMIN), ensureInitialAdmin(ADMIN)]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const statuses = results.map((result) => /** @type {any} */ (result).value.status);
    expect(statuses).toContain("created");
    expect(statuses.every((status) => ["created", "exists", "repaired"].includes(status))).toBe(true);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("admin:reset-password (RN21)", () => {
  it("define a senha, revoga todas as sessões e liga a troca obrigatória", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    await signIn({ email: ana.email, password: ana.password }); // segunda sessão
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(2);

    const result = await resetUserPassword({ email: "ANA@exemplo.test", password: "senha-do-terminal-9" });

    expect(result).toEqual({ status: "reset", user: { id: ana.id, email: ana.email }, sessionsRevoked: 2, suspended: false });
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
    expect(await getSession(new Headers({ cookie: ana.cookie }))).toBeNull();
    expect(await loginStatus(ana.email, ana.password)).toBe(401);
    expect(await loginStatus(ana.email, "senha-do-terminal-9")).toBe(200);
    expect((await row(ana.email)).mustChangePassword).toBe(true);
  });

  it("e-mail inexistente: not-found, sem criar nada", async () => {
    expect(await resetUserPassword({ email: "ninguem@exemplo.test", password: PASSWORD })).toEqual({ status: "not-found" });
    expect(await prisma.user.count()).toBe(0);
  });

  it("repetir é idempotente: mesmo efeito", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test" });
    await resetUserPassword({ email: ana.email, password: "senha-do-terminal-9" });
    const again = await resetUserPassword({ email: ana.email, password: "senha-do-terminal-9" });

    expect(again).toMatchObject({ status: "reset", sessionsRevoked: 0 });
    expect(await loginStatus(ana.email, "senha-do-terminal-9")).toBe(200);
  });

  it("conta suspensa: a senha muda e o resultado avisa que ela segue suspensa", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test", banned: true, banReason: "x" });

    const result = await resetUserPassword({ email: ana.email, password: "senha-do-terminal-9" });

    expect(result).toMatchObject({ status: "reset", suspended: true });
    expect((await row(ana.email)).banned).toBe(true);
    expect(await loginStatus(ana.email, "senha-do-terminal-9")).toBe(403);
  });

  it("conta sem credencial: cria a credencial", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test" });
    await prisma.account.deleteMany({ where: { userId: ana.id } });

    expect((await resetUserPassword({ email: ana.email, password: "senha-do-terminal-9" })).status).toBe("reset");
    expect(await loginStatus(ana.email, "senha-do-terminal-9")).toBe(200);
  });

  it("guarda a senha somente como hash", async () => {
    const ana = await createTestUser({ email: "ana@exemplo.test" });
    await resetUserPassword({ email: ana.email, password: "senha-do-terminal-9" });

    const account = await prisma.account.findFirstOrThrow({ where: { userId: ana.id } });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain("senha-do-terminal-9");
  });
});
