// Cliente da API de notificações (RF33, RN26, ADR-026; CT50, parte da UI): os pedidos que faz e a
// tradução das respostas em português. A API é um fetch simulado.
import { describe, expect, it, vi } from "vitest";
import {
  MESSAGES,
  PAGE_SIZE,
  dismissNotification,
  fetchUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  normalizeNotification,
} from "@/components/admin/notification-client";

const json = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const error = (/** @type {number} */ status, code = "X", headers = {}) => json(status, { error: { code, message: "m", details: [] } }, headers);
const stub = (/** @type {Response | (() => Promise<Response>)} */ response) =>
  vi.fn(typeof response === "function" ? response : async () => response);

const RAW = {
  id: "n1",
  type: "CONTRAST",
  severity: "WARNING",
  title: "Contraste",
  text: "A paleta noturna tem cores abaixo do mínimo.",
  data: { mode: "dark" },
  readAt: null,
  resolvedAt: null,
  createdAt: "2026-10-05T12:00:00.000Z",
  updatedAt: "2026-10-05T12:00:00.000Z",
};

describe("normalizeNotification", () => {
  it("mantém os campos conhecidos", () => {
    expect(normalizeNotification(RAW)).toEqual(RAW);
  });

  it("um item sem id não entra na lista", () => {
    expect(normalizeNotification({ ...RAW, id: "" })).toBeNull();
    expect(normalizeNotification({ title: "x" })).toBeNull();
    expect(normalizeNotification(null)).toBeNull();
  });

  it("uma gravidade desconhecida vira INFO e campos de tipo errado viram vazio, sem lançar", () => {
    const item = normalizeNotification({ id: "n", severity: "URGENTE", title: 7, text: null, readAt: 5, resolvedAt: {}, createdAt: 1 });
    expect(item).toMatchObject({ severity: "INFO", title: "", text: "", readAt: null, resolvedAt: null, createdAt: "" });
  });

  it("não repassa campos desconhecidos (o dono, a chave de deduplicação)", () => {
    const item = normalizeNotification({ ...RAW, userId: "u1", dedupeKey: "contrast:dark" });
    expect(item).not.toHaveProperty("userId");
    expect(item).not.toHaveProperty("dedupeKey");
  });
});

describe("listNotifications (GET /api/notifications)", () => {
  const page = { data: [RAW, { ...RAW, id: "n2" }], unreadCount: 7, nextCursor: "n2" };

  it("pede a primeira página com o limite padrão, sem cache", async () => {
    const fetchImpl = stub(json(200, page));
    const result = await listNotifications({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`/api/notifications?limit=${PAGE_SIZE}`);
    expect(init).toEqual({ cache: "no-store" });
    expect(result).toMatchObject({ ok: true, unreadCount: 7, nextCursor: "n2" });
    expect(/** @type {any} */ (result).items.map((/** @type {{ id: string }} */ item) => item.id)).toEqual(["n1", "n2"]);
  });

  it("o filtro de não lidas e o cursor vão na consulta", async () => {
    const fetchImpl = stub(json(200, page));
    await listNotifications({ unread: true, cursor: "n9", limit: 5, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/notifications?limit=5&unread=1&cursor=n9");
  });

  it("o cursor é codificado na URL", async () => {
    const fetchImpl = stub(json(200, page));
    await listNotifications({ cursor: "a b&c", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/notifications?limit=20&cursor=a+b%26c");
  });

  it("a última página tem nextCursor nulo; itens malformados são descartados", async () => {
    const result = await listNotifications({ fetchImpl: stub(json(200, { data: [RAW, { sem: "id" }, null], unreadCount: 0, nextCursor: null })) });
    expect(result).toMatchObject({ ok: true, unreadCount: 0, nextCursor: null });
    expect(/** @type {any} */ (result).items).toHaveLength(1);
  });

  it("um contador ausente ou inválido vira nulo (o chamador mantém o que tinha)", async () => {
    expect(await listNotifications({ fetchImpl: stub(json(200, { data: [], unreadCount: "3" })) })).toMatchObject({ unreadCount: null });
    expect(await listNotifications({ fetchImpl: stub(json(200, { data: [], unreadCount: -1 })) })).toMatchObject({ unreadCount: null });
  });

  it("422 com cursor: o cursor ficou velho (um item foi dispensado entre as páginas)", async () => {
    const result = await listNotifications({ cursor: "n2", fetchImpl: stub(error(422, "VALIDATION_ERROR")) });
    expect(result).toEqual({ ok: false, kind: "stale-cursor", message: MESSAGES.staleCursor });
  });

  it("422 sem cursor não é cursor velho", async () => {
    expect(await listNotifications({ fetchImpl: stub(error(422, "VALIDATION_ERROR")) })).toMatchObject({ ok: false, kind: "server", message: MESSAGES.rejected });
  });

  it.each([
    [401, "UNAUTHENTICATED", "unauthenticated", MESSAGES.unauthenticated],
    [403, "FORBIDDEN", "forbidden", MESSAGES.forbidden],
    [403, "PASSWORD_CHANGE_REQUIRED", "forbidden", MESSAGES.passwordChange],
    [404, "NOT_FOUND", "not-found", MESSAGES.notFound],
    [500, "INTERNAL_ERROR", "server", MESSAGES.server],
    [503, "BUSY", "server", MESSAGES.server],
  ])("%i %s: mensagem em português", async (status, code, kind, message) => {
    expect(await listNotifications({ fetchImpl: stub(error(status, code)) })).toEqual({ ok: false, kind, message });
  });

  it("429: pede para aguardar e diz os segundos do Retry-After", async () => {
    expect(await listNotifications({ fetchImpl: stub(error(429, "RATE_LIMITED", { "Retry-After": "42" })) })).toEqual({
      ok: false,
      kind: "rate-limited",
      message: `${MESSAGES.rateLimited} Tente de novo em 42 segundos.`,
    });
    expect(await listNotifications({ fetchImpl: stub(error(429, "RATE_LIMITED", { "Retry-After": "1" })) })).toMatchObject({ message: expect.stringContaining("em 1 segundo.") });
    expect(await listNotifications({ fetchImpl: stub(error(429)) })).toMatchObject({ message: MESSAGES.rateLimited });
  });

  it("corpo que não é JSON e falha de rede: mensagens de servidor e de conexão, sem lançar", async () => {
    expect(await listNotifications({ fetchImpl: stub(new Response("<html>erro</html>", { status: 502 })) })).toMatchObject({ kind: "server" });
    expect(await listNotifications({ fetchImpl: stub(() => Promise.reject(new TypeError("Failed to fetch"))) })).toEqual({ ok: false, kind: "network", message: MESSAGES.network });
  });
});

describe("fetchUnreadCount (a consulta leve do sino)", () => {
  it("pede só uma notificação e lê o contador", async () => {
    const fetchImpl = stub(json(200, { data: [RAW], unreadCount: 4, nextCursor: "n1" }));
    expect(await fetchUnreadCount(fetchImpl)).toEqual({ ok: true, unreadCount: 4 });
    expect(fetchImpl.mock.calls[0]).toEqual(["/api/notifications?limit=1", { cache: "no-store" }]);
  });

  it("traduz 401 e 429, como a lista", async () => {
    expect(await fetchUnreadCount(stub(error(401)))).toMatchObject({ ok: false, kind: "unauthenticated" });
    expect(await fetchUnreadCount(stub(error(429)))).toMatchObject({ ok: false, kind: "rate-limited" });
  });
});

describe("markRead e dismissNotification (PATCH /api/notifications/:id)", () => {
  it("marcar como lida envia { read: true } e devolve o contador", async () => {
    const fetchImpl = stub(json(200, { data: { id: "n1", read: true }, unreadCount: 2 }));
    expect(await markRead("n1", fetchImpl)).toEqual({ ok: true, unreadCount: 2 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/notifications/n1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ read: true });
  });

  it("dispensar envia { dismissed: true }", async () => {
    const fetchImpl = stub(json(200, { data: { id: "n1", dismissed: true }, unreadCount: 0 }));
    expect(await dismissNotification("n1", fetchImpl)).toEqual({ ok: true, unreadCount: 0 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ dismissed: true });
  });

  it("codifica o identificador na URL", async () => {
    const fetchImpl = stub(json(200, { data: {}, unreadCount: 0 }));
    await markRead("a/b c?x", fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/notifications/a%2Fb%20c%3Fx");
  });

  it("404 (outro usuário ou já dispensada) e 429 têm as suas mensagens", async () => {
    expect(await markRead("n1", stub(error(404, "NOT_FOUND")))).toEqual({ ok: false, kind: "not-found", message: MESSAGES.notFound });
    expect(await dismissNotification("n1", stub(error(429, "RATE_LIMITED", { "Retry-After": "9" })))).toMatchObject({ kind: "rate-limited" });
  });

  it("um 422 de PATCH não é cursor velho", async () => {
    expect(await markRead("n1", stub(error(422)))).toMatchObject({ kind: "server", message: MESSAGES.rejected });
  });
});

describe("markAllRead (POST /api/notifications/read-all)", () => {
  it("devolve quantas foram marcadas e o contador", async () => {
    const fetchImpl = stub(json(200, { data: { count: 5 }, unreadCount: 0 }));
    expect(await markAllRead(fetchImpl)).toEqual({ ok: true, count: 5, unreadCount: 0 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/notifications/read-all");
    expect(init.method).toBe("POST");
  });

  it("sem contagem na resposta, count é 0", async () => {
    expect(await markAllRead(stub(json(200, { data: {}, unreadCount: 1 })))).toEqual({ ok: true, count: 0, unreadCount: 1 });
  });

  it("401 e erro de rede", async () => {
    expect(await markAllRead(stub(error(401)))).toMatchObject({ kind: "unauthenticated" });
    expect(await markAllRead(stub(() => Promise.reject(new Error("x"))))).toMatchObject({ kind: "network" });
  });
});
