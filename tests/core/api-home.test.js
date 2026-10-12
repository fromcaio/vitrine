// A página inicial editável na API (P-033; M26, ADR-040; RF42, RF43, RN35, RN36, RN37; CT72, CT74, CT75):
// `GET` e `PUT /api/home` (o dono, de qualquer papel), `homeStatus` em `PUT /api/configuration` (o sistema) e a
// moderação em `/api/users/:id/home` (`PATCH` despublica, `DELETE` apaga o texto; motivo, notificação na mesma
// transação, 403 sobre a própria página, 404, 405). better-auth real sobre o banco temporário; o worker de
// renderização é o REAL, salvo no teste do 503; `revalidatePath` é substituído.
import "./env";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/render-budget", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkRenderable: vi.fn(actual.checkRenderable) };
});

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import * as homeRoute from "@/app/api/home/route";
import * as moderationRoute from "@/app/api/users/[id]/home/route";
import { getConfiguration, getHome, listNotifications, prisma, updateHome } from "@/lib/db";
import { RenderBusyError, checkRenderable, shutdownRenderWorker } from "@/lib/render-budget";
import { HOSTILE_64K } from "./fixtures/documents.js";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  delete process.env.MAX_BODY_BYTES;
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  await prisma.user.update({ where: { id: admin.userId }, data: { handle: "ada" } });
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

afterAll(async () => {
  await shutdownRenderWorker();
});

const get = (cookie) => homeRoute.GET(apiRequest("/api/home", { cookie }));
const put = (body, cookie = ana.cookie, headers = {}) =>
  homeRoute.PUT(apiRequest("/api/home", { method: "PUT", body, cookie, headers }));
const putConfiguration = (body, cookie = admin.cookie) =>
  configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie }));
const unpublish = (id, body, cookie = admin.cookie, headers = {}) =>
  moderationRoute.PATCH(apiRequest(`/api/users/${id}/home`, { method: "PATCH", body, cookie, headers }), routeContext({ id }));
const remove = (id, query = "", cookie = admin.cookie, headers = {}) =>
  moderationRoute.DELETE(apiRequest(`/api/users/${id}/home${query}`, { method: "DELETE", cookie, headers }), routeContext({ id }));

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const calls = () => vi.mocked(revalidatePath).mock.calls.map((call) => call[0]);
const noticesOf = (/** @type {string} */ userId) => listNotifications(userId, { take: 50 });
/** A página inicial de um usuário já com texto (direto pela camada de dados). */
const seedHome = (/** @type {string} */ ownerId, extra = {}) => updateHome(ownerId, { homeBody: "# Olá\n\nTexto da Ana.", ...extra });

describe("GET /api/home", () => {
  it("o padrão de quem nunca escreveu: sem texto, publicado, com a lista", async () => {
    const response = await get(ana.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { homeBody: null, homeStatus: "PUBLISHED", homeShowItems: true } });
  });

  it("devolve os três campos do PRÓPRIO usuário, nunca os de outro", async () => {
    await seedHome(ana.id, { homeStatus: "DRAFT", homeShowItems: false });
    await updateHome(beto.id, { homeBody: "do Beto" });

    expect((await (await get(ana.cookie)).json()).data).toEqual({ homeBody: "# Olá\n\nTexto da Ana.", homeStatus: "DRAFT", homeShowItems: false });
    expect((await (await get(beto.cookie)).json()).data.homeBody).toBe("do Beto");
  });

  it("sem sessão, 401; com a senha provisória, 403 PASSWORD_CHANGE_REQUIRED", async () => {
    expect((await get(undefined)).status).toBe(401);
    const carla = await createUserSession({ email: "carla@exemplo.test", mustChangePassword: true });
    const response = await get(carla.cookie);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("PUT /api/home (CT72)", () => {
  it("grava os três campos, devolve o estado novo e revalida SÓ a página do espaço do dono (CT74)", async () => {
    const response = await put({ homeBody: "# Bem-vindo\n\nTexto.", homeStatus: "DRAFT", homeShowItems: false });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ homeBody: "# Bem-vindo\n\nTexto.", homeStatus: "DRAFT", homeShowItems: false });
    expect(await getHome(ana.id)).toEqual({ homeBody: "# Bem-vindo\n\nTexto.", homeStatus: "DRAFT", homeShowItems: false });
    expect(calls()).toEqual(["/ana"]);
  });

  it("é parcial: um campo por vez, sem mexer nos outros; o último envio vale (sem version)", async () => {
    await put({ homeBody: "primeiro" });
    await put({ homeShowItems: false });
    await put({ homeStatus: "DRAFT" });
    await put({ homeBody: "segundo" });

    expect(await getHome(ana.id)).toEqual({ homeBody: "segundo", homeStatus: "DRAFT", homeShowItems: false });
  });

  it("o texto vazio ou só de espaços apaga o texto (null)", async () => {
    await seedHome(ana.id);

    expect((await (await put({ homeBody: "  \n " })).json()).data.homeBody).toBeNull();
    expect((await getHome(ana.id)).homeBody).toBeNull();
  });

  it("o administrador edita só a PRÓPRIA página: a rota não aceita identificador", async () => {
    await seedHome(ana.id);

    const response = await put({ homeBody: "da Ada" }, admin.cookie);

    expect(response.status).toBe(200);
    expect((await getHome(admin.userId)).homeBody).toBe("da Ada");
    expect((await getHome(ana.id)).homeBody).toBe("# Olá\n\nTexto da Ana.");
    expect(calls()).toEqual(["/ada"]);
  });

  it("sem handle não há URL: grava e não revalida nada", async () => {
    const sem = await createUserSession({ email: "sem@exemplo.test", name: "Sem Handle" });

    const response = await put({ homeBody: "texto" }, sem.cookie);

    expect(response.status).toBe(200);
    expect((await getHome(sem.id)).homeBody).toBe("texto");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sem campo, campo desconhecido (inclusive version) ou tipo errado: 422 VALIDATION_ERROR, nada gravado", async () => {
    const bodies = [
      {},
      { version: "2026-01-01T00:00:00.000Z", homeBody: "x" },
      { homeBody: "x", directoryEnabled: false },
      { homeStatus: "ARCHIVED" },
      { homeShowItems: "sim" },
      { homeBody: 42 },
    ];
    for (const body of bodies) {
      const response = await put(body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
    expect(await getHome(ana.id)).toEqual({ homeBody: null, homeStatus: "PUBLISHED", homeShowItems: true });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("JSON malformado: 400", async () => {
    expect((await put("{nao-e-json")).status).toBe(400);
  });

  it("acima do limite do corpo HTTP: 413 sem gravar; acima de MAX_BODY_BYTES: 422 QUOTA_EXCEEDED sem gravar; no limite, 200", async () => {
    vi.stubEnv("MAX_BODY_BYTES", "1000");
    try {
      const huge = await put({ homeBody: "a".repeat(2 * 1000 + 64 * 1024 + 10) });
      expect(huge.status).toBe(413);
      expect((await errorOf(huge)).code).toBe("PAYLOAD_TOO_LARGE");
      expect((await getHome(ana.id)).homeBody).toBeNull();

      const over = await put({ homeBody: "ã".repeat(600) }); // 1200 bytes UTF-8 em 600 caracteres
      expect(over.status).toBe(422);
      expect(await errorOf(over)).toMatchObject({ code: "QUOTA_EXCEEDED", details: [{ field: "body", bytes: 1200, max: 1000 }] });
      expect((await getHome(ana.id)).homeBody).toBeNull();

      const exact = await put({ homeBody: "a".repeat(1000) });
      expect(exact.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(calls()).toEqual(["/ana"]);
  });

  it("o texto que o pipeline não renderiza no orçamento: 422 CONTENT_TOO_COMPLEX com field homeBody, sem gravar nem revalidar", async () => {
    await seedHome(ana.id);

    const response = await put({ homeBody: HOSTILE_64K });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({ code: "CONTENT_TOO_COMPLEX", details: [{ field: "homeBody" }] });
    expect((await getHome(ana.id)).homeBody).toBe("# Olá\n\nTexto da Ana.");
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 30_000);

  it("a fila de validações cheia: 503 BUSY com Retry-After, sem gravar", async () => {
    vi.mocked(checkRenderable).mockImplementationOnce(async () => Promise.reject(new RenderBusyError()));
    const quiet = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const response = await put({ homeBody: "# texto" });

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3");
      expect((await errorOf(response)).code).toBe("BUSY");
    } finally {
      quiet.mockRestore();
    }
    expect((await getHome(ana.id)).homeBody).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o PUT sem o texto não passa pelo orçamento de renderização", async () => {
    vi.mocked(checkRenderable).mockClear();

    await put({ homeStatus: "DRAFT", homeShowItems: false });

    expect(checkRenderable).not.toHaveBeenCalled();
  });

  it("mutação de outra origem: 401, nada gravado; sem sessão, 401", async () => {
    const foreign = await put({ homeBody: "x" }, ana.cookie, { origin: "https://malicioso.test" });
    expect(foreign.status).toBe(401);
    expect((await put({ homeBody: "x" }, null)).status).toBe(401);
    expect((await getHome(ana.id)).homeBody).toBeNull();
  });

  it("a conta com a senha provisória é bloqueada (RN21)", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", handle: "carla", mustChangePassword: true });

    const response = await put({ homeBody: "x" }, carla.cookie);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await getHome(carla.id)).homeBody).toBeNull();
  });
});

describe("PUT /api/configuration: homeStatus do portal (RN36)", () => {
  it("o administrador grava e recebe homeStatus; o portal / é revalidado", async () => {
    const response = await putConfiguration({ homeStatus: "DRAFT" });

    expect(response.status).toBe(200);
    expect((await response.json()).data.homeStatus).toBe("DRAFT");
    expect((await getConfiguration()).homeStatus).toBe("DRAFT");
    expect(calls()).toContain("/");

    expect((await (await putConfiguration({ homeBody: "# Portal", homeStatus: "PUBLISHED" })).json()).data).toMatchObject({
      homeBody: "# Portal",
      homeStatus: "PUBLISHED",
    });
  });

  it("valor fora de PUBLISHED e DRAFT: 422; o usuário comum não grava na configuração: 403", async () => {
    expect((await putConfiguration({ homeStatus: "ARCHIVED" })).status).toBe(422);
    const response = await putConfiguration({ homeStatus: "DRAFT" }, ana.cookie);
    expect(response.status).toBe(403);
    expect((await getConfiguration()).homeStatus).toBe("PUBLISHED");
  });
});

describe("PATCH /api/users/:id/home: despublicar (CT75, RN37)", () => {
  it("passa o texto a rascunho, notifica o dono com o motivo (MODERATION, WARNING) e revalida só o espaço do DONO", async () => {
    await seedHome(ana.id, { homeShowItems: false });

    const response = await unpublish(ana.id, { status: "DRAFT", reason: "  Fora das regras  " });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ homeBody: "# Olá\n\nTexto da Ana.", homeStatus: "DRAFT", homeShowItems: false });
    expect(await getHome(ana.id)).toMatchObject({ homeBody: "# Olá\n\nTexto da Ana.", homeStatus: "DRAFT" });

    const [notice, ...others] = await noticesOf(ana.id);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({ type: "MODERATION", severity: "WARNING", data: { event: "HOME_UNPUBLISHED", reason: "Fora das regras" } });
    expect(await noticesOf(admin.userId)).toEqual([]);
    expect(await noticesOf(beto.id)).toEqual([]);
    expect(calls()).toEqual(["/ana"]);
  });

  it("sem o motivo (ausente, vazio ou longo demais): 422, nada muda, nenhuma notificação", async () => {
    await seedHome(ana.id);

    for (const body of [{ status: "DRAFT" }, { status: "DRAFT", reason: "   " }, { status: "DRAFT", reason: "x".repeat(501) }]) {
      const response = await unpublish(ana.id, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
    expect((await getHome(ana.id)).homeStatus).toBe("PUBLISHED");
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("só despublica: status PUBLISHED e campos a mais são recusados (o texto de outro nunca é reescrito)", async () => {
    await seedHome(ana.id);

    expect((await unpublish(ana.id, { status: "PUBLISHED", reason: "motivo" })).status).toBe(422);
    expect((await unpublish(ana.id, { status: "DRAFT", reason: "motivo", homeBody: "do admin" })).status).toBe(422);
    expect((await getHome(ana.id)).homeBody).toBe("# Olá\n\nTexto da Ana.");
  });

  it("403 sobre a PRÓPRIA página, mesmo para o administrador: nada muda, nenhuma notificação", async () => {
    await updateHome(admin.userId, { homeBody: "da Ada" });

    const response = await unpublish(admin.userId, { status: "DRAFT", reason: "motivo" });

    expect(response.status).toBe(403);
    expect((await getHome(admin.userId)).homeStatus).toBe("PUBLISHED");
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("404: usuário inexistente, página sem texto, página já em rascunho; nenhuma notificação", async () => {
    expect((await unpublish("nao-existe", { status: "DRAFT", reason: "motivo" })).status).toBe(404);
    expect((await unpublish(ana.id, { status: "DRAFT", reason: "motivo" })).status).toBe(404); // sem texto
    await seedHome(ana.id, { homeStatus: "DRAFT" });
    expect((await unpublish(ana.id, { status: "DRAFT", reason: "motivo" })).status).toBe(404); // já em rascunho

    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o usuário comum recebe 403 (também sobre a própria), sem sessão 401, de outra origem 401", async () => {
    await seedHome(ana.id);
    const body = { status: "DRAFT", reason: "m" };

    expect((await unpublish(ana.id, body, ana.cookie)).status).toBe(403);
    expect((await unpublish(ana.id, body, beto.cookie)).status).toBe(403);
    expect((await unpublish(ana.id, body, null)).status).toBe(401);
    expect((await unpublish(ana.id, body, admin.cookie, { origin: "https://malicioso.test" })).status).toBe(401);
    expect((await getHome(ana.id)).homeStatus).toBe("PUBLISHED");
  });

  it("espaço sem handle: a ação vale e nada é revalidado", async () => {
    const sem = await createUserSession({ email: "sem@exemplo.test", name: "Sem" });
    await updateHome(sem.id, { homeBody: "texto" });

    expect((await unpublish(sem.id, { status: "DRAFT", reason: "motivo" })).status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/:id/home: excluir o texto (CT75, RN37)", () => {
  it("apaga o texto (mantém estado e interruptor), responde 204, notifica o dono e revalida o espaço dele", async () => {
    await seedHome(ana.id, { homeStatus: "DRAFT", homeShowItems: false });

    const response = await remove(ana.id, "?reason=%20Spam%20");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(await getHome(ana.id)).toEqual({ homeBody: null, homeStatus: "DRAFT", homeShowItems: false });
    const [notice, ...others] = await noticesOf(ana.id);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({ type: "MODERATION", severity: "WARNING", data: { event: "HOME_REMOVED", reason: "Spam" } });
    expect(calls()).toEqual(["/ana"]);
  });

  it("sem o motivo: 422, o texto fica", async () => {
    await seedHome(ana.id);

    for (const query of ["", "?reason=", "?reason=%20%20", `?reason=${"x".repeat(501)}`]) {
      expect((await remove(ana.id, query)).status, query).toBe(422);
    }
    expect((await getHome(ana.id)).homeBody).toBe("# Olá\n\nTexto da Ana.");
    expect(await prisma.notification.count()).toBe(0);
  });

  it("403 sobre a própria página; 404 sem usuário ou sem texto; o usuário comum, 403", async () => {
    await updateHome(admin.userId, { homeBody: "da Ada" });
    expect((await remove(admin.userId, "?reason=motivo")).status).toBe(403);
    expect((await getHome(admin.userId)).homeBody).toBe("da Ada");

    expect((await remove("nao-existe", "?reason=motivo")).status).toBe(404);
    expect((await remove(ana.id, "?reason=motivo")).status).toBe(404); // sem texto

    await seedHome(ana.id);
    expect((await remove(ana.id, "?reason=motivo", ana.cookie)).status).toBe(403);
    expect((await remove(ana.id, "?reason=motivo", beto.cookie)).status).toBe(403);
    expect((await remove(ana.id, "?reason=motivo", null)).status).toBe(401);
    expect((await remove(ana.id, "?reason=motivo", admin.cookie, { origin: "https://malicioso.test" })).status).toBe(401);
    expect((await getHome(ana.id)).homeBody).toBe("# Olá\n\nTexto da Ana.");
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("a moderação e a notificação são UMA transação (CT75)", () => {
  /** Faz a gravação da notificação falhar DENTRO da transação (gatilho do SQLite), só enquanto o teste precisa. */
  const breakNotifications = () =>
    prisma.$executeRawUnsafe("CREATE TRIGGER falha_notificacao BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'notificacao falhou'); END");
  const fixNotifications = () => prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS falha_notificacao");

  it("se a notificação falha, despublicar e excluir se desfazem, e nada é revalidado", async () => {
    await seedHome(ana.id);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await breakNotifications();
    try {
      const first = await unpublish(ana.id, { status: "DRAFT", reason: "motivo" });
      const second = await remove(ana.id, "?reason=motivo");

      expect(first.status).toBeGreaterThanOrEqual(400);
      expect(second.status).toBeGreaterThanOrEqual(400);
    } finally {
      await fixNotifications();
      errorLog.mockRestore();
    }
    expect(await getHome(ana.id)).toEqual({ homeBody: "# Olá\n\nTexto da Ana.", homeStatus: "PUBLISHED", homeShowItems: true });
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("outros métodos: 405 (o texto de outro só sai do ar, nunca é reescrito)", () => {
  it("a moderação exporta só PATCH e DELETE, e /api/home só GET e PUT: o Next.js responde 405 ao resto", () => {
    expect(Object.keys(moderationRoute).sort()).toEqual(["DELETE", "PATCH"]);
    expect(Object.keys(homeRoute).sort()).toEqual(["GET", "PUT"]);
  });
});
