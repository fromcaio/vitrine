// Integração: imagens como BLOB (ADR-034, ADR-037; RF35, RN29): saveImage, getImage, replaceImage,
// removeImage, deleteImage, deleteOwnedImages, removeAvatar, a exclusão de usuário e o diretório.
// A invariante central: NÃO HÁ IMAGEM ÓRFÃ (linhas de images = referências não nulas).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DataError,
  deleteImage,
  deleteOwnedImages,
  deleteUser,
  getConfiguration,
  getImage,
  getAppearance,
  listNotifications,
  listPublicSpaces,
  prisma,
  removeAvatar,
  removeImage,
  replaceImage,
  saveImage,
  transferContents,
  updateAppearance,
} from "@/lib/db";
import { createUser, failTransactionAt, imageAccounting, rawContent, resetDatabase, sampleImage } from "./helpers.js";

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

/** Nenhuma imagem órfã: tantas linhas em images quantas referências não nulas. */
async function expectNoOrphans() {
  const { images, references } = await imageAccounting();
  expect({ images, references }).toEqual({ images: references, references });
}

describe("db.js: imagens", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    // restaura qualquer $transaction substituído por failTransactionAt
    if (/** @type {any} */ (prisma.$transaction).mockRestore) /** @type {any} */ (prisma.$transaction).mockRestore();
  });

  describe("saveImage e getImage", () => {
    it("grava a linha e devolve os metadados SEM os bytes; getImage devolve o BLOB byte a byte", async () => {
      const ana = await createUser("ana");
      const entrada = sampleImage("ana", { size: 300 });

      const meta = await saveImage({ kind: "avatar", ownerId: ana.id, ...entrada });

      expect(Object.keys(meta).sort()).toEqual(["createdAt", "height", "id", "kind", "mime", "ownerId", "sha256", "width"]);
      expect(meta).toMatchObject({ kind: "avatar", ownerId: ana.id, mime: "image/webp", width: 256, height: 256, sha256: entrada.sha256 });
      expect(meta.id).toMatch(/^[a-z0-9]{20,}$/); // cuid opaco

      const lida = await getImage(meta.id);
      expect(lida).toMatchObject({ id: meta.id, kind: "avatar", mime: "image/webp", sha256: entrada.sha256 });
      expect(Buffer.from(/** @type {Uint8Array} */ (lida?.bytes)).equals(Buffer.from(entrada.bytes))).toBe(true);
      expect(lida?.bytes.byteLength).toBe(300);
    });

    it("aceita um Buffer do Node como bytes", async () => {
      const ana = await createUser("ana");
      const entrada = sampleImage("buffer");

      const meta = await saveImage({ kind: "avatar", ownerId: ana.id, ...entrada, bytes: Buffer.from(entrada.bytes) });

      const lida = await getImage(meta.id);
      expect(Buffer.from(/** @type {Uint8Array} */ (lida?.bytes)).equals(Buffer.from(entrada.bytes))).toBe(true);
    });

    it("getImage de um id inexistente ou vazio devolve null", async () => {
      expect(await getImage("fantasma")).toBeNull();
      expect(await getImage("")).toBeNull();
      expect(await getImage(/** @type {any} */ (undefined))).toBeNull();
    });

    it.each([
      ["tipo fora da lista", { kind: "banner" }, "kind"],
      ["avatar sem dono", { kind: "avatar", ownerId: null }, "ownerId"],
      ["mime que não é de imagem", { mime: "text/html" }, "mime"],
      ["sem bytes", { bytes: undefined }, "bytes"],
      ["bytes vazios", { bytes: new Uint8Array(0) }, "bytes"],
      ["bytes em texto", { bytes: "abc" }, "bytes"],
      ["largura zero", { width: 0 }, "width"],
      ["altura fracionária", { height: 1.5 }, "height"],
      ["sem sha256", { sha256: "" }, "sha256"],
    ])("recusa %s com INVALID_INPUT, sem gravar", async (_nome, trecho, campo) => {
      const ana = await createUser("ana");

      const erro = await failure(saveImage(/** @type {any} */ ({ kind: "avatar", ownerId: ana.id, ...sampleImage("x"), ...trecho })));

      expect(erro).toMatchObject({ code: "INVALID_INPUT", details: { field: campo } });
      expect(await prisma.image.count()).toBe(0);
    });

    it("dono inexistente é recusado pelo banco (AUTHOR_NOT_FOUND)", async () => {
      expect((await failure(saveImage({ kind: "logo", ownerId: "fantasma", ...sampleImage("x") }))).code).toBe("AUTHOR_NOT_FOUND");
    });

    it("o logo e o favicon do site têm dono nulo", async () => {
      const meta = await saveImage({ kind: "logo", ownerId: null, ...sampleImage("site") });

      expect(meta.ownerId).toBeNull();
    });
  });

  describe("replaceImage", () => {
    it("o primeiro avatar é gravado e apontado por User.avatarImageId; replacedId é null", async () => {
      const ana = await createUser("ana");

      const nova = await replaceImage("avatar", ana.id, sampleImage("a1"));

      expect(nova).toMatchObject({ kind: "avatar", ownerId: ana.id, replacedId: null });
      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(nova.id);
      expect("bytes" in nova).toBe(false);
      await expectNoOrphans();
    });

    it("a troca cria outra imagem (id novo), aponta a referência e APAGA a antiga", async () => {
      const ana = await createUser("ana");
      const primeira = await replaceImage("avatar", ana.id, sampleImage("a1"));

      const segunda = await replaceImage("avatar", ana.id, sampleImage("a2"));

      expect(segunda.id).not.toBe(primeira.id);
      expect(segunda.replacedId).toBe(primeira.id);
      expect(await getImage(primeira.id)).toBeNull();
      expect(await getImage(segunda.id)).not.toBeNull();
      expect(await prisma.image.count()).toBe(1);
      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(segunda.id);
      await expectNoOrphans();
    });

    it("várias trocas seguidas deixam uma só imagem por referência", async () => {
      const ana = await createUser("ana");
      for (const n of [1, 2, 3, 4, 5]) await replaceImage("avatar", ana.id, sampleImage(`a${n}`));
      for (const n of [1, 2, 3]) await replaceImage("logo", ana.id, sampleImage(`l${n}`));

      expect(await prisma.image.count()).toBe(2);
      await expectNoOrphans();
    });

    it("o logo e o favicon do SITE ficam em Configuration (criada, se faltar) com dono nulo", async () => {
      expect(await prisma.configuration.count()).toBe(0);

      const logo = await replaceImage("logo", null, sampleImage("logo-site"));
      const favicon = await replaceImage("favicon", null, sampleImage("favicon-site", { mime: "image/png" }));

      expect(await getConfiguration()).toMatchObject({ logoImageId: logo.id, faviconImageId: favicon.id });
      expect(logo.ownerId).toBeNull();
      expect(favicon).toMatchObject({ ownerId: null, mime: "image/png" });
      await expectNoOrphans();
    });

    it("o logo e o favicon do USUÁRIO ficam em Appearance (criada sem preencher o nome) com o dono dele", async () => {
      const ana = await createUser("ana");

      const logo = await replaceImage("logo", ana.id, sampleImage("logo-ana"));
      const favicon = await replaceImage("favicon", ana.id, sampleImage("favicon-ana", { mime: "image/png" }));

      expect(await getAppearance(ana.id)).toMatchObject({ persisted: true, siteName: null, logoImageId: logo.id, faviconImageId: favicon.id });
      expect([logo.ownerId, favicon.ownerId]).toEqual([ana.id, ana.id]);
      await expectNoOrphans();
    });

    it("trocar o logo do usuário não apaga o favicon nem o avatar dele, nem o logo do site", async () => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("avatar"));
      const favicon = await replaceImage("favicon", ana.id, sampleImage("favicon"));
      const logoSite = await replaceImage("logo", null, sampleImage("logo-site"));
      await replaceImage("logo", ana.id, sampleImage("logo-1"));

      await replaceImage("logo", ana.id, sampleImage("logo-2"));

      for (const id of [avatar.id, favicon.id, logoSite.id]) expect(await getImage(id), id).not.toBeNull();
      expect(await prisma.image.count()).toBe(4);
      await expectNoOrphans();
    });

    it("a imagem de um usuário nunca é apontada pela referência de outro", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");

      const daAna = await replaceImage("avatar", ana.id, sampleImage("ana"));
      const daBia = await replaceImage("avatar", bia.id, sampleImage("bia"));

      expect(daAna.ownerId).toBe(ana.id);
      expect(daBia.ownerId).toBe(bia.id);
      expect((await prisma.user.findUnique({ where: { id: bia.id } }))?.avatarImageId).toBe(daBia.id);
      expect(await prisma.image.count()).toBe(2);
    });

    it("usuário inexistente é NOT_FOUND e nada é gravado", async () => {
      expect((await failure(replaceImage("avatar", "fantasma", sampleImage("x")))).code).toBe("NOT_FOUND");
      expect((await failure(replaceImage("logo", "fantasma", sampleImage("x")))).code).toBe("NOT_FOUND");
      expect(await prisma.image.count()).toBe(0);
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("entrada inválida é INVALID_INPUT e preserva a imagem atual", async () => {
      const ana = await createUser("ana");
      const atual = await replaceImage("avatar", ana.id, sampleImage("atual"));

      expect((await failure(replaceImage(/** @type {any} */ ("capa"), ana.id, sampleImage("x")))).code).toBe("INVALID_INPUT");
      expect((await failure(replaceImage("avatar", null, sampleImage("x")))).code).toBe("INVALID_INPUT");
      expect((await failure(replaceImage("avatar", ana.id, /** @type {any} */ ({ ...sampleImage("x"), bytes: null })))).code).toBe("INVALID_INPUT");

      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(atual.id);
      expect(await prisma.image.count()).toBe(1);
    });

    it("é atômica: se a exclusão da antiga falha, a nova NÃO fica gravada e a referência não muda", async () => {
      const ana = await createUser("ana");
      const atual = await replaceImage("avatar", ana.id, sampleImage("atual"));
      const spy = failTransactionAt("image", "deleteMany");

      await expect(replaceImage("avatar", ana.id, sampleImage("nova"))).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(await prisma.image.count()).toBe(1);
      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(atual.id);
      expect(await getImage(atual.id)).not.toBeNull();
      await expectNoOrphans();
    });

    it("é atômica também quando a falha vem ao gravar a nova imagem (nada muda)", async () => {
      const ana = await createUser("ana");
      const atual = await replaceImage("avatar", ana.id, sampleImage("atual"));
      const spy = failTransactionAt("image", "create");

      await expect(replaceImage("avatar", ana.id, sampleImage("nova"))).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(atual.id);
      expect(await prisma.image.count()).toBe(1);
    });
  });

  describe("removeImage", () => {
    it("remove o avatar: anula a referência e apaga a imagem", async () => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));

      expect(await removeImage("avatar", ana.id)).toEqual({ removed: true, id: avatar.id });

      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
      expect(await prisma.image.count()).toBe(0);
    });

    it("remove o logo do site e o favicon do usuário, cada um no seu lugar", async () => {
      const ana = await createUser("ana");
      const logo = await replaceImage("logo", null, sampleImage("logo-site"));
      const favicon = await replaceImage("favicon", ana.id, sampleImage("favicon-ana"));
      const logoAna = await replaceImage("logo", ana.id, sampleImage("logo-ana"));

      expect(await removeImage("logo", null)).toEqual({ removed: true, id: logo.id });
      expect(await removeImage("favicon", ana.id)).toEqual({ removed: true, id: favicon.id });

      expect((await getConfiguration()).logoImageId).toBeNull();
      expect(await getAppearance(ana.id)).toMatchObject({ faviconImageId: null, logoImageId: logoAna.id });
      expect(await prisma.image.count()).toBe(1);
      await expectNoOrphans();
    });

    it("sem imagem, não faz nada (removed=false), inclusive sem linha de Appearance ou de Configuration", async () => {
      const ana = await createUser("ana");

      expect(await removeImage("avatar", ana.id)).toEqual({ removed: false, id: null });
      expect(await removeImage("logo", ana.id)).toEqual({ removed: false, id: null });
      expect(await removeImage("favicon", null)).toEqual({ removed: false, id: null });

      expect(await prisma.appearance.count()).toBe(0);
      expect(await prisma.configuration.count()).toBe(0);
    });

    it("usuário inexistente é NOT_FOUND; tipo inválido é INVALID_INPUT", async () => {
      expect((await failure(removeImage("avatar", "fantasma"))).code).toBe("NOT_FOUND");
      expect((await failure(removeImage(/** @type {any} */ ("capa"), null))).code).toBe("INVALID_INPUT");
      expect((await failure(removeImage("avatar", null))).code).toBe("INVALID_INPUT");
    });
  });

  describe("deleteImage", () => {
    it("apaga pelo id e as referências viram null (SetNull), sem referência pendente", async () => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));
      const logo = await replaceImage("logo", null, sampleImage("l"));

      await deleteImage(avatar.id);
      await deleteImage(logo.id);

      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
      expect((await getConfiguration()).logoImageId).toBeNull();
      expect(await prisma.image.count()).toBe(0);
    });

    it("id inexistente é NOT_FOUND; vazio é INVALID_INPUT", async () => {
      expect((await failure(deleteImage("fantasma"))).code).toBe("NOT_FOUND");
      expect((await failure(deleteImage(""))).code).toBe("INVALID_INPUT");
    });
  });

  describe("deleteOwnedImages", () => {
    it("apaga todas as imagens do dono e só as dele (as de outro usuário e as do site ficam)", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      await replaceImage("logo", ana.id, sampleImage("l-ana"));
      await replaceImage("favicon", ana.id, sampleImage("f-ana"));
      const daBia = await replaceImage("avatar", bia.id, sampleImage("a-bia"));
      const doSite = await replaceImage("logo", null, sampleImage("l-site"));

      expect(await deleteOwnedImages(ana.id)).toEqual({ count: 3 });

      expect(await prisma.image.count({ where: { ownerId: ana.id } })).toBe(0);
      expect(await getImage(daBia.id)).not.toBeNull();
      expect(await getImage(doSite.id)).not.toBeNull();
      await expectNoOrphans();
    });

    it("dono sem imagem: count 0; dono vazio é INVALID_INPUT", async () => {
      const ana = await createUser("ana");

      expect(await deleteOwnedImages(ana.id)).toEqual({ count: 0 });
      expect((await failure(deleteOwnedImages(""))).code).toBe("INVALID_INPUT");
    });
  });

  describe("excluir o usuário apaga as imagens dele (LGPD), na mesma transação", () => {
    it("deleteUser apaga o avatar, o logo e o favicon dele e deixa os dos outros e os do site", async () => {
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      await replaceImage("logo", ana.id, sampleImage("l-ana"));
      await replaceImage("favicon", ana.id, sampleImage("f-ana"));
      const daBia = await replaceImage("avatar", bia.id, sampleImage("a-bia"));
      const doSite = await replaceImage("favicon", null, sampleImage("f-site"));

      await deleteUser(ana.id);

      expect(await prisma.image.count({ where: { ownerId: ana.id } })).toBe(0);
      expect(await prisma.image.count()).toBe(2);
      expect(await getImage(daBia.id)).not.toBeNull();
      expect(await getImage(doSite.id)).not.toBeNull();
      await expectNoOrphans();
    });

    it("com conteúdo transferido, as imagens do excluído saem e as do destino ficam; a transferência não toca nas imagens", async () => {
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await rawContent({ title: "T", slug: "t", authorId: ana.id });
      await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      const daBia = await replaceImage("avatar", bia.id, sampleImage("a-bia"));

      // só transferir (sem excluir): as imagens de ninguém mudam de dono nem somem
      await transferContents(ana.id, bia.id);
      expect(await prisma.image.count({ where: { ownerId: ana.id } })).toBe(1);
      expect(await prisma.image.count({ where: { ownerId: bia.id } })).toBe(1);

      await deleteUser(ana.id, { content: "transfer", to: bia.id });
      expect(await prisma.image.count({ where: { ownerId: ana.id } })).toBe(0);
      expect(await getImage(daBia.id)).not.toBeNull();
      await expectNoOrphans();
    });

    it("se a exclusão do usuário é recusada (último administrador), as imagens dele permanecem", async () => {
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      await replaceImage("avatar", admin.id, sampleImage("a-admin"));

      expect((await failure(deleteUser(admin.id))).code).toBe("LAST_ADMIN");

      expect(await prisma.image.count({ where: { ownerId: admin.id } })).toBe(1);
      await expectNoOrphans();
    });

    it("se a exclusão falha no fim da transação, as imagens permanecem (a limpeza é parte da transação)", async () => {
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      const spy = failTransactionAt("user", "delete");

      await expect(deleteUser(ana.id)).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(await getImage(avatar.id)).not.toBeNull();
      expect(await prisma.user.count({ where: { id: ana.id } })).toBe(1);
    });

    it("a limpeza das imagens é um passo EXPLÍCITO da transação de deleteUser (a cascata do banco é só a rede de segurança)", async () => {
      // O resultado observável é o mesmo com ou sem o passo (a cascata de ownerId apagaria as imagens),
      // por isso o passo é fixado por interceptação: se a transação falha em image.deleteMany, a
      // exclusão inteira é desfeita; sem o passo explícito, nada falharia e o usuário seria excluído.
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      const spy = failTransactionAt("image", "deleteMany");

      await expect(deleteUser(ana.id)).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(await prisma.user.count({ where: { id: ana.id } })).toBe(1);
      expect(await getImage(avatar.id)).not.toBeNull();
    });

    it("a cascata do banco apaga as imagens mesmo se o usuário for removido direto (rede de segurança)", async () => {
      const ana = await createUser("ana");
      await replaceImage("avatar", ana.id, sampleImage("a-ana"));
      await replaceImage("logo", ana.id, sampleImage("l-ana"));

      await prisma.user.delete({ where: { id: ana.id } });

      expect(await prisma.image.count()).toBe(0);
    });
  });

  describe("removeAvatar (moderação do avatar de outro usuário; RN19, RN26)", () => {
    const motivo = "Imagem imprópria.";

    it("apaga o avatar e grava a notificação MODERATION/WARNING com AVATAR_REMOVED e o motivo", async () => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));

      const removido = await removeAvatar(ana.id, { notification: { data: { reason: motivo } } });

      expect(removido).toEqual({ id: avatar.id });
      expect(await prisma.image.count()).toBe(0);
      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
      const [aviso] = await listNotifications(ana.id);
      expect(aviso).toMatchObject({ userId: ana.id, type: "MODERATION", severity: "WARNING", data: { event: "AVATAR_REMOVED", reason: motivo } });
      expect(await prisma.notification.count()).toBe(1);
    });

    it("aceita o pedido completo no molde da moderação de conteúdo (userId, type, severity e event coerentes)", async () => {
      const ana = await createUser("ana");
      await replaceImage("avatar", ana.id, sampleImage("a"));

      await removeAvatar(ana.id, {
        notification: { userId: ana.id, type: "MODERATION", severity: "WARNING", data: { event: "AVATAR_REMOVED", reason: motivo } },
      });

      expect((await listNotifications(ana.id))[0]).toMatchObject({ type: "MODERATION", severity: "WARNING", data: { event: "AVATAR_REMOVED", reason: motivo } });
    });

    it("só o dono do avatar é notificado", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceImage("avatar", ana.id, sampleImage("a"));
      await replaceImage("avatar", bia.id, sampleImage("b"));

      await removeAvatar(ana.id, { notification: { data: { reason: motivo } } });

      expect(await listNotifications(bia.id)).toEqual([]);
      expect((await prisma.user.findUnique({ where: { id: bia.id } }))?.avatarImageId).not.toBeNull();
    });

    it("sem avatar: NOT_FOUND e nenhuma notificação nasce; usuário inexistente também é NOT_FOUND", async () => {
      const ana = await createUser("ana");

      expect((await failure(removeAvatar(ana.id, { notification: { data: { reason: motivo } } }))).code).toBe("NOT_FOUND");
      expect((await failure(removeAvatar("fantasma", { notification: { data: { reason: motivo } } }))).code).toBe("NOT_FOUND");
      expect(await prisma.notification.count()).toBe(0);
    });

    it.each([
      ["sem notificação", undefined],
      ["sem motivo", { data: {} }],
      ["motivo em branco", { data: { reason: "   " } }],
      ["para outro usuário", { userId: "outro", data: { reason: "x" } }],
      ["de outro tipo", { type: "ACCOUNT", data: { reason: "x" } }],
      ["de outra gravidade", { severity: "INFO", data: { reason: "x" } }],
      ["de outro evento", { data: { event: "CONTENT_DELETED", reason: "x" } }],
    ])("notificação %s é INVALID_INPUT e o avatar permanece", async (_nome, notification) => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));

      expect((await failure(removeAvatar(ana.id, /** @type {any} */ ({ notification })))).code).toBe("INVALID_INPUT");

      expect(await getImage(avatar.id)).not.toBeNull();
      expect(await prisma.notification.count()).toBe(0);
    });

    it("é atômica: se a notificação falha, o avatar NÃO é removido", async () => {
      const ana = await createUser("ana");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));
      const spy = failTransactionAt("notification", "create");

      await expect(removeAvatar(ana.id, { notification: { data: { reason: motivo } } })).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(await getImage(avatar.id)).not.toBeNull();
      expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(avatar.id);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe("listPublicSpaces devolve o avatarImageId (diretório; RN28)", () => {
    /** @param {string} name @param {string} handle */
    async function spaceOwner(name, handle) {
      const user = await createUser(name);
      await prisma.user.update({ where: { id: user.id }, data: { handle } });
      await rawContent({ title: "Início", slug: "inicio", authorId: user.id, status: "PUBLISHED" });
      return user;
    }

    it("traz o id do avatar de quem tem e null de quem não tem, sem os bytes", async () => {
      const ana = await spaceOwner("Ana", "ana");
      await spaceOwner("Bia", "bia");
      const avatar = await replaceImage("avatar", ana.id, sampleImage("a"));

      const espacos = await listPublicSpaces();

      expect(espacos.map((e) => [e.handle, e.avatarImageId])).toEqual([
        ["ana", avatar.id],
        ["bia", null],
      ]);
      expect(JSON.stringify(espacos)).not.toContain("bytes");
    });

    it("mantém o nome do espaço como Appearance.siteName ou, sem ele, o nome do usuário (e não o do site)", async () => {
      const ana = await spaceOwner("Ana Souza", "ana");
      await spaceOwner("Bia Lima", "bia");
      await updateAppearance(ana.id, { siteName: "Notas da Ana" });
      await prisma.configuration.create({ data: { siteName: "Nome do Site" } });

      const espacos = await listPublicSpaces();

      expect(espacos.map((e) => [e.handle, e.name])).toEqual([
        ["bia", "Bia Lima"],
        ["ana", "Notas da Ana"],
      ]);
    });

    it("o avatar de quem está suspenso ou sem conteúdo publicado não aparece (o espaço nem é listado)", async () => {
      const ana = await spaceOwner("Ana", "ana");
      await replaceImage("avatar", ana.id, sampleImage("a"));
      await prisma.user.update({ where: { id: ana.id }, data: { banned: true } });

      expect(await listPublicSpaces()).toEqual([]);
    });
  });
});
