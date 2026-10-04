// Defesa em profundidade da reordenação (RN13, RN19): a rota autoriza item a item ANTES de escrever, e a
// camada de dados ainda restringe o lote ao dono da sessão (`reorderContents(items, { ownerId })`). Esta
// segunda barreira só aparece se o dono do item mudar entre a autorização e a escrita (corrida), o que
// aqui é SIMULADO: a leitura da rota diz que o item é do usuário, mas o banco o tem como de outro dono.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    // Faz a rota acreditar que todo item é do autor que o teste combinar.
    getContentById: vi.fn(async (/** @type {string} */ id) => {
      const real = await /** @type {any} */ (original).getContentById(id);
      const liar = globalThis.__reorderRaceAuthor;
      return real && liar ? { ...real, authorId: liar } : real;
    }),
  };
});

const reorderRoute = await import("@/app/api/contents/reorder/route");
const { createContent, prisma } = await import("@/lib/db");
const { apiRequest, createUserSession, resetDatabase } = await import("./helpers");

beforeEach(async () => {
  await resetDatabase();
  delete (/** @type {any} */ (globalThis).__reorderRaceAuthor);
});

describe("reordenação: a camada de dados também restringe o lote ao dono da sessão", () => {
  it("se o item mudou de dono depois da autorização da rota, o lote falha (404) e nada é movido", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    const beto = await createUserSession({ email: "beto@exemplo.test" });
    const theirs = await createContent({ title: "B", slug: "b", type: "DOCUMENT", authorId: beto.id });
    /** @type {any} */ (globalThis).__reorderRaceAuthor = ana.id; // a rota "lê" o item como da Ana

    const response = await reorderRoute.PATCH(
      apiRequest("/api/contents/reorder", { method: "PATCH", body: [{ id: theirs.id, order: 9 }], cookie: ana.cookie }),
    );

    expect(response.status).toBe(404);
    expect((await prisma.content.findUniqueOrThrow({ where: { id: theirs.id } })).order).toBe(0);
  });

  it("controle: sem a corrida, o item de outro dono é recusado pela rota com 403", async () => {
    const ana = await createUserSession({ email: "ana@exemplo.test" });
    const beto = await createUserSession({ email: "beto@exemplo.test" });
    const theirs = await createContent({ title: "B", slug: "b", type: "DOCUMENT", authorId: beto.id });

    const response = await reorderRoute.PATCH(
      apiRequest("/api/contents/reorder", { method: "PATCH", body: [{ id: theirs.id, order: 9 }], cookie: ana.cookie }),
    );

    expect(response.status).toBe(403);
  });
});
