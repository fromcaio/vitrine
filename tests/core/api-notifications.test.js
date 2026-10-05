// Rotas de notificações (A-014 Parte 2, item 2; RF33, RN19, RN26, ADR-026; CT50, parte do servidor):
// cada usuário, inclusive o administrador, vê, marca e dispensa SÓ as suas; a de outro usuário
// responde 404; o texto sai em português, montado a partir de `type` e `data`. better-auth real
// sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it } from "vitest";
import * as itemRoute from "@/app/api/notifications/[id]/route";
import * as readAllRoute from "@/app/api/notifications/read-all/route";
import * as listRoute from "@/app/api/notifications/route";
import { RATE_LIMITS } from "@/app/api/_lib/rate-limit";
import { notify, prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

const list = (cookie, query = "") => listRoute.GET(apiRequest(`/api/notifications${query}`, { cookie }));
const patch = (id, body, cookie, headers = {}) =>
  itemRoute.PATCH(apiRequest(`/api/notifications/${id}`, { method: "PATCH", body, cookie, headers }), routeContext({ id }));
const readAll = (cookie) => readAllRoute.POST(apiRequest("/api/notifications/read-all", { method: "POST", cookie }));

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const notice = (userId, extra = {}) =>
  notify({ userId, type: "ACCOUNT", severity: "INFO", data: { event: "PASSWORD_RESET" }, ...extra });
const stored = (/** @type {string} */ id) => prisma.notification.findUnique({ where: { id } });

describe("GET /api/notifications (CT50, RF33)", () => {
  it("devolve só as notificações do usuário da sessão, com unreadCount e o texto em português", async () => {
    const mine = await notify({
      userId: ana.id,
      type: "MODERATION",
      severity: "WARNING",
      data: { event: "CONTENT_UNPUBLISHED", reason: "Fora das regras", contentTitle: "Limites" },
    });
    await notice(beto.id);

    const response = await list(ana.cookie);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.unreadCount).toBe(1);
    expect(body.nextCursor).toBeNull();
    expect(body.data).toEqual([
      {
        id: mine.id,
        type: "MODERATION",
        severity: "WARNING",
        title: "Conteúdo despublicado",
        text: "Um administrador despublicou “Limites”: ele voltou a ser rascunho e saiu do ar. Motivo: Fora das regras",
        data: { event: "CONTENT_UNPUBLISHED", reason: "Fora das regras", contentTitle: "Limites" },
        readAt: null,
        resolvedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
    // O resultado nunca traz o dono nem a chave de deduplicação.
    expect(body.data[0]).not.toHaveProperty("userId");
    expect(body.data[0]).not.toHaveProperty("dedupeKey");
  });

  it("o administrador também vê só as suas, nunca as de outro usuário (RN19)", async () => {
    await notice(ana.id);
    await notice(beto.id);
    const own = await notice(admin.userId);

    const body = await (await list(admin.cookie)).json();

    expect(body.data.map((item) => item.id)).toEqual([own.id]);
    expect(body.unreadCount).toBe(1);
  });

  it("?unread=1 traz só as não lidas e não resolvidas; unreadCount conta todas, não só a página", async () => {
    const read = await notice(ana.id);
    await notice(ana.id);
    const resolved = await notice(ana.id, { type: "CONTRAST", data: {}, dedupeKey: "contrast:light" });
    await prisma.notification.update({ where: { id: read.id }, data: { readAt: new Date() } });
    await prisma.notification.update({ where: { id: resolved.id }, data: { resolvedAt: new Date() } });

    const all = await (await list(ana.cookie)).json();
    const unread = await (await list(ana.cookie, "?unread=1")).json();
    const limited = await (await list(ana.cookie, "?unread=1&limit=1")).json();

    expect(all.data).toHaveLength(3);
    expect(unread.data).toHaveLength(1);
    expect(unread.unreadCount).toBe(1);
    expect(limited.unreadCount).toBe(1);
  });

  it("pagina por cursor, das mais recentes às mais antigas, sem repetir nem perder nenhuma", async () => {
    const created = [];
    for (let i = 0; i < 5; i++) created.push((await notice(ana.id, { data: { event: "PASSWORD_RESET", n: i } })).id);

    const seen = [];
    let query = "?limit=2";
    for (let pages = 0; pages < 5; pages++) {
      const body = await (await list(ana.cookie, query)).json();
      seen.push(...body.data.map((item) => item.id));
      expect(body.unreadCount).toBe(5);
      if (body.nextCursor === null) break;
      expect(body.data).toHaveLength(2);
      query = `?limit=2&cursor=${body.nextCursor}`;
    }

    expect(seen).toEqual(created.toReversed());
  });

  it("um cursor que não é uma notificação do próprio usuário responde 422 (o de outro e o inexistente)", async () => {
    const theirs = await notice(beto.id);
    await notice(ana.id);

    for (const cursor of [theirs.id, "nao-existe"]) {
      const response = await list(ana.cookie, `?cursor=${cursor}`);
      expect(response.status).toBe(422);
      expect((await errorOf(response)).details).toEqual([expect.objectContaining({ field: "cursor" })]);
    }
  });

  it("uma página exata não anuncia uma próxima vazia", async () => {
    await notice(ana.id);
    await notice(ana.id);

    const body = await (await list(ana.cookie, "?limit=2")).json();

    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
  });

  it.each([["?limit=0"], ["?limit=101"], ["?limit=abc"], ["?unread=sim"], ["?cursor="]])("parâmetro inválido %s: 422", async (query) => {
    const response = await list(ana.cookie, query);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
  });

  it("sem sessão: 401; com senha provisória: 403 PASSWORD_CHANGE_REQUIRED", async () => {
    expect((await list(undefined)).status).toBe(401);

    const carla = await createUserSession({ email: "carla@exemplo.test", mustChangePassword: true });
    const response = await list(carla.cookie);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("um evento desconhecido e uma notificação de contraste caem no aviso genérico, sem derrubar a lista", async () => {
    await notify({ userId: ana.id, type: "ACCOUNT", data: { event: "EVENTO_FUTURO" } });
    await notify({ userId: ana.id, type: "CONTRAST", data: {}, dedupeKey: "contrast:dark" });

    const body = await (await list(ana.cookie)).json();

    expect(body.data.map((item) => item.title).sort()).toEqual(["Aviso", "Aviso de contraste"]);
  });
});

describe("PATCH /api/notifications/:id (CT50, RF33)", () => {
  it("read: marca como lida, é idempotente e atualiza unreadCount", async () => {
    const first = await notice(ana.id);
    await notice(ana.id);

    const response = await patch(first.id, { read: true }, ana.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: first.id, read: true }, unreadCount: 1 });
    const readAt = (await stored(first.id)).readAt;
    expect(readAt).toBeInstanceOf(Date);

    const again = await patch(first.id, { read: true }, ana.cookie);
    expect(again.status).toBe(200);
    expect((await again.json()).unreadCount).toBe(1);
    expect((await stored(first.id)).readAt).toEqual(readAt); // não regrava
  });

  it("dismissed: dispensa (exclui) só aquela", async () => {
    const first = await notice(ana.id);
    const second = await notice(ana.id);

    const response = await patch(first.id, { dismissed: true }, ana.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: first.id, dismissed: true }, unreadCount: 1 });
    expect(await stored(first.id)).toBeNull();
    expect(await stored(second.id)).not.toBeNull();
  });

  it("a notificação de outro usuário responde 404 e não é alterada, nem por ele nem pelo administrador", async () => {
    const theirs = await notice(beto.id);

    for (const [body, cookie] of [
      [{ read: true }, ana.cookie],
      [{ dismissed: true }, ana.cookie],
      [{ read: true }, admin.cookie],
      [{ dismissed: true }, admin.cookie],
    ]) {
      const response = await patch(theirs.id, body, cookie);
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
    }
    expect(await stored(theirs.id)).toMatchObject({ readAt: null });
  });

  it("a inexistente também responde 404, indistinguível da de outro usuário", async () => {
    const response = await patch("nao-existe", { read: true }, ana.cookie);

    expect(response.status).toBe(404);
    expect((await errorOf(response)).details).toEqual([{ field: "id", value: "nao-existe" }]);
  });

  it.each([
    ["vazio", {}],
    ["os dois", { read: true, dismissed: true }],
    ["read falso", { read: false }],
    ["dismissed falso", { dismissed: false }],
    ["texto", { read: "true" }],
    ["campo desconhecido", { archived: true }],
  ])("corpo %s: 422 e nada muda", async (_label, body) => {
    const mine = await notice(ana.id);

    const response = await patch(mine.id, body, ana.cookie);

    expect(response.status).toBe(422);
    expect((await stored(mine.id)).readAt).toBeNull();
  });

  it("sem sessão: 401; origem de outro site: 401; nada muda", async () => {
    const mine = await notice(ana.id);

    expect((await patch(mine.id, { read: true }, undefined)).status).toBe(401);
    expect((await patch(mine.id, { read: true }, ana.cookie, { origin: "https://malicioso.test" })).status).toBe(401);
    expect((await stored(mine.id)).readAt).toBeNull();
  });

  it("o limite de escritas por usuário vale (429 com Retry-After)", async () => {
    const mine = await notice(ana.id);

    for (let i = 0; i < RATE_LIMITS.notifications; i++) {
      expect((await patch(mine.id, { read: true }, ana.cookie)).status).toBe(200);
    }
    const blocked = await patch(mine.id, { read: true }, ana.cookie);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/notifications/read-all (CT50, RF33)", () => {
  it("marca como lidas todas as do usuário, e só as dele", async () => {
    await notice(ana.id);
    await notice(ana.id);
    const theirs = await notice(beto.id);
    const own = await notice(admin.userId);

    const response = await readAll(ana.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { count: 2 }, unreadCount: 0 });
    expect(await prisma.notification.count({ where: { userId: ana.id, readAt: null } })).toBe(0);
    expect((await stored(theirs.id)).readAt).toBeNull();
    expect((await stored(own.id)).readAt).toBeNull();
  });

  it("sem nenhuma não lida: count 0", async () => {
    const response = await readAll(ana.cookie);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ count: 0 });
  });

  it("sem sessão: 401", async () => {
    expect((await readAll(undefined)).status).toBe(401);
  });
});
