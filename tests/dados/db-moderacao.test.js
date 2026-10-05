// Integração: moderação transacional e leitura de notificação em src/lib/db.js (A-017; RN18, RN26,
// RF34; CT50, CT51). `updateContent` e `deleteContent` gravam a notificação ao dono na MESMA transação
// da escrita; `getNotification` e o cursor de `listNotifications` respeitam o dono.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DataError,
  MAX_NOTIFICATIONS_PER_USER,
  createContent,
  deleteContent,
  getContentById,
  getNotification,
  listNotifications,
  markRead,
  notify,
  prisma,
  resetNotificationPruneClock,
  updateContent,
} from "@/lib/db";
import { createUser, resetDatabase } from "./helpers.js";

/** @param {Promise<unknown>} promise @returns {Promise<DataError>} */
async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return /** @type {DataError} */ (error);
  }
  throw new Error("Era esperado um erro, mas a chamada foi bem-sucedida.");
}

const minute = (/** @type {number} */ n) => new Date(Date.UTC(2026, 0, 1, 0, n));

describe("db.js: moderação transacional e notificações por dono", () => {
  /** @type {string} */
  let ana;
  /** @type {string} */
  let adm;

  /** @param {string} slug @param {Record<string, unknown>} [extra] */
  const make = (slug, extra = {}) =>
    createContent({ title: slug.toUpperCase(), slug, type: "COLLECTION", authorId: ana, ...extra });
  /** @param {Record<string, unknown>} [extra] */
  const aviso = (extra = {}) => ({
    userId: ana,
    type: /** @type {const} */ ("MODERATION"),
    severity: /** @type {const} */ ("WARNING"),
    data: { action: "UNPUBLISHED" },
    ...extra,
  });
  const notificationCount = (userId = ana) => prisma.notification.count({ where: { userId } });

  beforeEach(async () => {
    await resetDatabase();
    resetNotificationPruneClock();
    ana = (await createUser("ana")).id;
    adm = (await createUser("adm")).id;
  });

  describe("updateContent com notification (RN26, CT51)", () => {
    it("sucesso: grava a escrita e a notificação ao dono, com o tipo, a gravidade e o data", async () => {
      const doc = await make("guia");

      const updated = await updateContent(doc.id, { status: "DRAFT" }, { notification: aviso() });

      expect(updated.status).toBe("DRAFT");
      const [saved] = await listNotifications(ana);
      expect(saved).toMatchObject({ userId: ana, type: "MODERATION", severity: "WARNING", data: { action: "UNPUBLISHED" } });
      expect(await notificationCount(adm)).toBe(0);
    });

    it("sem notification: comportamento de sempre, nenhuma notificação", async () => {
      const doc = await make("guia");

      const updated = await updateContent(doc.id, { title: "Novo" });

      expect(updated.title).toBe("Novo");
      expect(await notificationCount()).toBe(0);
    });

    it("VERSION_CONFLICT: a escrita falha e nenhuma notificação nasce", async () => {
      const doc = await make("guia");

      const error = await failure(
        updateContent(doc.id, { status: "DRAFT" }, { expectedVersion: minute(1), notification: aviso() }),
      );

      expect(error.code).toBe("VERSION_CONFLICT");
      expect(await notificationCount()).toBe(0);
      expect((await getContentById(doc.id))?.status).toBe("PUBLISHED");
    });

    it("SLUG_CONFLICT: a escrita falha e nenhuma notificação nasce", async () => {
      await make("a");
      const b = await make("b");

      const error = await failure(updateContent(b.id, { slug: "a" }, { notification: aviso() }));

      expect(error.code).toBe("SLUG_CONFLICT");
      expect(await notificationCount()).toBe(0);
    });

    it("NOT_FOUND: nenhuma notificação nasce", async () => {
      const error = await failure(updateContent("nao-existe", { status: "DRAFT" }, { notification: aviso() }));

      expect(error.code).toBe("NOT_FOUND");
      expect(await notificationCount()).toBe(0);
    });

    it("notificação com tipo, gravidade ou dados inválidos: INVALID_INPUT, e a escrita não acontece", async () => {
      const doc = await make("guia");
      /** @type {any} */
      const circular = {};
      circular.self = circular;

      for (const [bad, field] of /** @type {Array<[any, string]>} */ ([
        [aviso({ type: "OUTRO" }), "type"],
        [aviso({ severity: "ALTA" }), "severity"],
        [aviso({ data: circular }), "data"],
        [aviso({ userId: "" }), "userId"],
      ])) {
        const error = await failure(updateContent(doc.id, { title: "Mudou" }, { notification: bad }));
        expect(error.code).toBe("INVALID_INPUT");
        expect(error.details).toMatchObject({ field });
      }
      expect((await getContentById(doc.id))?.title).toBe("GUIA");
      expect(await notificationCount()).toBe(0);
    });

    it("notificação para usuário inexistente desfaz a escrita", async () => {
      const doc = await make("guia");

      const error = await failure(updateContent(doc.id, { title: "Mudou" }, { notification: aviso({ userId: "fantasma" }) }));

      expect(error.code).toBe("AUTHOR_NOT_FOUND");
      expect((await getContentById(doc.id))?.title).toBe("GUIA");
    });

    it("o teto de 1000 vale na moderação: sai a lida mais antiga e a recém-criada fica", async () => {
      const doc = await make("guia");
      await prisma.notification.createMany({
        data: Array.from({ length: MAX_NOTIFICATIONS_PER_USER }, (_, i) => ({
          userId: ana,
          type: "MODERATION",
          data: "{}",
          readAt: minute(5000),
          createdAt: minute(i),
          updatedAt: minute(i),
        })),
      });
      const maisAntiga = await prisma.notification.findFirstOrThrow({ where: { userId: ana }, orderBy: { updatedAt: "asc" } });

      await updateContent(doc.id, { status: "DRAFT" }, { notification: aviso() });

      expect(await notificationCount()).toBe(MAX_NOTIFICATIONS_PER_USER);
      expect(await prisma.notification.count({ where: { id: maisAntiga.id } })).toBe(0);
      const [recente] = await listNotifications(ana, { take: 1 });
      expect(recente.data).toEqual({ action: "UNPUBLISHED" });
    });
  });

  describe("deleteContent com notification (RN07, RN26, CT51)", () => {
    it("sucesso: exclui o nó e os descendentes e grava a notificação ao dono", async () => {
      const pasta = await make("pasta");
      const filho = await make("filho", { parentId: pasta.id });

      expect(await deleteContent(pasta.id, { notification: aviso({ data: { action: "DELETED" } }) })).toEqual({ id: pasta.id });

      expect(await getContentById(pasta.id)).toBeNull();
      expect(await getContentById(filho.id)).toBeNull();
      const [saved] = await listNotifications(ana);
      expect(saved).toMatchObject({ type: "MODERATION", data: { action: "DELETED" } });
    });

    it("sem opções: comportamento de sempre (só o id)", async () => {
      const doc = await make("guia");

      await expect(deleteContent(doc.id)).resolves.toEqual({ id: doc.id });

      expect(await notificationCount()).toBe(0);
    });

    it("NOT_FOUND: nenhuma notificação nasce", async () => {
      const error = await failure(deleteContent("nao-existe", { notification: aviso() }));

      expect(error.code).toBe("NOT_FOUND");
      expect(await notificationCount()).toBe(0);
    });

    it("notificação inválida: INVALID_INPUT e nada é excluído", async () => {
      const pasta = await make("pasta");
      const filho = await make("filho", { parentId: pasta.id });

      const error = await failure(deleteContent(pasta.id, { notification: aviso({ type: "OUTRO" }) }));

      expect(error.code).toBe("INVALID_INPUT");
      expect(await getContentById(pasta.id)).not.toBeNull();
      expect(await getContentById(filho.id)).not.toBeNull();
    });

    it("notificação para usuário inexistente desfaz a exclusão, com os descendentes", async () => {
      const pasta = await make("pasta");
      const filho = await make("filho", { parentId: pasta.id });

      const error = await failure(deleteContent(pasta.id, { notification: aviso({ userId: "fantasma" }) }));

      expect(error.code).toBe("AUTHOR_NOT_FOUND");
      expect(await getContentById(pasta.id)).not.toBeNull();
      expect(await getContentById(filho.id)).not.toBeNull();
    });
  });

  describe("getNotification", () => {
    it("devolve a do usuário; null para a de outro usuário e para a inexistente", async () => {
      const minha = await notify({ userId: ana, type: "ACCOUNT", data: { k: 1 } });

      expect(await getNotification(ana, minha.id)).toMatchObject({ id: minha.id, userId: ana, data: { k: 1 } });
      expect(await getNotification(adm, minha.id)).toBeNull();
      expect(await getNotification(ana, "nao-existe")).toBeNull();
    });

    it("distingue o que markRead não distingue: lida continua existindo", async () => {
      const minha = await notify({ userId: ana, type: "ACCOUNT" });
      await markRead(ana, [minha.id]);

      expect((await markRead(ana, [minha.id])).count).toBe(0);
      expect((await getNotification(ana, minha.id))?.readAt).not.toBeNull();
    });

    it("valida o userId e o id", async () => {
      expect((await failure(getNotification("", "x"))).code).toBe("INVALID_INPUT");
      expect((await failure(getNotification(ana, ""))).code).toBe("INVALID_INPUT");
    });
  });

  describe("listNotifications: o cursor é do próprio usuário", () => {
    it("cursor próprio pagina; cursor de outro usuário ou inexistente é INVALID_INPUT (cursor)", async () => {
      const nova = await notify({ userId: ana, type: "ACCOUNT" }, { now: minute(2) });
      await notify({ userId: ana, type: "ACCOUNT" }, { now: minute(1) });
      const alheia = await notify({ userId: adm, type: "ACCOUNT" });

      const proxima = await listNotifications(ana, { take: 5, cursor: nova.id });
      expect(proxima).toHaveLength(1);

      for (const cursor of [alheia.id, "nao-existe"]) {
        const error = await failure(listNotifications(ana, { cursor }));
        expect(error.code).toBe("INVALID_INPUT");
        expect(error.details).toMatchObject({ field: "cursor" });
      }
    });

    it("sem cursor, nada muda", async () => {
      await notify({ userId: ana, type: "ACCOUNT" });

      expect(await listNotifications(ana)).toHaveLength(1);
      expect(await listNotifications(ana, { cursor: undefined })).toHaveLength(1);
    });
  });
});
