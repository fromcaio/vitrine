// Integração: a página inicial editável (P-031; M26, ADR-040, RN35 a RN37) em src/lib/db.js:
// getHome, updateHome, homeStatus na configuração, unpublishHome e removeHome (moderação com a
// notificação na MESMA transação).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DataError,
  getConfiguration,
  getHome,
  prisma,
  removeAvatar,
  removeHome,
  replaceImage,
  unpublishHome,
  updateAppearance,
  updateConfiguration,
  updateHome,
} from "@/lib/db";
import { createUser, failTransactionAt, resetDatabase, sampleImage } from "./helpers.js";

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

const DEFAULTS = { homeBody: null, homeStatus: "PUBLISHED", homeShowItems: true };
const aviso = (/** @type {string} */ reason = "Motivo da moderação") => ({ data: { reason } });
const notificationsOf = (/** @type {string} */ userId) => prisma.notification.findMany({ where: { userId } });

describe("db.js: página inicial editável (M26)", () => {
  /** @type {string} */
  let ana;

  beforeEach(async () => {
    await resetDatabase();
    ana = (await createUser("ana")).id;
  });

  afterEach(() => {
    // restaura qualquer $transaction substituído por failTransactionAt
    vi.restoreAllMocks();
  });

  describe("getHome", () => {
    it("sem linha de Appearance devolve os padrões e NÃO escreve nada", async () => {
      expect(await getHome(ana)).toEqual(DEFAULTS);
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("para um dono inexistente também devolve os padrões, sem escrever", async () => {
      expect(await getHome("nao-existe")).toEqual(DEFAULTS);
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("rejeita ownerId vazio", async () => {
      expect((await failure(getHome(""))).code).toBe("INVALID_INPUT");
    });

    it("lê o que foi gravado", async () => {
      await updateHome(ana, { homeBody: "Olá", homeStatus: "DRAFT", homeShowItems: false });
      expect(await getHome(ana)).toEqual({ homeBody: "Olá", homeStatus: "DRAFT", homeShowItems: false });
    });
  });

  describe("updateHome", () => {
    it("cria a linha sob demanda, devolve o formato do getHome e deixa as cores nulas", async () => {
      const home = await updateHome(ana, { homeBody: "# Início" });
      expect(home).toEqual({ homeBody: "# Início", homeStatus: "PUBLISHED", homeShowItems: true });
      const row = await prisma.appearance.findUnique({ where: { ownerId: ana } });
      expect(row).toMatchObject({
        primaryColor: null, secondaryColor: null, accentColor: null,
        darkPrimaryColor: null, darkSecondaryColor: null, darkAccentColor: null,
      });
    });

    it("é parcial: cada campo muda sozinho e os outros permanecem", async () => {
      await updateHome(ana, { homeBody: "Texto", homeStatus: "DRAFT", homeShowItems: false });
      expect(await updateHome(ana, { homeStatus: "PUBLISHED" })).toEqual({ homeBody: "Texto", homeStatus: "PUBLISHED", homeShowItems: false });
      expect(await updateHome(ana, { homeShowItems: true })).toEqual({ homeBody: "Texto", homeStatus: "PUBLISHED", homeShowItems: true });
      expect(await updateHome(ana, { homeBody: "Outro" })).toEqual({ homeBody: "Outro", homeStatus: "PUBLISHED", homeShowItems: true });
    });

    it.each(["", "   ", "\n\t "])("homeBody vazio ou só espaços (%j) vira null, nunca a cadeia vazia", async (empty) => {
      await updateHome(ana, { homeBody: "Texto" });
      expect((await updateHome(ana, { homeBody: empty })).homeBody).toBeNull();
      expect((await prisma.appearance.findUnique({ where: { ownerId: ana } }))?.homeBody).toBeNull();
    });

    it("homeBody null limpa o texto", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      expect((await updateHome(ana, { homeBody: null })).homeBody).toBeNull();
    });

    it("o limite é em bytes UTF-8, não em caracteres", async () => {
      const limits = { maxBodyBytes: 10 };
      expect((await updateHome(ana, { homeBody: "a".repeat(10) }, { limits })).homeBody).toHaveLength(10);
      expect((await updateHome(ana, { homeBody: "ação!" }, { limits })).homeBody).toBe("ação!"); // 5 caracteres, 7 bytes
      const error = await failure(updateHome(ana, { homeBody: "ééééé" + "é" }, { limits })); // 6 caracteres, 12 bytes
      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect(error.details).toMatchObject({ quota: "body", bytes: 12, max: 10 });
      expect((await getHome(ana)).homeBody).toBe("ação!");
    });

    it("sem limits usa o padrão da cota (RN25)", async () => {
      expect((await failure(updateHome(ana, { homeBody: "x".repeat(64 * 1024 + 1) }))).code).toBe("QUOTA_EXCEEDED");
    });

    it("nenhum campo: INVALID_INPUT", async () => {
      expect((await failure(updateHome(ana, {}))).code).toBe("INVALID_INPUT");
      expect((await failure(updateHome(ana, { homeBody: undefined }))).code).toBe("INVALID_INPUT");
      expect(await prisma.appearance.count()).toBe(0);
    });

    it.each([
      ["campo desconhecido", { homeBody: "x", extra: 1 }, "extra"],
      ["cor (não é desta função)", { primaryColor: "#000000" }, "primaryColor"],
      ["homeBody de tipo errado", { homeBody: 42 }, "homeBody"],
      ["homeStatus fora do conjunto", { homeStatus: "ARCHIVED" }, "homeStatus"],
      ["homeStatus em minúsculas", { homeStatus: "draft" }, "homeStatus"],
      ["homeShowItems de tipo errado", { homeShowItems: "true" }, "homeShowItems"],
      ["homeShowItems nulo", { homeShowItems: null }, "homeShowItems"],
    ])("%s: INVALID_INPUT com o field", async (_nome, patch, field) => {
      const error = await failure(updateHome(ana, /** @type {any} */ (patch)));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.details).toMatchObject({ field });
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("um pedido que não é objeto: INVALID_INPUT", async () => {
      expect((await failure(updateHome(ana, /** @type {any} */ (null)))).code).toBe("INVALID_INPUT");
      expect((await failure(updateHome(ana, /** @type {any} */ ("x")))).code).toBe("INVALID_INPUT");
    });

    it("dono inexistente: NOT_FOUND, e nenhuma linha nasce", async () => {
      expect((await failure(updateHome("nao-existe", { homeBody: "x" }))).code).toBe("NOT_FOUND");
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("a regra das cores segue intacta: updateAppearance continua exigindo as três, e gravar a página não toca as cores", async () => {
      await updateAppearance(ana, { primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333" });
      await updateHome(ana, { homeBody: "Texto" });
      expect(await prisma.appearance.findUnique({ where: { ownerId: ana } })).toMatchObject({
        primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333", darkPrimaryColor: null, homeBody: "Texto",
      });
      const error = await failure(updateAppearance(ana, { primaryColor: null }));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.details).toMatchObject({ field: "lightPalette" });
      expect((await getHome(ana)).homeBody).toBe("Texto");
    });

    it("updateAppearance não mexe na página inicial", async () => {
      await updateHome(ana, { homeBody: "Texto", homeStatus: "DRAFT", homeShowItems: false });
      await updateAppearance(ana, { siteName: "Notas" });
      expect(await getHome(ana)).toEqual({ homeBody: "Texto", homeStatus: "DRAFT", homeShowItems: false });
    });
  });

  describe("Configuration.homeStatus (portal)", () => {
    it("o padrão é PUBLISHED, e getConfiguration o devolve", async () => {
      expect((await getConfiguration()).homeStatus).toBe("PUBLISHED");
    });

    it("updateConfiguration aceita PUBLISHED e DRAFT, sem mexer no resto", async () => {
      await updateConfiguration({ homeBody: "Portal", siteName: "Meu Site" });
      expect(await updateConfiguration({ homeStatus: "DRAFT" })).toMatchObject({ homeStatus: "DRAFT", homeBody: "Portal", siteName: "Meu Site" });
      expect(await updateConfiguration({ homeStatus: "PUBLISHED" })).toMatchObject({ homeStatus: "PUBLISHED", homeBody: "Portal" });
    });

    it("recusa valor fora do conjunto", async () => {
      const error = await failure(updateConfiguration({ homeStatus: /** @type {any} */ ("ARCHIVED") }));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.details).toMatchObject({ field: "homeStatus" });
    });

    it("homeBody vazio ou só espaços vira null", async () => {
      await updateConfiguration({ homeBody: "Portal" });
      expect((await updateConfiguration({ homeBody: "  \n " })).homeBody).toBeNull();
      await updateConfiguration({ homeBody: "Portal" });
      expect((await updateConfiguration({ homeBody: "" })).homeBody).toBeNull();
    });
  });

  describe("unpublishHome (moderação)", () => {
    it("passa a DRAFT e grava a notificação do dono, com o evento fixo", async () => {
      await updateHome(ana, { homeBody: "Texto", homeShowItems: false });
      const home = await unpublishHome(ana, { notification: aviso("Conteúdo impróprio") });
      expect(home).toEqual({ homeBody: "Texto", homeStatus: "DRAFT", homeShowItems: false });
      const notifications = await notificationsOf(ana);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ userId: ana, type: "MODERATION", severity: "WARNING" });
      expect(JSON.parse(notifications[0].data)).toEqual({ event: "HOME_UNPUBLISHED", reason: "Conteúdo impróprio" });
    });

    it("é atômica: se a notificação falha, o estado não muda", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      failTransactionAt("notification", "create");
      await expect(unpublishHome(ana, { notification: aviso() })).rejects.toThrow("falha injetada");
      vi.restoreAllMocks();
      expect((await getHome(ana)).homeStatus).toBe("PUBLISHED");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("sem texto: NOT_FOUND e nenhuma notificação (nem linha de Appearance)", async () => {
      expect((await failure(unpublishHome(ana, { notification: aviso() }))).code).toBe("NOT_FOUND");
      await updateHome(ana, { homeShowItems: false }); // linha existe, mas sem texto
      expect((await failure(unpublishHome(ana, { notification: aviso() }))).code).toBe("NOT_FOUND");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("já em rascunho: NOT_FOUND e nenhuma notificação nova", async () => {
      await updateHome(ana, { homeBody: "Texto", homeStatus: "DRAFT" });
      expect((await failure(unpublishHome(ana, { notification: aviso() }))).code).toBe("NOT_FOUND");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("usuário inexistente: NOT_FOUND", async () => {
      expect((await failure(unpublishHome("nao-existe", { notification: aviso() }))).code).toBe("NOT_FOUND");
    });

    it("o reason é obrigatório, e a notificação também", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      for (const options of [
        {},
        { notification: null },
        { notification: {} },
        { notification: { data: {} } },
        { notification: { data: { reason: "  " } } },
      ]) {
        expect((await failure(unpublishHome(ana, /** @type {any} */ (options)))).code).toBe("INVALID_INPUT");
      }
      expect((await getHome(ana)).homeStatus).toBe("PUBLISHED");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("o pedido não pode contradizer o fixado (usuário, tipo, gravidade, evento)", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      const outro = (await createUser("bia")).id;
      for (const notification of [
        { userId: outro, data: { reason: "x" } },
        { type: "ACCOUNT", data: { reason: "x" } },
        { severity: "INFO", data: { reason: "x" } },
        { data: { reason: "x", event: "HOME_REMOVED" } },
      ]) {
        expect((await failure(unpublishHome(ana, { notification: /** @type {any} */ (notification) }))).code).toBe("INVALID_INPUT");
      }
      expect((await getHome(ana)).homeStatus).toBe("PUBLISHED");
      // o que coincide com o fixado é aceito
      await unpublishHome(ana, { notification: { userId: ana, type: "MODERATION", severity: "WARNING", data: { reason: "x", event: "HOME_UNPUBLISHED" } } });
      expect((await getHome(ana)).homeStatus).toBe("DRAFT");
    });

    it("republicar (updateHome) volta a PUBLISHED", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      await unpublishHome(ana, { notification: aviso() });
      expect((await updateHome(ana, { homeStatus: "PUBLISHED" })).homeStatus).toBe("PUBLISHED");
    });
  });

  describe("removeHome (moderação)", () => {
    it("anula o texto, mantém o estado e o interruptor, e grava a notificação", async () => {
      await updateHome(ana, { homeBody: "Texto", homeStatus: "DRAFT", homeShowItems: false });
      const home = await removeHome(ana, { notification: aviso("Spam") });
      expect(home).toEqual({ homeBody: null, homeStatus: "DRAFT", homeShowItems: false });
      const notifications = await notificationsOf(ana);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ type: "MODERATION", severity: "WARNING" });
      expect(JSON.parse(notifications[0].data)).toEqual({ event: "HOME_REMOVED", reason: "Spam" });
    });

    it("também remove um texto publicado", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      expect(await removeHome(ana, { notification: aviso() })).toEqual({ homeBody: null, homeStatus: "PUBLISHED", homeShowItems: true });
    });

    it("é atômica: se a notificação falha, o texto permanece", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      failTransactionAt("notification", "create");
      await expect(removeHome(ana, { notification: aviso() })).rejects.toThrow("falha injetada");
      vi.restoreAllMocks();
      expect((await getHome(ana)).homeBody).toBe("Texto");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("sem texto: NOT_FOUND e nenhuma notificação; usuário inexistente: NOT_FOUND", async () => {
      expect((await failure(removeHome(ana, { notification: aviso() }))).code).toBe("NOT_FOUND");
      await updateHome(ana, { homeShowItems: false });
      expect((await failure(removeHome(ana, { notification: aviso() }))).code).toBe("NOT_FOUND");
      expect((await failure(removeHome("nao-existe", { notification: aviso() }))).code).toBe("NOT_FOUND");
      expect(await notificationsOf(ana)).toHaveLength(0);
    });

    it("reason obrigatório e evento fixo", async () => {
      await updateHome(ana, { homeBody: "Texto" });
      expect((await failure(removeHome(ana, { notification: { data: {} } }))).code).toBe("INVALID_INPUT");
      expect((await failure(removeHome(ana, { notification: { data: { reason: "x", event: "HOME_UNPUBLISHED" } } }))).code).toBe("INVALID_INPUT");
      expect((await getHome(ana)).homeBody).toBe("Texto");
    });
  });

  describe("a moderação do avatar segue funcionando com o validador generalizado", () => {
    it("removeAvatar grava AVATAR_REMOVED e recusa evento trocado", async () => {
      await replaceImage("avatar", ana, sampleImage("avatar-ana"));
      await failure(removeAvatar(ana, { notification: { data: { reason: "x", event: "HOME_REMOVED" } } }));
      await removeAvatar(ana, { notification: aviso("Foto imprópria") });
      const [notification] = await notificationsOf(ana);
      expect(JSON.parse(notification.data)).toEqual({ event: "AVATAR_REMOVED", reason: "Foto imprópria" });
    });
  });
});
