// Autorização por dono e contas sobre a aplicação de PRODUÇÃO (M16; CT04, CT06, CT37 a CT42): o que os
// testes de unidade não provam, porque dependem do servidor real do Next.js (o pacote do plugin
// `admin` empacotado, os cookies gravados pelo `nextCookies`, o Proxy e os cabeçalhos). Usa a API
// HTTP com um contexto de cookies por usuário: o administrador de teste (criado por
// `npm run admin:create`) e uma conta criada por ele, com dados FICTÍCIOS.
import { ADMIN, e2eEnvironment } from "./support/env.js";
import { expect, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();
const ANA = { email: "ana-e2e@exemplo.test", name: "Ana E2E", handle: "ana-e2e" };

// O limite de tentativas de login do better-auth é por IP (5 por minuto); cada login deste arquivo usa
// um IP próprio, para não competir com o teste de fumaça nem com o login anterior.
let ipCounter = 0;
const nextIp = () => `10.20.30.${++ipCounter}`;

/** Contexto de requisições com o próprio jar de cookies, já autenticado. */
async function login(playwright, credentials) {
  const context = await playwright.request.newContext({ baseURL });
  const response = await context.post("/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": nextIp() },
    data: { email: credentials.email, password: credentials.password },
  });
  return { context, response };
}

test.describe.serial("autorização por dono", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  let anaId = "";
  let anaPassword = "";

  test.beforeAll(async ({ playwright }) => {
    const session = await login(playwright, ADMIN);
    expect(session.response.status()).toBe(200);
    admin = session.context;
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
  });

  test("as rotas brutas do plugin admin respondem 404, mesmo com a sessão do administrador", async () => {
    for (const [method, path] of [
      ["GET", "/api/auth/admin/list-users"],
      ["POST", "/api/auth/admin/create-user"],
      ["POST", "/api/auth/admin/set-role"],
      ["POST", "/api/auth/update-user"],
      ["POST", "/api/auth/change-password"],
      ["GET", "/api/auth/list-sessions"],
    ]) {
      const response = await admin.fetch(path, { method, data: {} });
      expect(response.status(), `${method} ${path}`).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    }
    const session = await admin.get("/api/auth/get-session");
    expect(session.status()).toBe(200);
    expect((await session.json()).user).toMatchObject({ email: ADMIN.email, role: "admin" });
  });

  test("o cadastro público segue recusado", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { name: "Intruso", email: "intruso-e2e@exemplo.test", password: "senha-e2e-ficticia-123" },
    });
    expect(response.status()).toBe(404);
  });

  test("o administrador cria uma conta com senha provisória, que só consegue trocar a senha (CT06, CT40)", async ({ playwright }) => {
    const created = await admin.post("/api/users", { data: ANA });
    expect(created.status()).toBe(201);
    const { data } = await created.json();
    anaId = data.id;
    anaPassword = data.temporaryPassword;
    expect(anaPassword).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(data).toMatchObject({ email: ANA.email, role: "user", mustChangePassword: true });
    expect(created.headers()["cache-control"]).toBe("no-store");

    const session = await login(playwright, { email: ANA.email, password: anaPassword });
    expect(session.response.status()).toBe(200);
    ana = session.context;

    // Com a senha provisória, só o perfil e a troca da senha:
    const blocked = await ana.get("/api/contents");
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await ana.get("/api/users/me")).status()).toBe(200);

    const changed = await ana.post("/api/users/me/password", { data: { current: anaPassword, next: "senha-definitiva-e2e-9" } });
    expect(changed.status()).toBe(200);

    // O servidor real grava o novo cookie (nextCookies): a mesma conta segue autenticada, já liberada.
    const free = await ana.get("/api/contents");
    expect(free.status()).toBe(200);
    expect((await (await ana.get("/api/users/me")).json()).data.mustChangePassword).toBe(false);
  });

  test("cada dono só enxerga e altera o que é seu; o administrador lê e só escreve no alheio como moderação (CT04, CT39, CT51)", async () => {
    const created = await ana.post("/api/contents", { data: { title: "Da Ana", slug: "da-ana", type: "DOCUMENT", body: "texto", authorId: "outro" } });
    expect(created.status()).toBe(201);
    const content = (await created.json()).data;
    expect(content.authorId).toBe(anaId);

    // a árvore do administrador não traz o conteúdo da Ana, que ele só lê pelo identificador
    expect((await (await admin.get("/api/contents")).json()).data).toEqual([]);
    expect((await admin.get(`/api/contents/${content.id}`)).status()).toBe(200);
    // moderação (RN19, RN26): sem o motivo, 422; mover e reordenar o alheio, 403; o usuário comum, 403
    const edit = await admin.patch(`/api/contents/${content.id}`, { data: { title: "Invadido" } });
    expect(edit.status()).toBe(422);
    expect((await edit.json()).error.details[0].field).toBe("reason");
    expect((await admin.delete(`/api/contents/${content.id}`)).status()).toBe(422);
    expect((await admin.patch("/api/contents/reorder", { data: [{ id: content.id, order: 3 }] })).status()).toBe(403);
    const move = await admin.patch(`/api/contents/${content.id}`, { data: { order: 3, reason: "arrumando" } });
    expect(move.status()).toBe(403);
    expect((await move.json()).error.code).toBe("FORBIDDEN");
    // as recusas não geram notificação ao dono
    const before = await (await ana.get("/api/notifications")).json();
    expect(before.data.some((item) => item.type === "MODERATION")).toBe(false);

    // o usuário comum não alcança a gestão de contas nem a configuração do site
    expect((await ana.get("/api/users")).status()).toBe(403);
    expect((await ana.get("/api/configuration")).status()).toBe(403);
    expect((await ana.post("/api/users", { data: { email: "x-e2e@exemplo.test", name: "X" } })).status()).toBe(403);

    // a versão (RN18): o PATCH do corpo exige a versão aberta, e a antiga é um conflito
    expect((await ana.patch(`/api/contents/${content.id}`, { data: { body: "novo" } })).status()).toBe(422);
    const first = await ana.patch(`/api/contents/${content.id}`, { data: { body: "primeiro", version: content.updatedAt } });
    expect(first.status()).toBe(200);
    const stale = await ana.patch(`/api/contents/${content.id}`, { data: { body: "antigo", version: content.updatedAt } });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("VERSION_CONFLICT");

    // a aparência é de quem a edita
    expect((await ana.put("/api/appearance", { data: { siteName: "Espaço da Ana" } })).status()).toBe(200);
  });

  test("o administrador modera o conteúdo alheio, com o motivo, e o dono é notificado em português (CT50, CT51)", async () => {
    const created = await ana.post("/api/contents", { data: { title: "Para moderar", slug: "para-moderar", type: "DOCUMENT", body: "texto" } });
    const content = (await created.json()).data;

    const unpublished = await admin.patch(`/api/contents/${content.id}`, { data: { status: "DRAFT", reason: "Teste e2e de moderação" } });
    expect(unpublished.status()).toBe(200);
    expect((await unpublished.json()).data).toMatchObject({ status: "DRAFT", authorId: anaId });

    const listed = await (await ana.get("/api/notifications?unread=1")).json();
    expect(listed.unreadCount).toBeGreaterThanOrEqual(1);
    expect(listed.data[0]).toMatchObject({ type: "MODERATION", title: "Conteúdo despublicado" });
    expect(listed.data[0].text).toContain("Teste e2e de moderação");

    // a notificação é só de quem a recebe: o administrador não vê a da Ana, e ela é dispensada pela dona
    expect(((await (await admin.get("/api/notifications")).json()).data).some((item) => item.id === listed.data[0].id)).toBe(false);
    expect((await admin.patch(`/api/notifications/${listed.data[0].id}`, { data: { read: true } })).status()).toBe(404);
    expect((await ana.patch(`/api/notifications/${listed.data[0].id}`, { data: { dismissed: true } })).status()).toBe(200);

    expect((await admin.delete(`/api/contents/${content.id}?reason=Teste%20e2e`)).status()).toBe(204);
    expect((await (await ana.get("/api/notifications?unread=1")).json()).data[0]).toMatchObject({ title: "Conteúdo excluído" });
    expect((await ana.post("/api/notifications/read-all")).status()).toBe(200);
    expect((await (await ana.get("/api/notifications?unread=1")).json()).unreadCount).toBe(0);
  });

  test("suspender revoga a sessão, o login diz o motivo e reativar devolve o acesso (CT41)", async ({ playwright }) => {
    const banned = await admin.post(`/api/users/${anaId}/ban`, { data: { reason: "Teste e2e de suspensão" } });
    expect(banned.status()).toBe(200);

    expect((await ana.get("/api/contents")).status()).toBe(401);
    const refused = await login(playwright, { email: ANA.email, password: "senha-definitiva-e2e-9" });
    expect(refused.response.status()).toBe(403);
    const body = await refused.response.json();
    expect(body.code).toBe("BANNED_USER");
    expect(body.message).toContain("Teste e2e de suspensão");
    await refused.context.dispose();

    expect((await admin.delete(`/api/users/${anaId}/ban`)).status()).toBe(200);
    const again = await login(playwright, { email: ANA.email, password: "senha-definitiva-e2e-9" });
    expect(again.response.status()).toBe(200);
    await again.context.dispose();
  });

  test("o último administrador não se rebaixa (409), e ninguém se suspende nem se exclui (403) (CT42)", async () => {
    const me = (await (await admin.get("/api/users/me")).json()).data;
    expect((await admin.patch(`/api/users/${me.id}`, { data: { role: "user" } })).status()).toBe(409);
    expect((await admin.post(`/api/users/${me.id}/ban`, { data: { reason: "x" } })).status()).toBe(403);
    expect((await admin.delete(`/api/users/${me.id}`)).status()).toBe(403);
  });

  test("a mutação vinda de outro site é recusada com 401, mesmo com a sessão do administrador", async () => {
    const response = await admin.post("/api/users", {
      headers: { origin: "https://malicioso.test" },
      data: { email: "csrf-e2e@exemplo.test", name: "CSRF" },
    });
    expect(response.status()).toBe(401);
  });
});
