// Constraints físicas do SQLite definidas na migração inicial (A-006 / M-002), exercitadas
// diretamente pelo Prisma, sem as validações de db.js: o que se prova aqui é o banco.
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

describe("constraints do banco (migração init)", () => {
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

    it("libera o slug da raiz depois que o conteúdo é excluído", async () => {
      const first = await rawContent({ title: "A", slug: "intro", authorId: author.id });
      await prisma.content.delete({ where: { id: first.id } });

      await expect(
        rawContent({ title: "B", slug: "intro", authorId: author.id }),
      ).resolves.toMatchObject({ slug: "intro" });
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
