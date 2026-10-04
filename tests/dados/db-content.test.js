// Integração: funções de conteúdo de src/lib/db.js contra o SQLite temporário.
// Cobre CT11 (reordenar), CT12 (excluir coleção), CT13 (resolver caminho) e as regras
// RN02, RN03, RN05, RN06, RN07 e RN15 aplicadas no servidor.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DataError,
  createContent,
  deleteContent,
  getContentById,
  getContentByPath,
  getContentTree,
  prisma,
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

describe("db.js: conteúdo", () => {
  /** @type {string} */
  let authorId;

  /**
   * @param {string} slug
   * @param {Record<string, unknown>} [extra]
   */
  const make = (slug, extra = {}) =>
    createContent({ title: slug.toUpperCase(), slug, type: "COLLECTION", authorId, ...extra });

  beforeEach(async () => {
    await resetDatabase();
    authorId = (await createUser()).id;
  });

  describe("createContent", () => {
    it("cria com padrões: PUBLISHED (RN16), corpo nulo e ordem 0 no primeiro irmão", async () => {
      const content = await make("intro");

      expect(content).toMatchObject({
        slug: "intro",
        type: "COLLECTION",
        status: "PUBLISHED",
        body: null,
        order: 0,
        parentId: null,
        authorId,
      });
    });

    it("permite criar já como DRAFT", async () => {
      const content = await make("rascunho", { status: "DRAFT" });
      expect(content.status).toBe("DRAFT");
    });

    it("sem ordem informada, entra no fim do nível (RN05)", async () => {
      const a = await make("a");
      const b = await make("b");
      const filho1 = await make("f1", { parentId: a.id });
      const filho2 = await make("f2", { parentId: a.id });

      expect([a.order, b.order]).toEqual([0, 1]);
      expect([filho1.order, filho2.order]).toEqual([0, 1]);
    });

    it("RN02: o pai deve existir", async () => {
      const error = await failure(make("x", { parentId: "nao-existe" }));
      expect(error.code).toBe("PARENT_NOT_FOUND");
    });

    it("RN02: um DOCUMENT não pode ter filhos", async () => {
      const doc = await make("doc", { type: "DOCUMENT" });

      const error = await failure(make("filho", { parentId: doc.id }));

      expect(error.code).toBe("PARENT_NOT_COLLECTION");
      expect(await prisma.content.count()).toBe(1);
    });

    it("RN02: tipo fora de DOCUMENT/COLLECTION é recusado", async () => {
      const error = await failure(make("x", { type: "PAGE" }));
      expect(error.code).toBe("INVALID_INPUT");
    });

    it("recusa estado inválido, campos obrigatórios vazios e ordem negativa ou fracionária (RN05)", async () => {
      expect((await failure(make("x", { status: "ARCHIVED" }))).code).toBe("INVALID_INPUT");
      expect((await failure(make("x", { title: "  " }))).code).toBe("INVALID_INPUT");
      expect((await failure(make(""))).code).toBe("INVALID_INPUT");
      expect((await failure(make("x", { order: -1 }))).code).toBe("INVALID_INPUT");
      expect((await failure(make("x", { order: 1.5 }))).code).toBe("INVALID_INPUT");
      expect(await prisma.content.count()).toBe(0);
    });

    it("RN03: slug repetido na raiz vira SLUG_CONFLICT", async () => {
      await make("intro");

      const error = await failure(make("intro"));

      expect(error.code).toBe("SLUG_CONFLICT");
      expect(await prisma.content.count()).toBe(1);
    });

    it("RN03: slug repetido entre irmãos vira SLUG_CONFLICT; em pais diferentes é aceito", async () => {
      const a = await make("a");
      const b = await make("b");
      await make("cap", { parentId: a.id });

      expect((await failure(make("cap", { parentId: a.id }))).code).toBe("SLUG_CONFLICT");
      await expect(make("cap", { parentId: b.id })).resolves.toMatchObject({ slug: "cap" });
    });

    it("recusa autor inexistente", async () => {
      const error = await failure(make("x", { authorId: "fantasma" }));
      expect(error.code).toBe("AUTHOR_NOT_FOUND");
    });
  });

  describe("getContentById", () => {
    it("devolve o conteúdo com corpo e estado, inclusive rascunho (painel)", async () => {
      const created = await make("d", { type: "DOCUMENT", body: "# Olá", status: "DRAFT" });

      const found = await getContentById(created.id);

      expect(found).toMatchObject({ id: created.id, body: "# Olá", status: "DRAFT" });
    });

    it("devolve null para id inexistente ou inválido", async () => {
      expect(await getContentById("nao-existe")).toBeNull();
      expect(await getContentById(/** @type {any} */ (undefined))).toBeNull();
    });
  });

  describe("getContentTree", () => {
    it("não carrega o corpo e inclui o status de cada nó (RF26)", async () => {
      await make("a", { body: "texto longo" });

      const [node] = await getContentTree({ ownerId: authorId });

      expect(node).not.toHaveProperty("body");
      expect(node).toMatchObject({ slug: "a", status: "PUBLISHED" });
    });

    it("painel (onlyPublished false) devolve tudo; público poda rascunhos e subárvores (RN15)", async () => {
      const pub = await make("pub");
      await make("doc", { type: "DOCUMENT", parentId: pub.id });
      await make("doc-rasc", { type: "DOCUMENT", parentId: pub.id, status: "DRAFT" });
      const rasc = await make("rasc", { status: "DRAFT" });
      const filhoPub = await make("filho-publicado", { parentId: rasc.id });
      await make("neto", { type: "DOCUMENT", parentId: filhoPub.id });

      const slugs = (/** @type {any[]} */ nodes) =>
        nodes.flatMap((n) => [n.slug, ...slugs(n.children)]);

      expect(slugs(await getContentTree({ ownerId: authorId }))).toEqual(
        expect.arrayContaining(["pub", "doc", "doc-rasc", "rasc", "filho-publicado", "neto"]),
      );
      expect(slugs(await getContentTree({ ownerId: authorId, onlyPublished: true }))).toEqual(["pub", "doc"]);
    });
  });

  describe("getContentByPath (CT13, RN04, RN15)", () => {
    it("resolve um caminho existente e publicado, com o corpo", async () => {
      const c = await make("c");
      const intro = await make("introducao", { parentId: c.id });
      await make("o-que-e-c", { type: "DOCUMENT", parentId: intro.id, body: "# O que é C" });

      const found = await getContentByPath(authorId, ["c", "introducao", "o-que-e-c"], { onlyPublished: true });

      expect(found).toMatchObject({ slug: "o-que-e-c", body: "# O que é C" });
    });

    it("devolve null para caminho inexistente ou entrada inválida", async () => {
      await make("c");

      expect(await getContentByPath(authorId, ["nao-existe"], { onlyPublished: true })).toBeNull();
      expect(await getContentByPath(authorId, ["c", "nao-existe"], { onlyPublished: true })).toBeNull();
      expect(await getContentByPath(authorId, [], { onlyPublished: true })).toBeNull();
      expect(await getContentByPath(authorId, /** @type {any} */ ("c"))).toBeNull();
    });

    it("público: um rascunho resolve para null, e o painel o encontra (RN15)", async () => {
      const c = await make("c");
      await make("rasc", { type: "DOCUMENT", parentId: c.id, status: "DRAFT" });

      expect(await getContentByPath(authorId, ["c", "rasc"], { onlyPublished: true })).toBeNull();
      expect(await getContentByPath(authorId, ["c", "rasc"])).toMatchObject({ slug: "rasc", status: "DRAFT" });
    });

    it("público: um publicado sob ancestral em rascunho resolve para null (RN15)", async () => {
      const rasc = await make("rasc", { status: "DRAFT" });
      await make("filho", { type: "DOCUMENT", parentId: rasc.id });

      expect(await getContentByPath(authorId, ["rasc", "filho"], { onlyPublished: true })).toBeNull();
      expect(await getContentByPath(authorId, ["rasc", "filho"])).toMatchObject({ slug: "filho" });
    });

    it("RN16: voltar a coleção para PUBLISHED reexibe a subárvore sem alterar os descendentes", async () => {
      const c = await make("c", { status: "DRAFT" });
      await make("d", { type: "DOCUMENT", parentId: c.id });
      expect(await getContentByPath(authorId, ["c", "d"], { onlyPublished: true })).toBeNull();

      await updateContent(c.id, { status: "PUBLISHED" });

      expect(await getContentByPath(authorId, ["c", "d"], { onlyPublished: true })).toMatchObject({ slug: "d" });
    });
  });

  describe("updateContent", () => {
    it("atualiza parcialmente, inclusive o status, sem tocar nos demais campos", async () => {
      const c = await make("c", { body: "antigo" });

      const updated = await updateContent(c.id, { title: "Novo título", status: "DRAFT" });

      expect(updated).toMatchObject({ title: "Novo título", status: "DRAFT", slug: "c", body: "antigo" });
    });

    it("ignora campos que não podem mudar (autor, id, datas) e chaves desconhecidas", async () => {
      const outro = await createUser("outro");
      const c = await make("c");

      const updated = await updateContent(c.id, /** @type {any} */ ({ authorId: outro.id, id: "x", foo: 1, title: "T" }));

      expect(updated.authorId).toBe(authorId);
      expect(updated.id).toBe(c.id);
      expect(updated.title).toBe("T");
    });

    it("NOT_FOUND para id inexistente", async () => {
      expect((await failure(updateContent("nao-existe", { title: "x" }))).code).toBe("NOT_FOUND");
    });

    it("RN03: mudar o slug para um já usado entre irmãos vira SLUG_CONFLICT", async () => {
      await make("a");
      const b = await make("b");

      const error = await failure(updateContent(b.id, { slug: "a" }));

      expect(error.code).toBe("SLUG_CONFLICT");
      expect((await getContentById(b.id))?.slug).toBe("b");
    });

    it("mover para outro pai o coloca no fim do novo nível e valida RN02", async () => {
      const a = await make("a");
      const b = await make("b");
      await make("x", { parentId: b.id });
      const doc = await make("d", { type: "DOCUMENT", parentId: a.id });

      const moved = await updateContent(doc.id, { parentId: b.id });
      expect(moved).toMatchObject({ parentId: b.id, order: 1 });

      const folha = await make("folha", { type: "DOCUMENT" });
      expect((await failure(updateContent(a.id, { parentId: folha.id }))).code).toBe("PARENT_NOT_COLLECTION");
      expect((await failure(updateContent(a.id, { parentId: "nao-existe" }))).code).toBe("PARENT_NOT_FOUND");
    });

    it("RN06: não permite mover para si mesmo nem para um descendente", async () => {
      const a = await make("a");
      const b = await make("b", { parentId: a.id });
      const c = await make("c", { parentId: b.id });

      expect((await failure(updateContent(a.id, { parentId: a.id }))).code).toBe("CYCLE");
      expect((await failure(updateContent(a.id, { parentId: b.id }))).code).toBe("CYCLE");
      expect((await failure(updateContent(a.id, { parentId: c.id }))).code).toBe("CYCLE");
      expect((await getContentById(a.id))?.parentId).toBeNull();
    });

    it("permite mover para a raiz (parentId null)", async () => {
      const a = await make("a");
      const b = await make("b", { parentId: a.id });

      const moved = await updateContent(b.id, { parentId: null });

      expect(moved.parentId).toBeNull();
    });

    it("RN02: uma COLLECTION com filhos não vira DOCUMENT; sem filhos pode", async () => {
      const a = await make("a");
      await make("f", { parentId: a.id });
      const vazia = await make("vazia");

      expect((await failure(updateContent(a.id, { type: "DOCUMENT" }))).code).toBe("TYPE_HAS_CHILDREN");
      expect((await updateContent(vazia.id, { type: "DOCUMENT" })).type).toBe("DOCUMENT");
    });

    it("recusa estado e ordem inválidos", async () => {
      const a = await make("a");

      expect((await failure(updateContent(a.id, { status: "X" }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateContent(a.id, { order: -3 }))).code).toBe("INVALID_INPUT");
    });
  });

  describe("deleteContent (CT12, RN07)", () => {
    it("excluir uma coleção remove todos os descendentes e preserva o resto", async () => {
      const raiz = await make("raiz");
      const filho = await make("filho", { parentId: raiz.id });
      await make("neto", { type: "DOCUMENT", parentId: filho.id });
      await make("outro");

      const result = await deleteContent(raiz.id);

      expect(result).toEqual({ id: raiz.id });
      const restantes = await prisma.content.findMany({ select: { slug: true } });
      expect(restantes).toEqual([{ slug: "outro" }]);
    });

    it("excluir um documento não afeta os irmãos", async () => {
      const c = await make("c");
      const d1 = await make("d1", { type: "DOCUMENT", parentId: c.id });
      await make("d2", { type: "DOCUMENT", parentId: c.id });

      await deleteContent(d1.id);

      expect((await prisma.content.findMany({ where: { parentId: c.id } })).map((n) => n.slug)).toEqual(["d2"]);
    });

    it("NOT_FOUND para id inexistente", async () => {
      expect((await failure(deleteContent("nao-existe"))).code).toBe("NOT_FOUND");
    });
  });

  describe("reorderContents (CT11, RN05, RN06)", () => {
    it("persiste a nova ordem e a listagem a respeita", async () => {
      const a = await make("a");
      const b = await make("b");
      const c = await make("c");

      const result = await reorderContents([
        { id: c.id, parentId: null, order: 0 },
        { id: a.id, parentId: null, order: 1 },
        { id: b.id, parentId: null, order: 2 },
      ], { ownerId: authorId });

      expect(result.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
      expect((await getContentTree({ ownerId: authorId })).map((n) => n.slug)).toEqual(["c", "a", "b"]);
    });

    it("move entre pais e reordena no mesmo lote", async () => {
      const a = await make("a");
      const b = await make("b");
      const x = await make("x", { parentId: a.id });
      const y = await make("y", { parentId: a.id });

      await reorderContents([
        { id: y.id, parentId: b.id, order: 0 },
        { id: x.id, parentId: a.id, order: 0 },
      ], { ownerId: authorId });

      const tree = await getContentTree({ ownerId: authorId });
      expect(tree.find((n) => n.slug === "a")?.children.map((n) => n.slug)).toEqual(["x"]);
      expect(tree.find((n) => n.slug === "b")?.children.map((n) => n.slug)).toEqual(["y"]);
    });

    it("parentId omitido mantém o pai atual", async () => {
      const a = await make("a");
      const x = await make("x", { parentId: a.id });
      const y = await make("y", { parentId: a.id });

      await reorderContents([
        { id: y.id, order: 0 },
        { id: x.id, order: 1 },
      ], { ownerId: authorId });

      expect((await getContentTree({ ownerId: authorId }))[0].children.map((n) => n.slug)).toEqual(["y", "x"]);
    });

    it("é transacional: uma falha no meio do lote desfaz tudo", async () => {
      const a = await make("a");
      const b = await make("b");
      const c = await make("c");

      const error = await failure(
        reorderContents([
          { id: a.id, parentId: null, order: 5 },
          { id: b.id, parentId: null, order: 6 },
          { id: c.id, parentId: "nao-existe", order: 7 },
        ], { ownerId: authorId }),
      );

      expect(error.code).toBe("PARENT_NOT_FOUND");
      expect((await prisma.content.findMany({ orderBy: { slug: "asc" } })).map((n) => n.order)).toEqual([0, 1, 2]);
    });

    it("RN06: recusa ciclo, inclusive criado por itens anteriores do mesmo lote, e desfaz tudo", async () => {
      const a = await make("a");
      const b = await make("b");

      const error = await failure(
        reorderContents([
          { id: b.id, parentId: a.id, order: 0 }, // b passa a filho de a
          { id: a.id, parentId: b.id, order: 0 }, // a sob b fecharia o ciclo
        ], { ownerId: authorId }),
      );

      expect(error.code).toBe("CYCLE");
      expect((await getContentById(b.id))?.parentId).toBeNull();
    });

    it("RN02: recusa mover para um DOCUMENT", async () => {
      const a = await make("a");
      const doc = await make("d", { type: "DOCUMENT" });

      const error = await failure(reorderContents([{ id: a.id, parentId: doc.id, order: 0 }], { ownerId: authorId }));

      expect(error.code).toBe("PARENT_NOT_COLLECTION");
    });

    it("RN03: um slug que colide no destino desfaz o lote", async () => {
      const a = await make("a");
      const b = await make("b");
      await make("x", { parentId: a.id });
      const xRaiz = await make("x");

      const error = await failure(
        reorderContents([
          { id: b.id, parentId: null, order: 9 },
          { id: xRaiz.id, parentId: a.id, order: 0 },
        ], { ownerId: authorId }),
      );

      expect(error.code).toBe("SLUG_CONFLICT");
      expect((await getContentById(b.id))?.order).toBe(1);
    });

    it("RN05: recusa ordem inválida, id desconhecido, ids repetidos e lote que não é lista", async () => {
      const a = await make("a");

      expect((await failure(reorderContents([{ id: a.id, order: -1 }], { ownerId: authorId }))).code).toBe("INVALID_INPUT");
      expect((await failure(reorderContents([{ id: "nao-existe", order: 0 }], { ownerId: authorId }))).code).toBe("NOT_FOUND");
      expect(
        (await failure(reorderContents([{ id: a.id, order: 0 }, { id: a.id, order: 1 }], { ownerId: authorId }))).code,
      ).toBe("INVALID_INPUT");
      expect((await failure(reorderContents(/** @type {any} */ ("x"), { ownerId: authorId }))).code).toBe("INVALID_INPUT");
    });

    it("lote vazio não faz nada", async () => {
      await expect(reorderContents([], { ownerId: authorId })).resolves.toEqual([]);
    });
  });
});
