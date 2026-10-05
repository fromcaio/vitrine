// Moderação de conteúdo alheio (A-014 Parte 2, item 1; RF34, RN19, RN26, ADR-027; CT51, parte do
// servidor): o administrador despublica, edita e exclui o conteúdo de outro dono, com o motivo
// obrigatório; o dono recebe a notificação `MODERATION`; a `version` da RN18 vale também aqui;
// reordenar o conteúdo alheio continua 403; e a revalidação cai no espaço do DONO, não no do
// administrador. better-auth real sobre o banco temporário; `revalidatePath` é substituído.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as reorderRoute from "@/app/api/contents/reorder/route";
import { createContent, listNotifications, prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  await prisma.user.update({ where: { id: admin.userId }, data: { handle: "ada" } });
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

const update = (id, body, cookie) =>
  contentRoute.PATCH(apiRequest(`/api/contents/${id}`, { method: "PATCH", body, cookie }), routeContext({ id }));
const remove = (id, cookie, query = "") =>
  contentRoute.DELETE(apiRequest(`/api/contents/${id}${query}`, { method: "DELETE", cookie }), routeContext({ id }));
const reorder = (body, cookie) =>
  reorderRoute.PATCH(apiRequest("/api/contents/reorder", { method: "PATCH", body, cookie }));

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const row = (/** @type {string} */ id) => prisma.content.findUniqueOrThrow({ where: { id } });
const notificationsOf = (/** @type {string} */ userId) => listNotifications(userId, { take: 50 });
const pages = () =>
  vi.mocked(revalidatePath).mock.calls.filter((call) => call.length === 1).map((call) => call[0]).sort();
const portalCalls = () => vi.mocked(revalidatePath).mock.calls.filter((call) => call.length === 2);

/** Conteúdo de um dono, criado direto pela camada de dados. */
const seed = (/** @type {string} */ authorId, /** @type {string} */ slug, extra = {}) =>
  createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: "original", ...extra });

describe("PATCH /api/contents/:id: moderação (RF34, RN19, RN26)", () => {
  it("despublicar: aplica, notifica o dono com o motivo e invalida o espaço DO DONO", async () => {
    const theirs = await seed(ana.id, "da-ana");

    const response = await update(theirs.id, { status: "DRAFT", reason: "  Conteúdo fora das regras  " }, admin.cookie);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: theirs.id, status: "DRAFT", authorId: ana.id });
    expect(await row(theirs.id)).toMatchObject({ status: "DRAFT", authorId: ana.id });

    const [notice, ...others] = await notificationsOf(ana.id);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      type: "MODERATION",
      severity: "WARNING",
      data: {
        event: "CONTENT_UNPUBLISHED",
        reason: "Conteúdo fora das regras", // aparado, como o validador entrega
        contentId: theirs.id,
        contentTitle: "Título da-ana",
        contentType: "DOCUMENT",
        fields: ["status"],
      },
    });
    // Ninguém mais é notificado: nem o administrador, nem outro usuário.
    expect(await notificationsOf(admin.userId)).toEqual([]);
    expect(await notificationsOf(beto.id)).toEqual([]);

    // O espaço é o da Ana (/ana), nunca o do administrador (/ada) nem o de outro autor; e a raiz
    // despublicada sai do diretório do portal.
    expect(pages()).toEqual(["/ana", "/ana/da-ana"]);
    expect(portalCalls()).toEqual([["/", "page"]]);
  });

  it("editar o título e o corpo: notifica como edição (INFO), com os campos alterados", async () => {
    const theirs = await seed(ana.id, "da-ana");

    const response = await update(
      theirs.id,
      { title: "Novo título", body: "corpo corrigido", version: theirs.updatedAt.toISOString(), reason: "erro factual" },
      admin.cookie,
    );

    expect(response.status).toBe(200);
    expect(await row(theirs.id)).toMatchObject({ title: "Novo título", body: "corpo corrigido", authorId: ana.id });
    const [notice] = await notificationsOf(ana.id);
    expect(notice).toMatchObject({
      type: "MODERATION",
      severity: "INFO",
      data: { event: "CONTENT_EDITED", reason: "erro factual", contentTitle: "Título da-ana", fields: ["title", "body"] },
    });
  });

  it("republicar também é uma edição (não é despublicar)", async () => {
    const theirs = await seed(ana.id, "da-ana", { status: "DRAFT" });

    await update(theirs.id, { status: "PUBLISHED", reason: "revisado" }, admin.cookie);

    const [notice] = await notificationsOf(ana.id);
    expect(notice.data).toMatchObject({ event: "CONTENT_EDITED", fields: ["status"] });
  });

  it("só o corpo mudou: invalida só a página do documento do dono", async () => {
    const theirs = await seed(ana.id, "da-ana");

    await update(theirs.id, { body: "novo", version: theirs.updatedAt.toISOString(), reason: "correção" }, admin.cookie);

    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/ana/da-ana");
  });

  describe("o motivo é obrigatório (422)", () => {
    it.each([
      ["ausente", {}],
      ["vazio", { reason: "" }],
      ["só espaços", { reason: "   " }],
      ["com mais de 500 caracteres", { reason: "x".repeat(501) }],
      ["que não é texto", { reason: 42 }],
    ])("motivo %s: 422 em reason, nada muda, ninguém é notificado, nada é revalidado", async (_label, extra) => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { status: "DRAFT", ...extra }, admin.cookie);

      expect(response.status).toBe(422);
      expect((await errorOf(response)).details).toEqual([expect.objectContaining({ field: "reason" })]);
      expect(await row(theirs.id)).toMatchObject({ status: "PUBLISHED" });
      expect(await prisma.notification.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("500 caracteres é aceito", async () => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { status: "DRAFT", reason: "x".repeat(500) }, admin.cookie);

      expect(response.status).toBe(200);
      expect((await notificationsOf(ana.id))[0].data.reason).toHaveLength(500);
    });

    it("um corpo só com o motivo não altera nada: 422 (nenhum campo do conteúdo)", async () => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { reason: "sem mudança" }, admin.cookie);

      expect(response.status).toBe(422);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe("a version da RN18 vale também na moderação", () => {
    it("alterar o corpo sem version: 422, nada muda e ninguém é notificado", async () => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { body: "do admin", reason: "correção" }, admin.cookie);

      expect(response.status).toBe(422);
      expect((await errorOf(response)).details).toEqual([expect.objectContaining({ field: "version" })]);
      expect((await row(theirs.id)).body).toBe("original");
      expect(await prisma.notification.count()).toBe(0);
    });

    it("version desatualizada (o dono editou depois): 409 VERSION_CONFLICT, nada aplicado, nada notificado", async () => {
      const theirs = await seed(ana.id, "da-ana");
      const opened = theirs.updatedAt.toISOString();
      await update(theirs.id, { body: "do dono", version: opened }, ana.cookie);
      vi.mocked(revalidatePath).mockClear();

      const response = await update(theirs.id, { body: "do admin", version: opened, reason: "correção" }, admin.cookie);

      expect(response.status).toBe(409);
      const error = await errorOf(response);
      expect(error.code).toBe("VERSION_CONFLICT");
      expect(error.details[0].value).toBe((await row(theirs.id)).updatedAt.toISOString());
      expect((await row(theirs.id)).body).toBe("do dono");
      expect(await prisma.notification.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("despublicar (sem alterar o corpo) dispensa a version", async () => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { status: "DRAFT", reason: "fora das regras" }, admin.cookie);

      expect(response.status).toBe(200);
    });
  });

  describe("mover ou reordenar o conteúdo alheio não é moderação (403)", () => {
    it.each([
      ["parentId", { parentId: null }],
      ["order", { order: 4 }],
    ])("PATCH com %s: 403, mesmo com motivo; nada muda e ninguém é notificado", async (_field, move) => {
      const theirs = await seed(ana.id, "da-ana");

      const response = await update(theirs.id, { ...move, reason: "arrumando" }, admin.cookie);

      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN");
      expect(await row(theirs.id)).toMatchObject({ order: 0, parentId: null });
      expect(await prisma.notification.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("o lote de reordenação com um item alheio é recusado por inteiro (403)", async () => {
      const mine = await seed(admin.userId, "meu");
      const theirs = await seed(ana.id, "da-ana");

      const response = await reorder(
        [
          { id: mine.id, order: 5 },
          { id: theirs.id, order: 3 },
        ],
        admin.cookie,
      );

      expect(response.status).toBe(403);
      expect((await row(mine.id)).order).toBe(0);
      expect((await row(theirs.id)).order).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  it("slug repetido no espaço do dono: 409 com sugestão, e nenhuma notificação nasce", async () => {
    const theirs = await seed(ana.id, "da-ana");
    await seed(ana.id, "outro");

    const response = await update(theirs.id, { slug: "outro", reason: "renomeando" }, admin.cookie);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).details[0]).toMatchObject({ field: "slug", value: "outro", suggestion: "outro-2" });
    expect((await row(theirs.id)).slug).toBe("da-ana");
    expect(await prisma.notification.count()).toBe(0);
  });

  it("conteúdo inexistente: 404, sem notificação", async () => {
    const response = await update("nao-existe", { status: "DRAFT", reason: "x" }, admin.cookie);

    expect(response.status).toBe(404);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("o usuário comum não modera o conteúdo de outro: 403, mesmo com motivo", async () => {
    const theirs = await seed(beto.id, "do-beto");

    const response = await update(theirs.id, { status: "DRAFT", reason: "denúncia" }, ana.cookie);

    expect(response.status).toBe(403);
    expect(await row(theirs.id)).toMatchObject({ status: "PUBLISHED" });
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("DELETE /api/contents/:id: moderação (RF34, RN19, RN26, RN07)", () => {
  it("exclui a coleção e os descendentes com o motivo em ?reason=, notifica o dono e invalida os caminhos que saem do ar", async () => {
    const root = await seed(ana.id, "calculo", { type: "COLLECTION", body: null });
    await seed(ana.id, "limites", { parentId: root.id });
    await seed(ana.id, "sobre");

    const response = await remove(root.id, admin.cookie, `?reason=${encodeURIComponent("Plágio comprovado")}`);

    expect(response.status).toBe(204);
    expect(await prisma.content.findMany({ select: { slug: true } })).toEqual([{ slug: "sobre" }]);

    const [notice, ...others] = await notificationsOf(ana.id);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      type: "MODERATION",
      severity: "WARNING",
      data: {
        event: "CONTENT_DELETED",
        reason: "Plágio comprovado",
        contentId: root.id,
        contentTitle: "Título calculo",
        contentType: "COLLECTION",
      },
    });
    expect(await notificationsOf(admin.userId)).toEqual([]);

    expect(pages()).toEqual(["/ana", "/ana/calculo", "/ana/calculo/limites"]);
    expect(portalCalls()).toEqual([["/", "page"]]); // uma raiz saiu do diretório
  });

  it.each([
    ["sem ?reason=", ""],
    ["com ?reason= vazio", "?reason="],
    ["com ?reason= só de espaços", "?reason=%20%20"],
    ["com ?reason= de 501 caracteres", `?reason=${"x".repeat(501)}`],
  ])("%s: 422 em reason, nada é excluído, ninguém é notificado", async (_label, query) => {
    const theirs = await seed(ana.id, "da-ana");

    const response = await remove(theirs.id, admin.cookie, query);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details).toEqual([expect.objectContaining({ field: "reason" })]);
    expect(await row(theirs.id)).toBeTruthy();
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("conteúdo inexistente: 404, sem notificação", async () => {
    const response = await remove("nao-existe", admin.cookie, "?reason=x");

    expect(response.status).toBe(404);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("o usuário comum não exclui o conteúdo de outro: 403, mesmo com motivo", async () => {
    const theirs = await seed(beto.id, "do-beto");

    const response = await remove(theirs.id, ana.cookie, "?reason=denuncia");

    expect(response.status).toBe(403);
    expect(await row(theirs.id)).toBeTruthy();
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("o autor e o administrador sobre o que é deles: sem motivo, sem notificação", () => {
  it("o autor edita e exclui o próprio conteúdo sem motivo; um reason enviado é ignorado", async () => {
    const mine = await seed(ana.id, "da-ana");

    const edited = await update(mine.id, { title: "Meu título", reason: "ignorado" }, ana.cookie);
    expect(edited.status).toBe(200);
    expect((await remove(mine.id, ana.cookie, "?reason=ignorado")).status).toBe(204);

    expect(await prisma.notification.count()).toBe(0);
  });

  it("o administrador edita e exclui o próprio conteúdo sem motivo", async () => {
    const mine = await seed(admin.userId, "meu");

    expect((await update(mine.id, { title: "Meu título" }, admin.cookie)).status).toBe(200);
    expect((await remove(mine.id, admin.cookie)).status).toBe(204);

    expect(await prisma.notification.count()).toBe(0);
    expect(pages().every((page) => page.startsWith("/ada"))).toBe(true);
  });
});
