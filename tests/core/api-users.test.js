// Rotas de /api/users (M16; Cap. 5 §5.10, ADR-029) com o better-auth real sobre o banco temporário:
// criação só pelo administrador com senha provisória (CT06, CT40), troca obrigatória, suspensão com
// revogação de sessões (CT41), último administrador e exclusão atômica (CT42), limites de taxa e a
// ordem das verificações. Os testes de criação de contas usam o banco temporário (trava, ADR-023).
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import * as banRoute from "@/app/api/users/[id]/ban/route";
import * as passwordResetRoute from "@/app/api/users/[id]/password/route";
import * as userRoute from "@/app/api/users/[id]/route";
import * as meRoute from "@/app/api/users/me/route";
import * as mePasswordRoute from "@/app/api/users/me/password/route";
import * as usersRoute from "@/app/api/users/route";
import { RATE_LIMITS } from "@/app/api/_lib/rate-limit";
import { auth, getSession } from "@/lib/auth";
import { createContent, prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createTestUser, createUserSession, resetDatabase, routeContext, signIn } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

// ---- atalhos ----

const list = (cookie = admin.cookie, query = "") => usersRoute.GET(apiRequest(`/api/users${query}`, { cookie }));
const create = (body, cookie = admin.cookie, headers = {}) =>
  usersRoute.POST(apiRequest("/api/users", { method: "POST", body, cookie, headers }));
const detail = (id, cookie = admin.cookie) => userRoute.GET(apiRequest(`/api/users/${id}`, { cookie }), routeContext({ id }));
const patch = (id, body, cookie = admin.cookie) =>
  userRoute.PATCH(apiRequest(`/api/users/${id}`, { method: "PATCH", body, cookie }), routeContext({ id }));
const remove = (id, query = "", cookie = admin.cookie) =>
  userRoute.DELETE(apiRequest(`/api/users/${id}${query}`, { method: "DELETE", cookie }), routeContext({ id }));
const resetPassword = (id, body = {}, cookie = admin.cookie) =>
  passwordResetRoute.PUT(apiRequest(`/api/users/${id}/password`, { method: "PUT", body, cookie }), routeContext({ id }));
const ban = (id, body, cookie = admin.cookie) =>
  banRoute.POST(apiRequest(`/api/users/${id}/ban`, { method: "POST", body, cookie }), routeContext({ id }));
const unban = (id, cookie = admin.cookie) =>
  banRoute.DELETE(apiRequest(`/api/users/${id}/ban`, { method: "DELETE", cookie }), routeContext({ id }));
const me = (cookie) => meRoute.GET(apiRequest("/api/users/me", { cookie }));
const updateMe = (body, cookie) => meRoute.PATCH(apiRequest("/api/users/me", { method: "PATCH", body, cookie }));
const changePassword = (body, cookie) =>
  mePasswordRoute.POST(apiRequest("/api/users/me/password", { method: "POST", body, cookie }));

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const row = (/** @type {string} */ id) => prisma.user.findUniqueOrThrow({ where: { id } });
const loginStatus = async (/** @type {string} */ email, /** @type {string} */ password) =>
  (await signIn({ email, password })).response.status;

describe("POST /api/users: só o administrador cria contas (CT06)", () => {
  it("cria a conta com senha provisória de 16 caracteres, exibida uma única vez, e a troca obrigatória (RN21)", async () => {
    const response = await create({ email: "Carla@Exemplo.test", name: "Carla", handle: "carla" });
    const { data } = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/api/users/${data.id}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data).toMatchObject({
      email: "carla@exemplo.test",
      name: "Carla",
      handle: "carla",
      role: "user",
      mustChangePassword: true,
      suspended: false,
    });
    expect(data.temporaryPassword).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(data.temporaryPassword).not.toMatch(/[0OIl1]/);
    expect(await loginStatus("carla@exemplo.test", data.temporaryPassword)).toBe(200);
  });

  it("a resposta nunca traz a senha em hash, as contas nem as sessões", async () => {
    const { data } = await (await create({ email: "carla@exemplo.test", name: "Carla" })).json();
    expect(Object.keys(data).sort()).toEqual(
      ["avatarImageId", "banExpires", "banReason", "createdAt", "email", "handle", "id", "mustChangePassword", "name", "role", "suspended", "temporaryPassword", "updatedAt"].sort(),
    );
  });

  it("cada senha provisória gerada é diferente", async () => {
    const first = (await (await create({ email: "c1@exemplo.test", name: "C1" })).json()).data.temporaryPassword;
    const second = (await (await create({ email: "c2@exemplo.test", name: "C2" })).json()).data.temporaryPassword;
    expect(first).not.toBe(second);
  });

  it("com a senha informada pelo administrador, não a devolve (temporaryPassword nulo) e ainda exige a troca", async () => {
    const response = await create({ email: "carla@exemplo.test", name: "Carla", password: "senha-do-admin-77" });
    const { data } = await response.json();

    expect(response.status).toBe(201);
    expect(data.temporaryPassword).toBeNull();
    expect(data.mustChangePassword).toBe(true);
    expect(await loginStatus("carla@exemplo.test", "senha-do-admin-77")).toBe(200);
  });

  it("a senha guardada é só o hash e a provisória não aparece em nenhum log", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "debug")];
    const { data } = await (await create({ email: "carla@exemplo.test", name: "Carla" })).json();

    const account = await prisma.account.findFirstOrThrow({ where: { userId: data.id } });
    expect(account.password).not.toContain(data.temporaryPassword);
    const printed = JSON.stringify([...logs, vi.mocked(console.error)].flatMap((spy) => spy.mock.calls));
    expect(printed).not.toContain(data.temporaryPassword);
  });

  it("papel admin é aceito; o padrão é user; papel desconhecido é 422", async () => {
    expect((await (await create({ email: "a2@exemplo.test", name: "A2", role: "admin" })).json()).data.role).toBe("admin");
    expect((await (await create({ email: "u2@exemplo.test", name: "U2" })).json()).data.role).toBe("user");
    expect((await create({ email: "x@exemplo.test", name: "X", role: "root" })).status).toBe(422);
  });

  it("campos que o cliente não define (banned, mustChangePassword, emailVerified) são descartados", async () => {
    const response = await create({ email: "carla@exemplo.test", name: "Carla", banned: true, mustChangePassword: false, emailVerified: true });
    const { data } = await response.json();

    expect(data).toMatchObject({ suspended: false, mustChangePassword: true });
    expect(await row(data.id)).toMatchObject({ banned: false, mustChangePassword: true, emailVerified: false });
  });

  it("e-mail repetido responde 409 USER_CONFLICT no campo email, e nada é criado", async () => {
    const response = await create({ email: "ANA@exemplo.test", name: "Outra Ana" });

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "USER_CONFLICT", details: [{ field: "email" }] });
    expect(await prisma.user.count()).toBe(3);
  });

  it("handle repetido responde 409 USER_CONFLICT no campo handle, inclusive o de uma conta suspensa", async () => {
    expect(await errorOf(await create({ email: "x@exemplo.test", name: "X", handle: "ana" }))).toMatchObject({
      code: "USER_CONFLICT",
      details: [{ field: "handle" }],
    });

    await prisma.user.update({ where: { id: beto.id }, data: { banned: true, banReason: "x" } });
    expect(await errorOf(await create({ email: "y@exemplo.test", name: "Y", handle: "beto" }))).toMatchObject({
      code: "USER_CONFLICT",
      details: [{ field: "handle" }],
    });
    expect(await prisma.user.count()).toBe(3);
  });

  it("a pré-verificação do handle recusa ANTES de tentar criar (inclusive o de conta suspensa)", async () => {
    const createUser = vi.spyOn(auth.api, "createUser");
    await prisma.user.update({ where: { id: beto.id }, data: { banned: true, banReason: "x" } });

    expect((await create({ email: "y@exemplo.test", name: "Y", handle: "beto" })).status).toBe(409);
    expect((await create({ email: "z@exemplo.test", name: "Z", handle: "ana" })).status).toBe(409);

    expect(createUser).not.toHaveBeenCalled();
    createUser.mockRestore();
  });

  it("uma corrida: o handle livre na pré-verificação e tomado na criação ainda responde 409 USER_CONFLICT", async () => {
    // A pré-verificação não vê o handle (simulada com um spy que cria a conta concorrente no meio)
    const real = auth.api.createUser.bind(auth.api);
    const createUser = vi.spyOn(auth.api, "createUser").mockImplementationOnce(async (...args) => {
      await createTestUser({ email: "concorrente@exemplo.test", handle: "corrida" });
      return real(...args);
    });

    const response = await create({ email: "novo@exemplo.test", name: "Novo", handle: "corrida" });

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "USER_CONFLICT", details: [{ field: "handle" }] });
    expect(await prisma.user.findUnique({ where: { email: "novo@exemplo.test" } })).toBeNull();
    createUser.mockRestore();
  });

  it("handle reservado, inválido ou normalizável: 422 ou normalizado", async () => {
    for (const handle of ["admin", "api", "login", "logout", "ab", "com espaço"]) {
      const response = await create({ email: `${handle.replace(/\W/g, "")}@exemplo.test`, name: "X", handle });
      expect(response.status, handle).toBe(422);
      expect((await errorOf(response)).details.map((/** @type {any} */ d) => d.field), handle).toEqual(["handle"]);
    }
    const normalized = await (await create({ email: "n@exemplo.test", name: "N", handle: "  NOVA-Conta " })).json();
    expect(normalized.data.handle).toBe("nova-conta");
  });

  it("e-mail inválido, nome em branco e senha curta: 422 com um item por campo", async () => {
    const response = await create({ email: "sem-arroba", name: " ", password: "curta" });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).details.map((/** @type {any} */ d) => d.field).sort()).toEqual(["email", "name", "password"]);
  });

  it("usuário comum recebe 403 FORBIDDEN, anônimo recebe 401 e nada é criado", async () => {
    const forbidden = await create({ email: "x@exemplo.test", name: "X" }, ana.cookie);
    expect(forbidden.status).toBe(403);
    expect((await errorOf(forbidden)).code).toBe("FORBIDDEN");

    const anonymous = await usersRoute.POST(apiRequest("/api/users", { method: "POST", body: { email: "x@exemplo.test", name: "X" } }));
    expect(anonymous.status).toBe(401);
    expect(await prisma.user.count()).toBe(3);
  });

  it("origem de outro site com o cookie do administrador responde 401 e nada é criado", async () => {
    const response = await create({ email: "x@exemplo.test", name: "X" }, admin.cookie, { origin: "https://malicioso.test" });
    expect(response.status).toBe(401);
    expect(await prisma.user.count()).toBe(3);
  });

  it("o corpo só é lido depois da autorização: usuário comum com corpo gigante recebe 403, não 413", async () => {
    const huge = JSON.stringify({ email: "x@exemplo.test", name: "X".repeat(200_000) });
    const response = await usersRoute.POST(
      apiRequest("/api/users", { method: "POST", body: huge, cookie: ana.cookie, headers: { "content-length": String(huge.length) } }),
    );
    expect(response.status).toBe(403);
  });

  it("corpo acima de 64 KiB responde 413 PAYLOAD_TOO_LARGE para o administrador", async () => {
    const response = await create(JSON.stringify({ email: "x@exemplo.test", name: "X".repeat(70_000) }));
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("limite de 20 escritas por minuto em usuários: a seguinte responde 429 com Retry-After", async () => {
    expect(RATE_LIMITS.users).toBe(20);
    for (let i = 0; i < RATE_LIMITS.users; i++) {
      expect((await create({ email: `m${i}@exemplo.test`, name: `M${i}` })).status).toBe(201);
    }
    const limited = await create({ email: "excedente@exemplo.test", name: "E" });

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    expect(await prisma.user.findUnique({ where: { email: "excedente@exemplo.test" } })).toBeNull();
  });
});

describe("senha provisória bloqueia tudo, menos a troca e o perfil (CT40; RN21)", () => {
  /** @type {Awaited<ReturnType<typeof createUserSession>>} */
  let carla;

  beforeEach(async () => {
    carla = await createUserSession({ email: "carla@exemplo.test", mustChangePassword: true, handle: "carla" });
  });

  it("lê o próprio perfil e sabe que a troca é obrigatória", async () => {
    const response = await me(carla.cookie);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ email: "carla@exemplo.test", mustChangePassword: true });
  });

  it("qualquer outra rota responde 403 PASSWORD_CHANGE_REQUIRED, antes do recurso e do corpo", async () => {
    const blocked = [
      await updateMe({ name: "Nova" }, carla.cookie),
      await list(carla.cookie),
      await create("corpo que nem é JSON", carla.cookie),
      await patch(beto.id, { name: "x" }, carla.cookie),
      await ban(beto.id, { reason: "x" }, carla.cookie),
      await resetPassword(beto.id, {}, carla.cookie),
      await remove(beto.id, "", carla.cookie),
      await remove("nao-existe", "", carla.cookie),
    ];
    for (const response of blocked) {
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
    }
    // ler o próprio registro é leitura de perfil (users:read), que a senha provisória permite
    expect((await detail(carla.id, carla.cookie)).status).toBe(200);
  });

  it("a troca recusa a senha igual à atual, revoga as outras sessões e libera as demais rotas", async () => {
    const second = await signIn({ email: carla.email, password: carla.password });
    expect(await prisma.session.count({ where: { userId: carla.id } })).toBe(2);

    const same = await changePassword({ current: carla.password, next: carla.password }, carla.cookie);
    expect(same.status).toBe(422);
    expect((await errorOf(same)).details).toEqual([{ field: "next", message: "A nova senha deve ser diferente da atual." }]);
    expect((await row(carla.id)).mustChangePassword).toBe(true);

    const changed = await changePassword({ current: carla.password, next: "senha-nova-definitiva-9" }, carla.cookie);
    expect(changed.status).toBe(200);
    expect((await changed.json()).data).toEqual({ changed: true });
    expect((await row(carla.id)).mustChangePassword).toBe(false);

    // a outra sessão foi revogada
    expect(await getSession(new Headers({ cookie: second.cookie }))).toBeNull();
    expect(await loginStatus(carla.email, carla.password)).toBe(401);
    const fresh = await signIn({ email: carla.email, password: "senha-nova-definitiva-9" });
    expect(fresh.response.status).toBe(200);

    // as demais rotas estão liberadas
    expect((await updateMe({ name: "Carla Nova" }, fresh.cookie)).status).toBe(200);
  });

  it("a senha atual errada responde 422 no campo current e mantém a troca obrigatória", async () => {
    const response = await changePassword({ current: "senha-errada-000", next: "senha-nova-definitiva-9" }, carla.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details).toEqual([{ field: "current", message: "A senha atual está incorreta." }]);
    expect((await row(carla.id)).mustChangePassword).toBe(true);
    expect(await loginStatus(carla.email, carla.password)).toBe(200);
  });

  it("a nova senha fora dos limites responde 422 e não muda nada", async () => {
    const response = await changePassword({ current: carla.password, next: "curta" }, carla.cookie);
    expect(response.status).toBe(422);
    expect((await row(carla.id)).mustChangePassword).toBe(true);
  });

  it("limite de 5 trocas de senha por minuto: a sexta responde 429", async () => {
    expect(RATE_LIMITS.password).toBe(5);
    for (let i = 0; i < RATE_LIMITS.password; i++) {
      expect((await changePassword({ current: "errada-errada-1", next: "senha-nova-definitiva-9" }, carla.cookie)).status).toBe(422);
    }
    expect((await changePassword({ current: carla.password, next: "senha-nova-definitiva-9" }, carla.cookie)).status).toBe(429);
    expect((await row(carla.id)).mustChangePassword).toBe(true);
  });

  it("administrador com senha provisória também é bloqueado, e o marcador não vem do cliente", async () => {
    const root = await createUserSession({ email: "root@exemplo.test", role: "admin", mustChangePassword: true });
    const response = await usersRoute.GET(apiRequest("/api/users", { cookie: root.cookie }));

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("GET /api/users e /api/users/:id", () => {
  it("o administrador lista todos, do mais antigo ao mais novo, com o total", async () => {
    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.map((/** @type {any} */ u) => u.email)).toEqual(["admin@exemplo.test", "ana@exemplo.test", "beto@exemplo.test"]);
    expect(body).toMatchObject({ total: 3, limit: 50, offset: 0 });
    expect(body.data[0]).toMatchObject({ role: "admin", suspended: false });
  });

  it("pagina com limit e offset e busca por parte do e-mail", async () => {
    const page = await (await list(admin.cookie, "?limit=1&offset=1")).json();
    expect(page.data.map((/** @type {any} */ u) => u.email)).toEqual(["ana@exemplo.test"]);
    expect(page.total).toBe(3);

    const found = await (await list(admin.cookie, "?search=bet")).json();
    expect(found.data.map((/** @type {any} */ u) => u.email)).toEqual(["beto@exemplo.test"]);
    expect(found.total).toBe(1);
  });

  it("parâmetros inválidos respondem 422", async () => {
    expect((await list(admin.cookie, "?limit=0")).status).toBe(422);
    expect((await list(admin.cookie, "?limit=500")).status).toBe(422);
    expect((await list(admin.cookie, "?offset=-1")).status).toBe(422);
  });

  it("usuário comum recebe 403 e anônimo, 401", async () => {
    expect((await list(ana.cookie)).status).toBe(403);
    expect((await usersRoute.GET(apiRequest("/api/users"))).status).toBe(401);
  });

  it("detalhe: o administrador vê qualquer conta; inexistente responde 404", async () => {
    const response = await detail(ana.id);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: ana.id, email: "ana@exemplo.test", handle: "ana" });

    const missing = await detail("nao-existe");
    expect(missing.status).toBe(404);
    expect((await errorOf(missing)).code).toBe("NOT_FOUND");
  });

  it("detalhe: o usuário comum vê só o próprio registro e recebe 403 no de outro, existente ou não (sem enumerar)", async () => {
    expect((await detail(ana.id, ana.cookie)).status).toBe(200);
    expect((await detail(beto.id, ana.cookie)).status).toBe(403);
    expect((await detail("nao-existe", ana.cookie)).status).toBe(403);
  });
});

describe("GET/PATCH /api/users/me", () => {
  it("GET devolve o perfil do usuário da sessão, com o papel", async () => {
    expect((await (await me(ana.cookie)).json()).data).toMatchObject({ id: ana.id, role: "user", handle: "ana" });
    expect((await (await me(admin.cookie)).json()).data).toMatchObject({ id: admin.userId, role: "admin" });
  });

  it("GET sem sessão responde 401", async () => {
    expect((await meRoute.GET(apiRequest("/api/users/me"))).status).toBe(401);
  });

  it("PATCH edita só o nome; papel, handle e e-mail enviados são descartados", async () => {
    const response = await updateMe({ name: "Ana Maria", role: "admin", handle: "outro", email: "x@exemplo.test" }, ana.cookie);

    expect(response.status).toBe(200);
    expect(await row(ana.id)).toMatchObject({ name: "Ana Maria", role: "user", handle: "ana", email: "ana@exemplo.test" });
  });

  it("PATCH com nome em branco ou sem nome responde 422", async () => {
    expect((await updateMe({ name: "  " }, ana.cookie)).status).toBe(422);
    expect((await updateMe({}, ana.cookie)).status).toBe(422);
  });
});

describe("PATCH /api/users/:id: nome, handle e papel (RN20, RN22)", () => {
  it("o administrador edita nome, handle e papel de outra conta", async () => {
    const response = await patch(ana.id, { name: "Ana Souza", handle: "Ana-Souza", role: "admin" });

    expect(response.status).toBe(200);
    expect(await row(ana.id)).toMatchObject({ name: "Ana Souza", handle: "ana-souza", role: "admin" });
  });

  it("handle repetido: 409 USER_CONFLICT; reservado: 422; nulo remove o handle", async () => {
    expect(await errorOf(await patch(ana.id, { handle: "beto" }))).toMatchObject({ code: "USER_CONFLICT", details: [{ field: "handle" }] });
    expect((await patch(ana.id, { handle: "admin" })).status).toBe(422);
    expect((await patch(ana.id, { handle: null })).status).toBe(200);
    expect((await row(ana.id)).handle).toBeNull();
  });

  it("usuário comum não edita nem a si mesmo por esta rota: 403, e o papel não muda", async () => {
    const response = await patch(ana.id, { role: "admin" }, ana.cookie);

    expect(response.status).toBe(403);
    expect((await row(ana.id)).role).toBe("user");
  });

  it("corpo sem campo conhecido, ou só com e-mail ou suspensão, responde 422", async () => {
    expect((await patch(ana.id, {})).status).toBe(422);
    expect((await patch(ana.id, { email: "x@exemplo.test" })).status).toBe(422);
    expect((await patch(ana.id, { banned: true })).status).toBe(422);
    expect(await row(ana.id)).toMatchObject({ banned: false, email: "ana@exemplo.test" });
  });

  it("CT42: o último administrador ativo não é rebaixado (409 LAST_ADMIN), mas é com outro ativo", async () => {
    const alone = await patch(admin.userId, { role: "user" });
    expect(alone.status).toBe(409);
    expect((await errorOf(alone)).code).toBe("LAST_ADMIN");
    expect((await row(admin.userId)).role).toBe("admin");

    await patch(ana.id, { role: "admin" });
    expect((await patch(admin.userId, { role: "user" })).status).toBe(200);
    expect((await row(admin.userId)).role).toBe("user");
  });

  it("conta inexistente responde 404", async () => {
    expect((await patch("nao-existe", { name: "X" })).status).toBe(404);
  });
});

describe("PUT /api/users/:id/password: redefinição pelo administrador (RN21)", () => {
  it("gera a provisória, revoga todas as sessões, liga a troca obrigatória e notifica o usuário", async () => {
    const response = await resetPassword(ana.id);
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(ana.id);
    expect(data.temporaryPassword).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(await getSession(new Headers({ cookie: ana.cookie }))).toBeNull();
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
    expect(await loginStatus(ana.email, ana.password)).toBe(401);
    expect(await loginStatus(ana.email, data.temporaryPassword)).toBe(200);
    expect((await row(ana.id)).mustChangePassword).toBe(true);

    const notifications = await prisma.notification.findMany({ where: { userId: ana.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "ACCOUNT" });
    expect(JSON.parse(notifications[0].data)).toEqual({ event: "PASSWORD_RESET" });
  });

  it("com a senha informada, não a devolve", async () => {
    const response = await resetPassword(ana.id, { password: "outra-provisoria-55" });

    expect((await response.json()).data.temporaryPassword).toBeNull();
    expect(await loginStatus(ana.email, "outra-provisoria-55")).toBe(200);
  });

  it("senha informada fora dos limites responde 422 e não muda nada", async () => {
    expect((await resetPassword(ana.id, { password: "curta" })).status).toBe(422);
    expect(await loginStatus(ana.email, ana.password)).toBe(200);
    expect((await row(ana.id)).mustChangePassword).toBe(false);
  });

  it("usuário comum recebe 403 (também sobre si mesmo), anônimo 401, inexistente 404", async () => {
    expect((await resetPassword(beto.id, {}, ana.cookie)).status).toBe(403);
    expect((await resetPassword(ana.id, {}, ana.cookie)).status).toBe(403);
    expect((await passwordResetRoute.PUT(apiRequest(`/api/users/${ana.id}/password`, { method: "PUT", body: {} }), routeContext({ id: ana.id }))).status).toBe(401);
    expect((await resetPassword("nao-existe")).status).toBe(404);
    expect(await loginStatus(ana.email, ana.password)).toBe(200);
  });

  it("limite de 5 redefinições por minuto", async () => {
    for (let i = 0; i < RATE_LIMITS.password; i++) expect((await resetPassword(ana.id)).status).toBe(200);
    expect((await resetPassword(ana.id)).status).toBe(429);
  });
});

describe("POST/DELETE /api/users/:id/ban: suspensão (CT41; RN23)", () => {
  it("suspende: revoga as sessões, grava o motivo e o prazo e notifica; o login diz o motivo", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const response = await ban(ana.id, { reason: "Spam repetido", expiresAt });
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ id: ana.id, suspended: true, banReason: "Spam repetido" });
    // o prazo é gravado no banco (e não só ecoado na resposta e na notificação)
    expect((await row(ana.id)).banExpires?.toISOString()).toBe(expiresAt);
    expect(new Date(data.banExpires).toISOString()).toBe(expiresAt);
    expect(await getSession(new Headers({ cookie: ana.cookie }))).toBeNull();
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);

    const login = await signIn({ email: ana.email, password: ana.password });
    expect(login.response.status).toBe(403);
    expect(await login.response.json()).toMatchObject({
      code: "BANNED_USER",
      message: expect.stringMatching(/Motivo: Spam repetido.*A suspensão vai até /),
    });

    const [notification] = await prisma.notification.findMany({ where: { userId: ana.id } });
    expect(notification).toMatchObject({ type: "MODERATION" });
    expect(JSON.parse(notification.data)).toEqual({ event: "ACCOUNT_SUSPENDED", reason: "Spam repetido", expiresAt });
  });

  it("o conteúdo da conta suspensa é preservado", async () => {
    await createContent({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana.id });
    await ban(ana.id, { reason: "x" });
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(1);
  });

  it("o prazo vencido reativa a conta sozinha, sem ação do administrador", async () => {
    await ban(ana.id, { reason: "x", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    await prisma.user.update({ where: { id: ana.id }, data: { banExpires: new Date(Date.now() - 1000) } });

    expect(await loginStatus(ana.email, ana.password)).toBe(200);
    expect(await row(ana.id)).toMatchObject({ banned: false, banReason: null, banExpires: null });
  });

  it("sem prazo, a suspensão não vence", async () => {
    await ban(ana.id, { reason: "x" });
    expect(await loginStatus(ana.email, ana.password)).toBe(403);
  });

  it("o motivo é obrigatório; o prazo, se houver, está no futuro", async () => {
    expect((await ban(ana.id, {})).status).toBe(422);
    expect((await ban(ana.id, { reason: "  " })).status).toBe(422);
    expect((await ban(ana.id, { reason: "x", expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(422);
    expect((await row(ana.id)).banned).toBe(false);
  });

  it("ninguém suspende a si mesmo: 403 FORBIDDEN (R-009)", async () => {
    const response = await ban(admin.userId, { reason: "x" });

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
    expect((await row(admin.userId)).banned).toBe(false);
  });

  it("ninguém suspende a si mesmo, nem havendo outro administrador ativo: 403 e a sessão continua", async () => {
    const second = await createUserSession({ email: "admin2@exemplo.test", role: "admin" });

    const response = await ban(second.id, { reason: "x" }, second.cookie);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
    expect((await row(second.id)).banned).toBe(false);
    expect(await getSession(new Headers({ cookie: second.cookie }))).not.toBeNull();
  });

  it("um administrador suspende o outro quando há mais de um ativo", async () => {
    const second = await createUserSession({ email: "admin2@exemplo.test", role: "admin" });
    expect((await ban(second.id, { reason: "x" })).status).toBe(200);
    expect(await getSession(new Headers({ cookie: second.cookie }))).toBeNull();
    // o primeiro continua sendo o único ativo: o segundo não consegue mais agir, e ninguém o suspende
    expect((await getSession(new Headers({ cookie: admin.cookie })))?.user.id).toBe(admin.userId);
  });

  it("a suspensão vigente tira o acesso mesmo com a sessão ainda no banco (sem cookieCache)", async () => {
    await prisma.user.update({ where: { id: beto.id }, data: { banned: true, banReason: "x" } });
    expect(await prisma.session.count({ where: { userId: beto.id } })).toBe(1);
    expect((await me(beto.cookie)).status).toBe(401);
    expect((await list(beto.cookie)).status).toBe(401);
  });

  it("reativa: limpa a suspensão, permite entrar de novo e notifica", async () => {
    await ban(ana.id, { reason: "x" });
    const response = await unban(ana.id);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ suspended: false, banReason: null, banExpires: null });
    expect(await loginStatus(ana.email, ana.password)).toBe(200);
    const events = (await prisma.notification.findMany({ where: { userId: ana.id }, orderBy: { createdAt: "asc" } })).map((n) => JSON.parse(n.data).event);
    expect(events).toEqual(["ACCOUNT_SUSPENDED", "ACCOUNT_REACTIVATED"]);
  });

  it("usuário comum recebe 403, anônimo 401, inexistente 404; nada muda", async () => {
    expect((await ban(beto.id, { reason: "x" }, ana.cookie)).status).toBe(403);
    expect((await unban(beto.id, ana.cookie)).status).toBe(403);
    expect((await banRoute.POST(apiRequest(`/api/users/${beto.id}/ban`, { method: "POST", body: { reason: "x" } }), routeContext({ id: beto.id }))).status).toBe(401);
    expect((await ban("nao-existe", { reason: "x" })).status).toBe(404);
    expect((await row(beto.id)).banned).toBe(false);
  });
});

describe("DELETE /api/users/:id: exclusão atômica (CT42; RN24)", () => {
  it("sem conteúdo, exclui a conta e responde 200 com { id, content, roots, renamed } (R-009)", async () => {
    const response = await remove(ana.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: ana.id, content: "none", roots: 0, renamed: [] } });
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: ana.id } })).toBe(0);
  });

  it("com conteúdo e sem a escolha: 409 USER_HAS_CONTENT, e NADA muda (sessões e credencial intactas)", async () => {
    await createContent({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana.id });

    const response = await remove(ana.id);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("USER_HAS_CONTENT");
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(1);
    expect(await prisma.account.count({ where: { userId: ana.id } })).toBe(1);
    expect(await loginStatus(ana.email, ana.password)).toBe(200);
  });

  it("transfere o conteúdo ao destino e exclui a conta", async () => {
    const root = await createContent({ title: "Raiz", slug: "raiz", type: "COLLECTION", authorId: ana.id });
    await createContent({ title: "Filho", slug: "filho", type: "DOCUMENT", authorId: ana.id, parentId: root.id });

    const response = await remove(ana.id, `?content=transfer&to=${beto.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: ana.id, content: "transferred", roots: 1, renamed: [] } });
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).toBeNull();
    expect(await prisma.content.count({ where: { authorId: beto.id } })).toBe(2);
  });

  it("conflito de slug na raiz do destino recusa tudo; com onConflict=rename, renomeia", async () => {
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: ana.id });
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: beto.id });

    const refused = await remove(ana.id, `?content=transfer&to=${beto.id}`);
    expect(refused.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).not.toBeNull();
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(1);

    const renamed = await remove(ana.id, `?content=transfer&to=${beto.id}&onConflict=rename`);
    expect(renamed.status).toBe(200);
    // O administrador vê a raiz renomeada na própria resposta.
    expect((await renamed.json()).data).toMatchObject({
      content: "transferred",
      roots: 1,
      renamed: [expect.objectContaining({ from: "sobre", to: "sobre-2" })],
    });
    expect(await prisma.content.count({ where: { authorId: beto.id } })).toBe(2);
    expect((await prisma.content.findMany({ where: { authorId: beto.id }, select: { slug: true } })).map((c) => c.slug).sort()).toEqual(["sobre", "sobre-2"]);
  });

  it("exclui o conteúdo junto, em cascata", async () => {
    const root = await createContent({ title: "Raiz", slug: "raiz", type: "COLLECTION", authorId: ana.id });
    await createContent({ title: "Filho", slug: "filho", type: "DOCUMENT", authorId: ana.id, parentId: root.id });

    const response = await remove(ana.id, "?content=delete");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: ana.id, content: "deleted", roots: 1, renamed: [] });
    expect(await prisma.content.count()).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).toBeNull();
  });

  it("destino inexistente: 404; destino igual ao excluído: 422; transferir sem destino: 422", async () => {
    await createContent({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana.id });

    expect((await remove(ana.id, "?content=transfer&to=nao-existe")).status).toBe(404);
    expect((await remove(ana.id, `?content=transfer&to=${ana.id}`)).status).toBe(422);
    expect((await remove(ana.id, "?content=transfer")).status).toBe(422);
    expect((await remove(ana.id, "?content=mover")).status).toBe(422);
    expect(await prisma.user.findUnique({ where: { id: ana.id } })).not.toBeNull();
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(1);
  });

  it("ninguém exclui a si mesmo: 403 FORBIDDEN, e a conta continua (R-009)", async () => {
    const response = await remove(admin.userId);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
    expect(await prisma.user.findUnique({ where: { id: admin.userId } })).not.toBeNull();
  });

  it("ninguém exclui a si mesmo, nem havendo outro administrador ativo: 403 e a conta continua", async () => {
    const second = await createUserSession({ email: "admin2@exemplo.test", role: "admin" });

    const response = await remove(second.id, "", second.cookie);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
    expect(await prisma.user.findUnique({ where: { id: second.id } })).not.toBeNull();
  });

  it("um administrador exclui o outro quando há mais de um ativo", async () => {
    const second = await createTestUser({ email: "admin2@exemplo.test", role: "admin" });
    const response = await remove(second.id);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: second.id, content: "none" });
  });

  it("usuário comum recebe 403, anônimo 401, inexistente 404; nada é excluído", async () => {
    expect((await remove(beto.id, "", ana.cookie)).status).toBe(403);
    expect((await userRoute.DELETE(apiRequest(`/api/users/${beto.id}`, { method: "DELETE" }), routeContext({ id: beto.id }))).status).toBe(401);
    expect((await remove("nao-existe")).status).toBe(404);
    expect(await prisma.user.count()).toBe(3);
  });

  it("origem de outro site responde 401 e não exclui", async () => {
    const response = await userRoute.DELETE(
      apiRequest(`/api/users/${beto.id}`, { method: "DELETE", cookie: admin.cookie, headers: { origin: "https://malicioso.test" } }),
      routeContext({ id: beto.id }),
    );
    expect(response.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: beto.id } })).not.toBeNull();
  });
});
