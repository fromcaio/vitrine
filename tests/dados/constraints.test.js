// Constraints físicas do SQLite definidas pelas migrações (A-006 / M-002; M15), exercitadas
// diretamente pelo Prisma, sem as validações de db.js: o que se prova aqui é o banco.
// CT35: dono único por árvore (chave estrangeira composta) e unicidade do slug da raiz por dono.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, rawContent, resetDatabase } from "./helpers.js";

/** @param {Promise<unknown>} promise */
async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return /** @type {{ code?: string }} */ (error);
  }
  return null;
}

describe("constraints do banco (migrações init e multiusuário)", () => {
  /** @type {{ id: string }} */
  let author;

  beforeEach(async () => {
    await resetDatabase();
    author = await createUser();
  });

  describe("RN03: unicidade do slug", () => {
    it("rejeita dois conteúdos com o mesmo slug na raiz (índice parcial manual)", async () => {
      await rawContent({ title: "A", slug: "intro", authorId: author.id, parentId: null });

      const error = await rejection(
        rawContent({ title: "B", slug: "intro", authorId: author.id, parentId: null }),
      );

      expect(error?.code).toBe("P2002");
      expect(await prisma.content.count({ where: { slug: "intro", parentId: null } })).toBe(1);
    });

    it("rejeita dois irmãos com o mesmo slug sob o mesmo pai (índice composto)", async () => {
      const pai = await rawContent({ title: "Pai", slug: "pai", authorId: author.id });
      await rawContent({ title: "A", slug: "capitulo", authorId: author.id, parentId: pai.id });

      const error = await rejection(
        rawContent({ title: "B", slug: "capitulo", authorId: author.id, parentId: pai.id }),
      );

      expect(error?.code).toBe("P2002");
      expect(await prisma.content.count({ where: { parentId: pai.id } })).toBe(1);
    });

    it("aceita o mesmo slug sob pais diferentes e entre a raiz e um filho", async () => {
      const a = await rawContent({ title: "A", slug: "a", authorId: author.id });
      const b = await rawContent({ title: "B", slug: "b", authorId: author.id });

      await rawContent({ title: "x1", slug: "x", authorId: author.id, parentId: a.id });
      await rawContent({ title: "x2", slug: "x", authorId: author.id, parentId: b.id });
      await rawContent({ title: "x3", slug: "x", authorId: author.id, parentId: null });

      expect(await prisma.content.count({ where: { slug: "x" } })).toBe(3);
    });

    it("CT35: o mesmo slug na raiz é aceito para donos diferentes e recusado para o mesmo dono", async () => {
      const outro = await createUser("outro");
      await rawContent({ title: "A", slug: "guia", authorId: author.id });

      await expect(rawContent({ title: "B", slug: "guia", authorId: outro.id })).resolves.toMatchObject({
        slug: "guia",
        authorId: outro.id,
      });
      const error = await rejection(rawContent({ title: "C", slug: "guia", authorId: author.id }));

      expect(error?.code).toBe("P2002");
      expect(await prisma.content.count({ where: { slug: "guia", parentId: null } })).toBe(2);
    });

    it("libera o slug da raiz depois que o conteúdo é excluído", async () => {
      const first = await rawContent({ title: "A", slug: "intro", authorId: author.id });
      await prisma.content.delete({ where: { id: first.id } });

      await expect(
        rawContent({ title: "B", slug: "intro", authorId: author.id }),
      ).resolves.toMatchObject({ slug: "intro" });
    });
  });

  describe("RN13: dono único por árvore (chave estrangeira composta)", () => {
    it("CT35: o banco recusa um filho com authorId diferente do pai", async () => {
      const outro = await createUser("outro");
      const pai = await rawContent({ title: "Pai", slug: "pai", authorId: author.id });

      const error = await rejection(
        rawContent({ title: "Filho", slug: "filho", authorId: outro.id, parentId: pai.id }),
      );

      expect(error?.code).toBe("P2003");
      expect(await prisma.content.count({ where: { parentId: pai.id } })).toBe(0);
    });

    it("recusa mudar o authorId de um filho para outro dono, e aceita mantê-lo", async () => {
      const outro = await createUser("outro");
      const pai = await rawContent({ title: "Pai", slug: "pai", authorId: author.id });
      const filho = await rawContent({ title: "F", slug: "f", authorId: author.id, parentId: pai.id });

      const error = await rejection(prisma.content.update({ where: { id: filho.id }, data: { authorId: outro.id } }));

      expect(error?.code).toBe("P2003");
      expect((await prisma.content.findUniqueOrThrow({ where: { id: filho.id } })).authorId).toBe(author.id);
    });

    it("recusa mover um nó para baixo de um pai de outro dono", async () => {
      const outro = await createUser("outro");
      const meu = await rawContent({ title: "Meu", slug: "meu", authorId: author.id });
      const dele = await rawContent({ title: "Dele", slug: "dele", authorId: outro.id });

      const error = await rejection(prisma.content.update({ where: { id: meu.id }, data: { parentId: dele.id } }));

      expect(error?.code).toBe("P2003");
      expect((await prisma.content.findUniqueOrThrow({ where: { id: meu.id } })).parentId).toBeNull();
    });

    it("trocar o authorId da raiz leva os descendentes (cascata) e tudo fica consistente", async () => {
      const outro = await createUser("outro");
      const raiz = await rawContent({ title: "R", slug: "r", authorId: author.id });
      const filho = await rawContent({ title: "F", slug: "f", authorId: author.id, parentId: raiz.id });
      await rawContent({ title: "N", slug: "n", authorId: author.id, parentId: filho.id, type: "DOCUMENT" });

      await prisma.content.update({ where: { id: raiz.id }, data: { authorId: outro.id } });

      const donos = await prisma.content.findMany({ select: { authorId: true } });
      expect(donos).toHaveLength(3);
      expect(donos.every((c) => c.authorId === outro.id)).toBe(true);
      expect(await prisma.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    });

    it("CT36: a transferência falha inteira se o slug da raiz já existe no destino", async () => {
      const outro = await createUser("outro");
      const raiz = await rawContent({ title: "R", slug: "guia", authorId: author.id });
      await rawContent({ title: "F", slug: "f", authorId: author.id, parentId: raiz.id });
      await rawContent({ title: "Já existe", slug: "guia", authorId: outro.id });

      const error = await rejection(prisma.content.update({ where: { id: raiz.id }, data: { authorId: outro.id } }));

      expect(error?.code).toBe("P2002");
      expect(await prisma.content.count({ where: { authorId: author.id } })).toBe(2);
      expect(await prisma.content.count({ where: { authorId: outro.id } })).toBe(1);
    });
  });

  describe("RNF10: autor com Restrict", () => {
    it("bloqueia a exclusão de um usuário que possui conteúdos", async () => {
      await rawContent({ title: "A", slug: "a", authorId: author.id });

      const error = await rejection(prisma.user.delete({ where: { id: author.id } }));

      expect(error).not.toBeNull();
      expect(await prisma.user.count({ where: { id: author.id } })).toBe(1);
      expect(await prisma.content.count({ where: { authorId: author.id } })).toBe(1);
    });

    it("permite excluir um usuário sem conteúdos", async () => {
      const semConteudo = await createUser("sem-conteudo");

      await prisma.user.delete({ where: { id: semConteudo.id } });

      expect(await prisma.user.count({ where: { id: semConteudo.id } })).toBe(0);
    });

    it("permite excluir o usuário depois que o conteúdo dele é excluído", async () => {
      const content = await rawContent({ title: "A", slug: "a", authorId: author.id });
      await prisma.content.delete({ where: { id: content.id } });

      await prisma.user.delete({ where: { id: author.id } });

      expect(await prisma.user.count({ where: { id: author.id } })).toBe(0);
    });
  });

  describe("RN07: exclusão em cascata da hierarquia", () => {
    it("excluir um pai remove os descendentes em todos os níveis", async () => {
      const raiz = await rawContent({ title: "R", slug: "r", authorId: author.id });
      const filho = await rawContent({ title: "F", slug: "f", authorId: author.id, parentId: raiz.id });
      await rawContent({ title: "N", slug: "n", authorId: author.id, parentId: filho.id, type: "DOCUMENT" });
      await rawContent({ title: "Outro", slug: "outro", authorId: author.id });

      await prisma.content.delete({ where: { id: raiz.id } });

      const restantes = await prisma.content.findMany({ select: { slug: true } });
      expect(restantes).toEqual([{ slug: "outro" }]);
    });
  });
});
