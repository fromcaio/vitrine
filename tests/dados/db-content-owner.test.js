// Integração: conteúdo por dono em src/lib/db.js (M15; RN03, RN13, RN15, RN18, RN25, ADR-028).
// Cobre a árvore por dono, o dono do pai, as cotas em bytes, a versão esperada (CT53, parte de
// dados), a reordenação restrita ao dono, o uso do dono e os caminhos públicos (ADR-030).
import { beforeEach, describe, expect, it } from "vitest";
import {
  DataError,
  createContent,
  getContentById,
  getContentByPath,
  getContentTree,
  getContentUsage,
  getPublicPaths,
  reorderContents,
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

describe("db.js: conteúdo por dono", () => {
  /** @type {string} */
  let ana;
  /** @type {string} */
  let bia;

  /** @param {string} authorId @param {string} slug @param {Record<string, unknown>} [extra] */
  const make = (authorId, slug, extra = {}) =>
    createContent({ title: slug.toUpperCase(), slug, type: "COLLECTION", authorId, ...extra });

  beforeEach(async () => {
    await resetDatabase();
    ana = (await createUser("ana")).id;
    bia = (await createUser("bia")).id;
  });

  describe("árvore e caminho por dono (RN03, RN04)", () => {
    it("cada dono vê só a própria árvore, e dois donos podem ter raízes com o mesmo slug", async () => {
      const guiaAna = await make(ana, "guia");
      await make(ana, "intro", { parentId: guiaAna.id, type: "DOCUMENT" });
      const guiaBia = await make(bia, "guia");
      await make(bia, "outro", { parentId: guiaBia.id, type: "DOCUMENT" });

      const treeAna = await getContentTree({ ownerId: ana });
      const treeBia = await getContentTree({ ownerId: bia });

      expect(treeAna.map((n) => [n.slug, n.children.map((c) => c.slug)])).toEqual([["guia", ["intro"]]]);
      expect(treeBia.map((n) => [n.slug, n.children.map((c) => c.slug)])).toEqual([["guia", ["outro"]]]);
      expect(treeAna[0].id).toBe(guiaAna.id);
      expect(treeBia[0].id).toBe(guiaBia.id);
    });

    it("o mesmo slug na raiz do mesmo dono é recusado (SLUG_CONFLICT) e o de outro dono é aceito", async () => {
      await make(ana, "guia");

      expect((await failure(make(ana, "guia"))).code).toBe("SLUG_CONFLICT");
      await expect(make(bia, "guia")).resolves.toMatchObject({ slug: "guia", authorId: bia });
    });

    it("a ordem dos irmãos é por dono: a raiz de cada um começa em 0 (RN05)", async () => {
      expect((await make(ana, "a1")).order).toBe(0);
      expect((await make(ana, "a2")).order).toBe(1);
      expect((await make(bia, "b1")).order).toBe(0);
    });

    it("getContentByPath resolve o caminho na árvore do dono, sem enxergar a de outro", async () => {
      const guiaAna = await make(ana, "guia");
      await make(ana, "intro", { parentId: guiaAna.id, type: "DOCUMENT", body: "texto da ana" });
      const guiaBia = await make(bia, "guia");
      await make(bia, "intro", { parentId: guiaBia.id, type: "DOCUMENT", body: "texto da bia" });
      await make(bia, "so-da-bia", { parentId: guiaBia.id, type: "DOCUMENT" });

      expect((await getContentByPath(ana, ["guia", "intro"]))?.body).toBe("texto da ana");
      expect((await getContentByPath(bia, ["guia", "intro"]))?.body).toBe("texto da bia");
      expect(await getContentByPath(ana, ["guia", "so-da-bia"])).toBeNull();
    });

    it("sem dono, getContentByPath lança INVALID_INPUT, e getContentTree rejeita um dono vazio", async () => {
      expect((await failure(getContentByPath(/** @type {any} */ (undefined), ["guia"]))).code).toBe("INVALID_INPUT");
      expect((await failure(getContentTree({ ownerId: "" }))).code).toBe("INVALID_INPUT");
    });

    it("getContentTree com onlyPublished poda rascunhos e sua subárvore, por dono (RN15)", async () => {
      const raiz = await make(ana, "raiz");
      const rascunho = await make(ana, "rascunho", { parentId: raiz.id, status: "DRAFT" });
      await make(ana, "filho", { parentId: rascunho.id, type: "DOCUMENT" });
      await make(bia, "outra");

      const publica = await getContentTree({ ownerId: ana, onlyPublished: true });
      const completa = await getContentTree({ ownerId: ana });

      expect(publica[0].children).toEqual([]);
      expect(completa[0].children.map((c) => c.slug)).toEqual(["rascunho"]);
      expect(completa[0].children[0].children.map((c) => c.slug)).toEqual(["filho"]);
    });

    it("ownerId é obrigatório: sem dono (ou sem opções), getContentTree lança INVALID_INPUT (A-016)", async () => {
      await make(ana, "a");
      await make(bia, "b");

      expect((await failure(getContentTree(/** @type {any} */ ({})))).code).toBe("INVALID_INPUT");
      expect((await failure(getContentTree(/** @type {any} */ ({ onlyPublished: true })))).code).toBe("INVALID_INPUT");
      expect((await failure(getContentTree(/** @type {any} */ (undefined)))).code).toBe("INVALID_INPUT");
    });
  });

  describe("createContent: o dono do pai (RN13)", () => {
    it("recusa um pai de outro dono com OWNER_MISMATCH e não cria nada", async () => {
      const paiDaBia = await make(bia, "pai");

      const error = await failure(make(ana, "filho", { parentId: paiDaBia.id }));

      expect(error.code).toBe("OWNER_MISMATCH");
      expect(error.details).toMatchObject({ parentId: paiDaBia.id });
      expect((await getContentTree({ ownerId: bia }))[0].children).toEqual([]);
      expect(await getContentTree({ ownerId: ana })).toEqual([]);
    });

    it("um pai inexistente continua PARENT_NOT_FOUND e um pai que é DOCUMENT, PARENT_NOT_COLLECTION", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT" });

      expect((await failure(make(ana, "x", { parentId: "fantasma" }))).code).toBe("PARENT_NOT_FOUND");
      expect((await failure(make(ana, "y", { parentId: doc.id }))).code).toBe("PARENT_NOT_COLLECTION");
    });

    it("um autor inexistente continua AUTHOR_NOT_FOUND", async () => {
      expect((await failure(make("fantasma", "x"))).code).toBe("AUTHOR_NOT_FOUND");
    });

    it("recusa um corpo que não é texto", async () => {
      expect((await failure(make(ana, "x", { body: 42 }))).code).toBe("INVALID_INPUT");
    });
  });

  describe("cotas (RN25)", () => {
    it("recusa o conteúdo que passa do limite do dono, dentro da transação, sem criar nada", async () => {
      const limits = { maxContentsPerUser: 3 };
      for (const slug of ["a", "b", "c"]) {
        await createContent({ title: slug, slug, type: "DOCUMENT", authorId: ana }, { limits });
      }

      const error = await failure(createContent({ title: "D", slug: "d", type: "DOCUMENT", authorId: ana }, { limits }));

      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect(error.details).toMatchObject({ quota: "contents", total: 3, max: 3 });
      expect((await getContentUsage(ana)).contents).toBe(3);
    });

    it("a cota é por dono: encher a de um não impede o outro", async () => {
      const limits = { maxContentsPerUser: 1 };
      await createContent({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana }, { limits });

      await expect(createContent({ title: "B", slug: "b", type: "DOCUMENT", authorId: bia }, { limits })).resolves.toMatchObject({
        authorId: bia,
      });
    });

    it("rascunhos contam na cota (qualquer estado)", async () => {
      const limits = { maxContentsPerUser: 1 };
      await createContent({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana, status: "DRAFT" }, { limits });

      expect(
        (await failure(createContent({ title: "B", slug: "b", type: "DOCUMENT", authorId: ana }, { limits }))).code,
      ).toBe("QUOTA_EXCEEDED");
    });

    it("mede o corpo em bytes UTF-8: 'ç' conta 2 bytes, então 128 KiB de 'ç' cabem e +1 byte não", async () => {
      const limits = { maxBodyBytes: 256 * 1024 };
      const cabe = "ç".repeat(131_072); // 262.144 bytes, 131.072 caracteres
      const passa = `${cabe}a`; // 262.145 bytes

      await expect(
        createContent({ title: "Cabe", slug: "cabe", type: "DOCUMENT", authorId: ana, body: cabe }, { limits }),
      ).resolves.toMatchObject({ slug: "cabe" });
      const error = await failure(
        createContent({ title: "Passa", slug: "passa", type: "DOCUMENT", authorId: ana, body: passa }, { limits }),
      );

      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect(error.details).toMatchObject({ quota: "body", bytes: 262_145, max: 262_144 });
      expect(cabe.length).toBeLessThan(262_144); // por caracteres, passaria: é o byte que vale
    });

    it("sem limites informados valem os padrões (RN25)", async () => {
      const corpo = "a".repeat(262_145);

      expect(
        (await failure(createContent({ title: "G", slug: "g", type: "DOCUMENT", authorId: ana, body: corpo }))).code,
      ).toBe("QUOTA_EXCEEDED");
    });

    it("updateContent também aplica a cota do corpo, e só quando o corpo muda", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT", body: "ok" });

      const error = await failure(updateContent(doc.id, { body: "ç".repeat(60) }, { limits: { maxBodyBytes: 100 } }));
      await expect(updateContent(doc.id, { title: "Novo" }, { limits: { maxBodyBytes: 1 } })).resolves.toMatchObject({
        title: "Novo",
      });

      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect((await getContentById(doc.id))?.body).toBe("ok");
    });

    it("trinta criações simultâneas com cota 10 criam exatamente 10", async () => {
      const limits = { maxContentsPerUser: 10 };

      const results = await Promise.allSettled(
        Array.from({ length: 30 }, (_, i) =>
          createContent({ title: `T${i}`, slug: `t-${i}`, type: "DOCUMENT", authorId: ana }, { limits }),
        ),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
      expect(
        results.filter((r) => r.status === "rejected").every((r) => /** @type {any} */ (r).reason.code === "QUOTA_EXCEEDED"),
      ).toBe(true);
      expect((await getContentUsage(ana)).contents).toBe(10);
    });

    it("getContentUsage soma a contagem e os bytes UTF-8 dos corpos do dono, só do dono", async () => {
      await make(ana, "a", { type: "DOCUMENT", body: "ação" });
      await make(ana, "b", { type: "DOCUMENT", body: "xy" });
      await make(ana, "c");
      await make(bia, "z", { type: "DOCUMENT", body: "não conta" });

      expect(await getContentUsage(ana)).toEqual({ contents: 3, bodyBytes: 8 });
      expect(await getContentUsage((await createUser("sem")).id)).toEqual({ contents: 0, bodyBytes: 0 });
    });
  });

  describe("updateContent: o dono e a versão (RN13, RN18)", () => {
    it("recusa mover para baixo de um pai de outro dono (OWNER_MISMATCH) e nada muda", async () => {
      const meu = await make(ana, "meu");
      const dele = await make(bia, "dele");

      const error = await failure(updateContent(meu.id, { parentId: dele.id }));

      expect(error.code).toBe("OWNER_MISMATCH");
      expect((await getContentById(meu.id))?.parentId).toBeNull();
    });

    it("o ciclo é detectado na árvore do próprio dono (RN06) e mover dentro do dono segue funcionando", async () => {
      const a = await make(ana, "a");
      const b = await make(ana, "b", { parentId: a.id });
      const c = await make(ana, "c");

      expect((await failure(updateContent(a.id, { parentId: b.id }))).code).toBe("CYCLE");
      await expect(updateContent(c.id, { parentId: b.id })).resolves.toMatchObject({ parentId: b.id, authorId: ana });
    });

    it("VERSION_CONFLICT: o conteúdo mudou depois da versão aberta; devolve a versão atual e não altera nada (CT53)", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT", body: "v1" });
      const aberta = doc.updatedAt; // a versão que o autor abriu
      await new Promise((resolve) => setTimeout(resolve, 5));
      const outra = await updateContent(doc.id, { body: "v2 de outra aba" });

      const error = await failure(updateContent(doc.id, { body: "v2 minha" }, { expectedVersion: aberta }));

      expect(error.code).toBe("VERSION_CONFLICT");
      expect(error.details).toEqual({ id: doc.id, currentVersion: outra.updatedAt.toISOString() });
      expect((await getContentById(doc.id))?.body).toBe("v2 de outra aba");
    });

    it("com a versão atual, a escrita passa e a versão avança; aceita Date e texto ISO", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT", body: "v1" });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const v2 = await updateContent(doc.id, { body: "v2" }, { expectedVersion: doc.updatedAt });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const v3 = await updateContent(doc.id, { body: "v3" }, { expectedVersion: v2.updatedAt.toISOString() });

      expect(v2.body).toBe("v2");
      expect(v3.body).toBe("v3");
      expect(v3.updatedAt.getTime()).toBeGreaterThan(v2.updatedAt.getTime());
    });

    it("sem expectedVersion a função não verifica (quem o exige é a rota do Core)", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT", body: "v1" });
      await updateContent(doc.id, { body: "v2" });

      await expect(updateContent(doc.id, { body: "v3" })).resolves.toMatchObject({ body: "v3" });
    });

    it("a versão é conferida mesmo sem mudança de campos, e uma versão inválida é INVALID_INPUT", async () => {
      const doc = await make(ana, "doc", { type: "DOCUMENT" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await updateContent(doc.id, { title: "Mudou" });

      expect((await failure(updateContent(doc.id, {}, { expectedVersion: doc.updatedAt }))).code).toBe("VERSION_CONFLICT");
      expect((await failure(updateContent(doc.id, {}, { expectedVersion: "ontem" }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateContent("fantasma", {}, { expectedVersion: doc.updatedAt }))).code).toBe("NOT_FOUND");
    });
  });

  describe("reorderContents por dono (RN05, RN13)", () => {
    it("com ownerId, reordena os itens do dono", async () => {
      const a = await make(ana, "a");
      const b = await make(ana, "b");

      await reorderContents(
        [
          { id: a.id, order: 1 },
          { id: b.id, order: 0 },
        ],
        { ownerId: ana },
      );

      expect((await getContentTree({ ownerId: ana })).map((n) => n.slug)).toEqual(["b", "a"]);
    });

    it("com ownerId, um item de outro dono responde NOT_FOUND e o lote inteiro é desfeito", async () => {
      const minha = await make(ana, "minha");
      const dela = await make(bia, "dela");

      const error = await failure(
        reorderContents(
          [
            { id: minha.id, order: 5 },
            { id: dela.id, order: 0 },
          ],
          { ownerId: ana },
        ),
      );

      expect(error.code).toBe("NOT_FOUND");
      expect((await getContentById(minha.id))?.order).toBe(0);
    });

    it("com ownerId, mover para baixo de um pai de outro dono é OWNER_MISMATCH; pai inexistente, PARENT_NOT_FOUND", async () => {
      const minha = await make(ana, "minha");
      const dela = await make(bia, "dela");

      const outroDono = await failure(reorderContents([{ id: minha.id, parentId: dela.id, order: 0 }], { ownerId: ana }));
      const fantasma = await failure(reorderContents([{ id: minha.id, parentId: "fantasma", order: 0 }], { ownerId: ana }));

      expect(outroDono.code).toBe("OWNER_MISMATCH");
      expect(fantasma.code).toBe("PARENT_NOT_FOUND");
    });

    it("ownerId é obrigatório: sem dono, reorderContents lança INVALID_INPUT e nada muda (A-016)", async () => {
      const a = await make(ana, "a");
      const b = await make(ana, "b");
      const lote = [{ id: a.id, order: 5 }];

      expect((await failure(reorderContents(lote, /** @type {any} */ ({})))).code).toBe("INVALID_INPUT");
      expect((await failure(reorderContents(lote, /** @type {any} */ (undefined)))).code).toBe("INVALID_INPUT");
      expect((await failure(reorderContents(lote, { ownerId: "" }))).code).toBe("INVALID_INPUT");
      expect((await failure(reorderContents([], /** @type {any} */ ({})))).code).toBe("INVALID_INPUT");
      expect((await getContentTree({ ownerId: ana })).map((n) => [n.id, n.order])).toEqual([[a.id, 0], [b.id, 1]]);
    });

    it("mover dentro do dono segue valendo (RN02, RN06)", async () => {
      const pasta = await make(ana, "pasta");
      const doc = await make(ana, "doc", { type: "DOCUMENT" });

      await reorderContents([{ id: doc.id, parentId: pasta.id, order: 0 }], { ownerId: ana });

      expect((await getContentById(doc.id))?.parentId).toBe(pasta.id);
    });
  });

  describe("getPublicPaths (ADR-030, RN15)", () => {
    /** @returns {Promise<Record<string, string>>} ids por slug, do dono Ana */
    async function seed() {
      const guia = await make(ana, "guia");
      const intro = await make(ana, "intro", { parentId: guia.id });
      const detalhe = await make(ana, "detalhe", { parentId: intro.id, type: "DOCUMENT" });
      const rascunho = await make(ana, "rascunho", { parentId: guia.id, status: "DRAFT" });
      const filhoDeRascunho = await make(ana, "filho-de-rascunho", { parentId: rascunho.id, type: "DOCUMENT" });
      const oculta = await make(ana, "oculta", { status: "DRAFT" });
      const deBia = await make(bia, "guia");
      return {
        guia: guia.id,
        intro: intro.id,
        detalhe: detalhe.id,
        rascunho: rascunho.id,
        filhoDeRascunho: filhoDeRascunho.id,
        oculta: oculta.id,
        deBia: deBia.id,
      };
    }

    it("sem nó, devolve os caminhos públicos de todo o espaço do dono, na ordem da árvore", async () => {
      await seed();

      expect(await getPublicPaths(ana)).toEqual([["guia"], ["guia", "intro"], ["guia", "intro", "detalhe"]]);
    });

    it("de um nó, devolve o dele e os dos descendentes, com a cadeia desde a raiz", async () => {
      const id = await seed();

      expect(await getPublicPaths(ana, id.intro)).toEqual([["guia", "intro"], ["guia", "intro", "detalhe"]]);
      expect(await getPublicPaths(ana, id.detalhe)).toEqual([["guia", "intro", "detalhe"]]);
    });

    it("rascunho, filho de rascunho, nó inexistente e nó de outro dono não têm caminho público", async () => {
      const id = await seed();

      expect(await getPublicPaths(ana, id.rascunho)).toEqual([]);
      expect(await getPublicPaths(ana, id.filhoDeRascunho)).toEqual([]);
      expect(await getPublicPaths(ana, id.oculta)).toEqual([]);
      expect(await getPublicPaths(ana, "fantasma")).toEqual([]);
      expect(await getPublicPaths(ana, id.deBia)).toEqual([]);
    });

    it("reflete a renomeação e a despublicação (antes e depois, como o Core as usa)", async () => {
      const id = await seed();
      const antes = await getPublicPaths(ana, id.intro);

      await updateContent(id.intro, { slug: "apresentacao" });
      const depois = await getPublicPaths(ana, id.intro);
      await updateContent(id.intro, { status: "DRAFT" });
      const despublicado = await getPublicPaths(ana, id.intro);

      expect(antes).toEqual([["guia", "intro"], ["guia", "intro", "detalhe"]]);
      expect(depois).toEqual([["guia", "apresentacao"], ["guia", "apresentacao", "detalhe"]]);
      expect(despublicado).toEqual([]);
    });

    it("exige o dono", async () => {
      expect((await failure(getPublicPaths(/** @type {any} */ (""), null))).code).toBe("INVALID_INPUT");
    });
  });
});
