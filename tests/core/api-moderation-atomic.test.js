// Moderação transacional (A-014 Parte 3a, item 2; RN26; CT51 por inteiro): a escrita e a notificação ao
// dono são UMA transação (`updateContent` e `deleteContent` com `notification`, do Dados). Se a
// notificação falha DENTRO da transação (aqui, o destinatário não existe: violação da chave
// estrangeira), a escrita é desfeita; se a escrita falha, nenhuma notificação nasce.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const broken = vi.hoisted(() => ({ on: false }));

// A notificação da rota passa a apontar para um usuário que não existe, só quando o teste pede.
vi.mock("@/app/api/_lib/moderation", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    contentNotification: (input) => {
      const notification = actual.contentNotification(input);
      return broken.on ? { ...notification, userId: "usuario-que-nao-existe" } : notification;
    },
  };
});

import { revalidatePath } from "next/cache";
import * as contentRoute from "@/app/api/contents/[id]/route";
import { createContent, prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;

beforeEach(async () => {
  broken.on = false;
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
});

const update = (id, body) =>
  contentRoute.PATCH(apiRequest(`/api/contents/${id}`, { method: "PATCH", body, cookie: admin.cookie }), routeContext({ id }));
const remove = (id, query) =>
  contentRoute.DELETE(apiRequest(`/api/contents/${id}${query}`, { method: "DELETE", cookie: admin.cookie }), routeContext({ id }));
const row = (id) => prisma.content.findUnique({ where: { id } });
const seed = (slug, extra = {}) =>
  createContent({ title: slug, slug, type: "DOCUMENT", authorId: ana.id, body: "original", ...extra });

describe("a notificação falha dentro da transação: a escrita é desfeita (CT51)", () => {
  it("PATCH: despublicar não se aplica, e nada é revalidado", async () => {
    const theirs = await seed("da-ana");
    broken.on = true;

    const response = await update(theirs.id, { status: "DRAFT", reason: "fora das regras" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await row(theirs.id)).toMatchObject({ status: "PUBLISHED", updatedAt: theirs.updatedAt });
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("PATCH: a edição do corpo também é desfeita", async () => {
    const theirs = await seed("da-ana");
    broken.on = true;

    const response = await update(theirs.id, { body: "do admin", version: theirs.updatedAt.toISOString(), reason: "x" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await row(theirs.id)).body).toBe("original");
  });

  it("DELETE: o conteúdo e os descendentes continuam no banco", async () => {
    const root = await seed("calculo", { type: "COLLECTION", body: null });
    const child = await seed("limites", { parentId: root.id });
    broken.on = true;

    const response = await remove(root.id, "?reason=plagio");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await row(root.id)).not.toBeNull();
    expect(await row(child.id)).not.toBeNull();
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("a escrita falha: nenhuma notificação nasce", () => {
  it("PATCH com slug repetido: 409 e zero notificações", async () => {
    const theirs = await seed("da-ana");
    await seed("outro");

    const response = await update(theirs.id, { slug: "outro", reason: "renomeando" });

    expect(response.status).toBe(409);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("PATCH com version velha: 409 VERSION_CONFLICT e zero notificações", async () => {
    const theirs = await seed("da-ana");
    await prisma.content.update({ where: { id: theirs.id }, data: { body: "do dono" } });

    const response = await update(theirs.id, { body: "do admin", version: theirs.updatedAt.toISOString(), reason: "x" });

    expect(response.status).toBe(409);
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("tudo certo: a escrita e a notificação juntas", () => {
  it("PATCH e DELETE gravam o conteúdo e a notificação ao dono", async () => {
    const theirs = await seed("da-ana");

    expect((await update(theirs.id, { status: "DRAFT", reason: "fora das regras" })).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: ana.id } })).toBe(1);

    expect((await remove(theirs.id, "?reason=plagio")).status).toBe(204);
    expect(await row(theirs.id)).toBeNull();
    expect(await prisma.notification.count({ where: { userId: ana.id } })).toBe(2);
  });
});
