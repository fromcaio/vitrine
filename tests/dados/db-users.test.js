// Integração: usuários, papéis, exclusão atômica e diretório de espaços em src/lib/db.js
// (M15; RN19 a RN24, RN28; CT36). Dados fictícios, banco temporário.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DataError,
  changeUserRole,
  clearMustChangePassword,
  countActiveAdmins,
  createContent,
  deleteUser,
  getContentTree,
  getUserByHandle,
  listPublicSpaces,
  prisma,
  setMustChangePassword,
  updateAppearance,
  updateUserProfile,
} from "@/lib/db";
import { resetDatabase } from "./helpers.js";

const NOW = new Date("2026-10-04T12:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const FUTURE = new Date("2026-11-01T00:00:00Z");

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

let seq = 0;
/** Cria um usuário fictício com os campos de conta informados. @param {string} name @param {Record<string, unknown>} [extra] */
function makeUser(name, extra = {}) {
  seq += 1;
  return prisma.user.create({
    data: /** @type {any} */ ({ name, email: `${name}-${seq}@exemplo.test`, emailVerified: true, ...extra }),
  });
}

/** @param {string} authorId @param {string} slug @param {Record<string, unknown>} [extra] */
const content = (authorId, slug, extra = {}) =>
  createContent({ title: slug.toUpperCase(), slug, type: "COLLECTION", authorId, ...extra });

describe("db.js: usuários", () => {
  beforeEach(resetDatabase);

  describe("getUserByHandle (RN20, RN23)", () => {
    it("devolve os campos públicos do usuário, sem e-mail", async () => {
      const ana = await makeUser("ana", { handle: "ana", role: "admin", image: "https://exemplo.test/a.png" });

      expect(await getUserByHandle("ana")).toEqual({
        id: ana.id,
        name: "ana",
        handle: "ana",
        role: "admin",
        image: "https://exemplo.test/a.png",
      });
    });

    it("handle vazio, inexistente ou que não é texto resulta em null", async () => {
      await makeUser("ana", { handle: "ana" });

      expect(await getUserByHandle("")).toBeNull();
      expect(await getUserByHandle("outro")).toBeNull();
      expect(await getUserByHandle("ANA")).toBeNull(); // o valor chega normalizado
      expect(await getUserByHandle(/** @type {any} */ (null))).toBeNull();
      expect(await getUserByHandle(/** @type {any} */ (42))).toBeNull();
    });

    it("suspenso sem prazo e suspenso com prazo vigente resultam em null", async () => {
      await makeUser("sem-prazo", { handle: "sem-prazo", banned: true });
      await makeUser("vigente", { handle: "vigente", banned: true, banExpires: FUTURE });

      expect(await getUserByHandle("sem-prazo", { now: NOW })).toBeNull();
      expect(await getUserByHandle("vigente", { now: NOW })).toBeNull();
    });

    it("suspensão com prazo vencido: o usuário volta a ser visível, mesmo com banned=true no banco (RN23)", async () => {
      const vencida = await makeUser("vencida", { handle: "vencida", banned: true, banExpires: PAST });

      expect(await getUserByHandle("vencida", { now: NOW })).toMatchObject({ id: vencida.id });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: vencida.id } })).banned).toBe(true);
    });

    it("includeSuspended devolve também a conta suspensa (pré-verificação de unicidade do handle)", async () => {
      const suspensa = await makeUser("suspensa", { handle: "suspensa", banned: true });

      expect(await getUserByHandle("suspensa", { now: NOW, includeSuspended: true })).toMatchObject({ id: suspensa.id });
    });
  });

  describe("countActiveAdmins (RN22)", () => {
    it("conta só administradores não suspensos, e a suspensão vencida não conta como suspensão", async () => {
      await makeUser("a1", { role: "admin" });
      await makeUser("a2", { role: "admin", banned: true, banExpires: PAST }); // vencida: ativo
      await makeUser("a3", { role: "admin", banned: true, banExpires: FUTURE }); // vigente: inativo
      await makeUser("a4", { role: "admin", banned: true }); // sem prazo: inativo
      await makeUser("u1", { role: "user" });

      expect(await countActiveAdmins({ now: NOW })).toBe(2);
    });

    it("sem administradores, devolve 0", async () => {
      await makeUser("u1");

      expect(await countActiveAdmins()).toBe(0);
    });
  });

  describe("updateUserProfile e changeUserRole: o último administrador (RN22)", () => {
    it("rebaixar o único administrador ativo é LAST_ADMIN e o papel não muda", async () => {
      const unico = await makeUser("unico", { role: "admin" });
      await makeUser("comum");

      const error = await failure(changeUserRole(unico.id, "user", { now: NOW }));

      expect(error.code).toBe("LAST_ADMIN");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: unico.id } })).role).toBe("admin");
    });

    it("com outro administrador ativo, rebaixar funciona; o outro passa a ser o último", async () => {
      const a = await makeUser("a", { role: "admin" });
      const b = await makeUser("b", { role: "admin" });

      await expect(changeUserRole(a.id, "user", { now: NOW })).resolves.toMatchObject({ id: a.id, role: "user" });
      expect((await failure(changeUserRole(b.id, "user", { now: NOW }))).code).toBe("LAST_ADMIN");
    });

    it("o outro administrador suspenso (prazo vigente) não conta como ativo; com prazo vencido, conta", async () => {
      const a = await makeUser("a", { role: "admin" });
      const b = await makeUser("b", { role: "admin", banned: true, banExpires: FUTURE });

      expect((await failure(changeUserRole(a.id, "user", { now: NOW }))).code).toBe("LAST_ADMIN");

      await prisma.user.update({ where: { id: b.id }, data: { banExpires: PAST } });

      await expect(changeUserRole(a.id, "user", { now: NOW })).resolves.toMatchObject({ role: "user" });
    });

    it("suspender o último administrador ativo é LAST_ADMIN; havendo outro, a suspensão passa", async () => {
      const a = await makeUser("a", { role: "admin" });

      const error = await failure(
        updateUserProfile(a.id, { banned: true, banReason: "teste", banExpires: FUTURE }, { now: NOW }),
      );
      expect(error.code).toBe("LAST_ADMIN");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).banned).toBe(false);

      await makeUser("b", { role: "admin" });
      const suspenso = await updateUserProfile(a.id, { banned: true, banReason: "teste", banExpires: FUTURE.toISOString() }, { now: NOW });
      expect(suspenso).toMatchObject({ banned: true, banReason: "teste" });
      expect(suspenso.banExpires?.toISOString()).toBe(FUTURE.toISOString());
    });

    it("promover um usuário nunca é recusado, e editar só o nome do último administrador também não", async () => {
      const a = await makeUser("a", { role: "admin" });
      const u = await makeUser("u");

      await expect(changeUserRole(u.id, "admin", { now: NOW })).resolves.toMatchObject({ role: "admin" });
      await changeUserRole(u.id, "user", { now: NOW });
      await expect(updateUserProfile(a.id, { name: "Novo nome" }, { now: NOW })).resolves.toMatchObject({
        name: "Novo nome",
        role: "admin",
      });
    });

    it("dois rebaixamentos simultâneos de dois administradores: exatamente um passa (guarda na transação)", async () => {
      const a = await makeUser("a", { role: "admin" });
      const b = await makeUser("b", { role: "admin" });

      const results = await Promise.allSettled([changeUserRole(a.id, "user"), changeUserRole(b.id, "user")]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(/** @type {any} */ (rejected[0]).reason.code).toBe("LAST_ADMIN");
      expect(await countActiveAdmins()).toBe(1);
    });
  });

  describe("updateUserProfile: validação e conflitos", () => {
    it("handle repetido é USER_CONFLICT com details.field = handle, e nada muda", async () => {
      await makeUser("ana", { handle: "ana" });
      const bia = await makeUser("bia");

      const error = await failure(updateUserProfile(bia.id, { handle: "ana", name: "Bia 2" }));

      expect(error.code).toBe("USER_CONFLICT");
      expect(error.details).toEqual({ field: "handle" });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: bia.id } })).toMatchObject({ handle: null, name: "bia" });
    });

    it("handle e imagem vazios viram null (o administrador remove o handle)", async () => {
      const ana = await makeUser("ana", { handle: "ana", image: "https://exemplo.test/a.png" });

      const atualizado = await updateUserProfile(ana.id, { handle: "", image: "  " });

      expect(atualizado).toMatchObject({ handle: null, image: null });
    });

    it("recusa nome vazio, papel fora do domínio, booleano e data inválidos", async () => {
      const ana = await makeUser("ana");

      expect((await failure(updateUserProfile(ana.id, { name: " " }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateUserProfile(ana.id, { role: /** @type {any} */ ("root") }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateUserProfile(ana.id, { banned: /** @type {any} */ ("sim") }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateUserProfile(ana.id, { banExpires: "amanhã" }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateUserProfile(ana.id, { handle: /** @type {any} */ (5) }))).code).toBe("INVALID_INPUT");
    });

    it("usuário inexistente é NOT_FOUND; um pedido vazio devolve a conta sem alterá-la; chaves desconhecidas são ignoradas", async () => {
      const ana = await makeUser("ana");

      expect((await failure(updateUserProfile("fantasma", { name: "x" }))).code).toBe("NOT_FOUND");
      expect((await failure(changeUserRole("fantasma", "user"))).code).toBe("NOT_FOUND");
      expect(await updateUserProfile(ana.id, {})).toMatchObject({ id: ana.id, name: "ana" });
      const antes = await prisma.user.findUniqueOrThrow({ where: { id: ana.id } });
      await updateUserProfile(ana.id, /** @type {any} */ ({ email: "troca@exemplo.test", mustChangePassword: true }));
      expect(await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).toEqual(antes);
    });
  });

  describe("senha provisória (RN21)", () => {
    it("setMustChangePassword liga e clearMustChangePassword desliga o marcador", async () => {
      const ana = await makeUser("ana");

      expect(await setMustChangePassword(ana.id, true)).toEqual({ id: ana.id, mustChangePassword: true });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).mustChangePassword).toBe(true);
      expect(await clearMustChangePassword(ana.id)).toEqual({ id: ana.id, mustChangePassword: false });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).mustChangePassword).toBe(false);
    });

    it("usuário inexistente é NOT_FOUND", async () => {
      expect((await failure(clearMustChangePassword("fantasma"))).code).toBe("NOT_FOUND");
      expect((await failure(setMustChangePassword("fantasma", true))).code).toBe("NOT_FOUND");
    });
  });

  describe("deleteUser (RN22, RN24; CT36)", () => {
    /** Usuário com sessão, conta, aparência, notificação e verificação pendente. @param {string} name @param {Record<string, unknown>} [extra] */
    async function withAccount(name, extra = {}) {
      const user = await makeUser(name, extra);
      await prisma.session.create({
        data: { token: `tok-${user.id}`, expiresAt: FUTURE, userId: user.id },
      });
      await prisma.account.create({
        data: { accountId: user.id, providerId: "credential", userId: user.id, password: "hash-ficticio" },
      });
      await updateAppearance(user.id, { siteName: `Site de ${name}` });
      await prisma.notification.create({ data: { userId: user.id, type: "ACCOUNT", data: "{}" } });
      await prisma.verification.create({ data: { identifier: user.email, value: "v", expiresAt: FUTURE } });
      return user;
    }

    /** @param {string} userId */
    async function footprint(userId) {
      return {
        user: await prisma.user.count({ where: { id: userId } }),
        sessions: await prisma.session.count({ where: { userId } }),
        accounts: await prisma.account.count({ where: { userId } }),
        appearances: await prisma.appearance.count({ where: { ownerId: userId } }),
        notifications: await prisma.notification.count({ where: { userId } }),
        contents: await prisma.content.count({ where: { authorId: userId } }),
      };
    }

    it("sem conteúdo, apaga a conta inteira: sessões, credencial, aparência, notificações e verificação", async () => {
      const user = await withAccount("ana");
      expect(await footprint(user.id)).toEqual({ user: 1, sessions: 1, accounts: 1, appearances: 1, notifications: 1, contents: 0 });

      const result = await deleteUser(user.id, { now: NOW });

      expect(result).toEqual({ id: user.id, content: "none", roots: 0, renamed: [] });
      expect(await footprint(user.id)).toEqual({ user: 0, sessions: 0, accounts: 0, appearances: 0, notifications: 0, contents: 0 });
      expect(await prisma.verification.count({ where: { identifier: user.email } })).toBe(0);
    });

    it("com conteúdo e sem escolha: USER_HAS_CONTENT, e nada é apagado (nem a credencial)", async () => {
      const user = await withAccount("ana");
      await content(user.id, "guia");
      await content(user.id, "outra");

      const error = await failure(deleteUser(user.id, { now: NOW }));

      expect(error.code).toBe("USER_HAS_CONTENT");
      expect(error.details).toEqual({ owned: 2 });
      expect(await footprint(user.id)).toEqual({ user: 1, sessions: 1, accounts: 1, appearances: 1, notifications: 1, contents: 2 });
    });

    it("transferir: a árvore inteira vai ao destino, com os descendentes, e a conta some", async () => {
      const ana = await withAccount("ana");
      const bia = await withAccount("bia");
      const guia = await content(ana.id, "guia");
      const intro = await content(ana.id, "intro", { parentId: guia.id });
      await content(ana.id, "detalhe", { parentId: intro.id, type: "DOCUMENT", body: "texto" });
      await content(ana.id, "outra");

      const result = await deleteUser(ana.id, { content: "transfer", to: bia.id, now: NOW });

      expect(result).toEqual({ id: ana.id, content: "transferred", roots: 2, renamed: [] });
      expect((await footprint(ana.id)).user).toBe(0);
      const arvore = await getContentTree({ ownerId: bia.id });
      expect(arvore.map((n) => n.slug)).toEqual(["guia", "outra"]);
      expect(arvore[0].children[0].children.map((n) => n.slug)).toEqual(["detalhe"]);
      expect(await prisma.content.count({ where: { authorId: bia.id } })).toBe(4);
      expect(await prisma.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    });

    it("transferir com conflito de slug na raiz do destino recusa TUDO (atômico): usuário, credencial e conteúdo intactos (CT36)", async () => {
      const ana = await withAccount("ana");
      const bia = await withAccount("bia");
      const guiaAna = await content(ana.id, "guia");
      await content(ana.id, "filho", { parentId: guiaAna.id, type: "DOCUMENT" });
      await content(ana.id, "unica");
      await content(bia.id, "guia");

      const error = await failure(deleteUser(ana.id, { content: "transfer", to: bia.id, now: NOW }));

      expect(error.code).toBe("SLUG_CONFLICT");
      expect(error.details).toEqual({ conflicts: ["guia"] });
      expect(await footprint(ana.id)).toEqual({ user: 1, sessions: 1, accounts: 1, appearances: 1, notifications: 1, contents: 3 });
      expect(await prisma.content.count({ where: { authorId: bia.id } })).toBe(1);
    });

    it("transferir com onConflict 'rename': a raiz conflitante ganha sufixo, sem colidir com os já usados", async () => {
      const ana = await withAccount("ana");
      const bia = await withAccount("bia");
      await content(ana.id, "guia");
      await content(ana.id, "unica");
      await content(bia.id, "guia");
      await content(bia.id, "guia-2"); // o primeiro sufixo livre é -3

      const result = await deleteUser(ana.id, { content: "transfer", to: bia.id, onConflict: "rename", now: NOW });

      expect(result.renamed).toEqual([{ id: expect.any(String), from: "guia", to: "guia-3" }]);
      expect((await getContentTree({ ownerId: bia.id })).map((n) => n.slug).sort()).toEqual(["guia", "guia-2", "guia-3", "unica"]);
      expect((await footprint(ana.id)).user).toBe(0);
    });

    it("o sufixo de renomeação respeita o limite de 80 caracteres do slug (RN03)", async () => {
      const ana = await makeUser("ana");
      const bia = await makeUser("bia");
      const longo = "a".repeat(80);
      await content(ana.id, longo);
      await content(bia.id, longo);

      const result = await deleteUser(ana.id, { content: "transfer", to: bia.id, onConflict: "rename", now: NOW });

      expect(result.renamed[0].to).toBe(`${"a".repeat(78)}-2`);
      expect(result.renamed[0].to).toHaveLength(80);
    });

    it("excluir junto: o conteúdo todo é apagado (cascata) e a conta some", async () => {
      const ana = await withAccount("ana");
      const bia = await withAccount("bia");
      const guia = await content(ana.id, "guia");
      await content(ana.id, "filho", { parentId: guia.id, type: "DOCUMENT" });
      await content(bia.id, "da-bia");

      const result = await deleteUser(ana.id, { content: "delete", now: NOW });

      expect(result).toEqual({ id: ana.id, content: "deleted", roots: 1, renamed: [] });
      expect(await footprint(ana.id)).toEqual({ user: 0, sessions: 0, accounts: 0, appearances: 0, notifications: 0, contents: 0 });
      expect((await footprint(bia.id)).contents).toBe(1);
    });

    it("destino inválido: ele mesmo (INVALID_INPUT), inexistente (AUTHOR_NOT_FOUND) ou ausente (INVALID_INPUT); nada muda", async () => {
      const ana = await withAccount("ana");
      await content(ana.id, "guia");

      expect((await failure(deleteUser(ana.id, { content: "transfer", to: ana.id, now: NOW }))).code).toBe("INVALID_INPUT");
      expect((await failure(deleteUser(ana.id, { content: "transfer", to: "fantasma", now: NOW }))).code).toBe("AUTHOR_NOT_FOUND");
      expect((await failure(deleteUser(ana.id, /** @type {any} */ ({ content: "transfer", now: NOW })))).code).toBe("INVALID_INPUT");
      expect((await failure(deleteUser(ana.id, /** @type {any} */ ({ content: "mover", now: NOW })))).code).toBe("INVALID_INPUT");
      expect(await footprint(ana.id)).toMatchObject({ user: 1, sessions: 1, accounts: 1, contents: 1 });
    });

    it("usuário inexistente é NOT_FOUND", async () => {
      expect((await failure(deleteUser("fantasma"))).code).toBe("NOT_FOUND");
    });

    it("o último administrador ativo não pode ser excluído (LAST_ADMIN), mas, havendo outro, pode (RN22)", async () => {
      const a = await withAccount("a", { role: "admin" });
      const b = await withAccount("b", { role: "admin" });

      const error = await failure(deleteUser(a.id, { now: NOW }).then(() => deleteUser(b.id, { now: NOW })));

      expect(error.code).toBe("LAST_ADMIN");
      expect((await footprint(a.id)).user).toBe(0);
      expect(await footprint(b.id)).toMatchObject({ user: 1, sessions: 1, accounts: 1 });
    });

    it("um usuário comum pode ser excluído mesmo sendo o único usuário restante além do administrador", async () => {
      await makeUser("admin", { role: "admin" });
      const comum = await withAccount("comum");

      await expect(deleteUser(comum.id, { now: NOW })).resolves.toMatchObject({ content: "none" });
    });
  });

  describe("listPublicSpaces: o diretório do portal (RN28)", () => {
    it("inclui só quem tem handle, não está suspenso e tem ao menos uma raiz publicada", async () => {
      const ok = await makeUser("ok", { handle: "ok" });
      await content(ok.id, "guia");
      const semHandle = await makeUser("sem-handle");
      await content(semHandle.id, "guia");
      const suspenso = await makeUser("suspenso", { handle: "suspenso", banned: true, banExpires: FUTURE });
      await content(suspenso.id, "guia");
      const venceu = await makeUser("venceu", { handle: "venceu", banned: true, banExpires: PAST });
      await content(venceu.id, "guia");
      await makeUser("vazio", { handle: "vazio" });
      const rascunhos = await makeUser("rascunhos", { handle: "rascunhos" });
      await content(rascunhos.id, "guia", { status: "DRAFT" });
      const sobRascunho = await makeUser("sob-rascunho", { handle: "sob-rascunho" });
      const raizRascunho = await content(sobRascunho.id, "guia", { status: "DRAFT" });
      await content(sobRascunho.id, "filho", { parentId: raizRascunho.id, type: "DOCUMENT" });

      const espacos = await listPublicSpaces({ now: NOW });

      expect(espacos.map((e) => e.handle)).toEqual(["ok", "venceu"]);
    });

    it("ordena pelo nome de exibição do espaço (siteName da aparência ou o nome do usuário), sem distinguir caixa e acentos", async () => {
      const zeca = await makeUser("Zeca", { handle: "zeca" });
      await content(zeca.id, "g");
      const africa = await makeUser("África", { handle: "africa" });
      await content(africa.id, "g");
      const bia = await makeUser("bia", { handle: "bia" });
      await content(bia.id, "g");
      const caio = await makeUser("Caio", { handle: "caio" });
      await content(caio.id, "g");
      await updateAppearance(caio.id, { siteName: "Algoritmos do Caio", siteDescription: "Notas de aula" });

      const espacos = await listPublicSpaces({ now: NOW });

      expect(espacos.map((e) => e.name)).toEqual(["África", "Algoritmos do Caio", "bia", "Zeca"]);
      expect(espacos.find((e) => e.handle === "caio")).toMatchObject({
        id: caio.id,
        description: "Notas de aula",
        name: "Algoritmos do Caio",
      });
      expect(espacos.find((e) => e.handle === "bia")?.description).toBeNull();
    });

    it("sem nenhum espaço, devolve lista vazia", async () => {
      expect(await listPublicSpaces()).toEqual([]);
    });
  });
});
