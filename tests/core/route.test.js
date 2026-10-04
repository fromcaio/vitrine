// O auxiliar de rota (src/app/api/_lib/route.js): erros de programação aparecem ao importar o módulo,
// e a ordem das verificações é a do Cap. 5 §5.6.3. A ordem com recurso e dono está em api-owner.test.js.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { route } from "@/app/api/_lib/route";
import { prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ok = async () => new Response("feito");

describe("definição da rota (falha ao importar, não em produção)", () => {
  it("recusa uma rota sem ação, ou com ação que a matriz não conhece", () => {
    expect(() => route(/** @type {any} */ ({}), ok)).toThrow(/sem ação conhecida/);
    expect(() => route({ action: "content:purge" }, ok)).toThrow(/sem ação conhecida/);
    expect(() => route({ action: "toString" }, ok)).toThrow(/sem ação conhecida/);
    expect(() => route(/** @type {any} */ (undefined), ok)).toThrow();
  });

  it("recusa uma rota de escrita sem grupo de limite de taxa, e um grupo desconhecido", () => {
    expect(() => route({ action: "content:create", mutation: true }, ok)).toThrow(/limite de taxa/);
    expect(() => route({ action: "content:create", rate: /** @type {any} */ ("outro") }, ok)).toThrow(/desconhecido/);
  });

  it("aceita uma rota de leitura sem taxa e uma de escrita com taxa", () => {
    expect(() => route({ action: "content:list" }, ok)).not.toThrow();
    expect(() => route({ action: "content:create", mutation: true, rate: "content" }, ok)).not.toThrow();
  });
});

describe("ordem das verificações", () => {
  it("o handler só roda depois da sessão e da autorização", async () => {
    const handler = vi.fn(ok);
    const guarded = route({ action: "users:list" }, handler);
    const admin = await createAdminSession();
    const ana = await createUserSession({ email: "ana@exemplo.test" });

    expect((await guarded(apiRequest("/api/x"))).status).toBe(401);
    expect((await guarded(apiRequest("/api/x", { cookie: ana.cookie }))).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();

    expect((await guarded(apiRequest("/api/x", { cookie: admin.cookie }))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a origem vem antes da sessão: outro site com sessão válida e sem sessão dão a mesma resposta", async () => {
    const guarded = route({ action: "content:create", mutation: true, rate: "content" }, ok);
    const admin = await createAdminSession();
    const bad = { method: "POST", body: {}, headers: { origin: "https://malicioso.test" } };

    const withSession = await guarded(apiRequest("/api/x", { ...bad, cookie: admin.cookie }));
    const without = await guarded(apiRequest("/api/x", bad));
    expect(withSession.status).toBe(401);
    expect(await withSession.json()).toEqual(await without.json());
  });

  it("a taxa vem antes do recurso: o carregador não roda depois do limite", async () => {
    const load = vi.fn(async ({ actor }) => ({ ownerId: actor.id }));
    const guarded = route({ action: "content:update", mutation: true, rate: "password", load }, ok);
    const ana = await createUserSession({ email: "ana@exemplo.test" });

    for (let i = 0; i < 5; i++) expect((await guarded(apiRequest("/api/x", { method: "PATCH", body: {}, cookie: ana.cookie }), routeContext({})))).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(5);
    const limited = await guarded(apiRequest("/api/x", { method: "PATCH", body: {}, cookie: ana.cookie }), routeContext({}));
    expect(limited.status).toBe(429);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("o carregador que devolve nulo responde 404 antes da autorização", async () => {
    const guarded = route({ action: "content:update", mutation: true, rate: "content", load: async () => null }, ok);
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    const response = await guarded(apiRequest("/api/x/abc", { method: "PATCH", body: {}, cookie: ana.cookie }), routeContext({ id: "abc" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error.details).toEqual([{ field: "id", value: "abc" }]);
  });

  it("uma ação de recurso sem carregador falha fechada: 403 até para o administrador", async () => {
    const guarded = route({ action: "content:update", mutation: true, rate: "content" }, ok);
    const admin = await createAdminSession();
    expect((await guarded(apiRequest("/api/x", { method: "PATCH", body: {}, cookie: admin.cookie }))).status).toBe(403);
  });

  it("recurso de outro dono só passa para o administrador quando a rota aceita moderação (allowForeign)", async () => {
    const load = async () => ({ ownerId: "outro-dono" });
    const admin = await createAdminSession();
    const strict = route({ action: "content:update", mutation: true, rate: "content", load }, ok);
    const moderation = route({ action: "content:update", mutation: true, rate: "content", load, allowForeign: true }, async ({ foreign }) => Response.json({ foreign }));

    const request = () => apiRequest("/api/x", { method: "PATCH", body: {}, cookie: admin.cookie });
    expect((await strict(request(), routeContext({}))).status).toBe(403);
    const accepted = await moderation(request(), routeContext({}));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ foreign: true });
  });

  it("allowForeign não abre a porta ao usuário comum", async () => {
    const guarded = route({ action: "content:update", mutation: true, rate: "content", load: async () => ({ ownerId: "outro-dono" }), allowForeign: true }, ok);
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    expect((await guarded(apiRequest("/api/x", { method: "PATCH", body: {}, cookie: ana.cookie }), routeContext({}))).status).toBe(403);
  });

  it("erro inesperado do handler vira 500 genérico, sem vazar o detalhe", async () => {
    const guarded = route({ action: "content:list" }, async () => {
      throw new Error("segredo interno da consulta");
    });
    const admin = await createAdminSession();
    const response = await guarded(apiRequest("/api/x", { cookie: admin.cookie }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("segredo interno");
  });

  it("usuário suspenso é 401 (a suspensão vigente é sessão ausente)", async () => {
    const guarded = route({ action: "content:list" }, ok);
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banExpires: new Date(Date.now() + 60_000) } });
    expect((await guarded(apiRequest("/api/x", { cookie: ana.cookie }))).status).toBe(401);
  });
});
