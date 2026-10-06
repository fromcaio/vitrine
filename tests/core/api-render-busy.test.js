// Fila cheia do orçamento de renderização nas rotas (A-021, ADR-033): com a fila de validações cheia, o
// `POST` e o `PATCH` de conteúdo e o `PUT /api/configuration` respondem 503 `BUSY` com `Retry-After`, sem
// gravar nada; a leitura nunca passa pelo worker. A fila em si (1 rodando, 3 esperando, a quinta recusada) é
// provada em `render-budget.test.js`; aqui o módulo é substituído por uma fila sempre cheia.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/render-budget", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkRenderable: vi.fn(async () => Promise.reject(new actual.RenderBusyError())) };
});

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as contentsRoute from "@/app/api/contents/route";
import { createContent, getConfiguration, prisma } from "@/lib/db";
import { checkRenderable } from "@/lib/render-budget";
import { aged, apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(checkRenderable).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
});

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;

/** Confere o 503 do mapa de erros: `BUSY`, `Retry-After`, mensagem em português e nada revalidado. */
async function expectBusy(/** @type {Response} */ response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("3");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await errorOf(response)).toMatchObject({
    code: "BUSY",
    message: "Há validações de texto demais em andamento. Tente de novo em instantes.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
}

describe("fila cheia: 503 BUSY com Retry-After, sem gravar nada", () => {
  it("POST /api/contents com corpo", async () => {
    const response = await contentsRoute.POST(
      apiRequest("/api/contents", { method: "POST", body: { title: "A", slug: "a", type: "DOCUMENT", body: "texto" }, cookie: ana.cookie }),
    );

    await expectBusy(response);
    expect(await prisma.content.count()).toBe(0);
  });

  it("PATCH /api/contents/:id que altera o corpo", async () => {
    const mine = aged(await createContent({ title: "T", slug: "t", type: "DOCUMENT", authorId: ana.id, body: "original" }));
    const { id, updatedAt } = await mine;

    const response = await contentRoute.PATCH(
      apiRequest(`/api/contents/${id}`, { method: "PATCH", body: { body: "novo", version: updatedAt.toISOString() }, cookie: ana.cookie }),
      routeContext({ id }),
    );

    await expectBusy(response);
    expect((await prisma.content.findUniqueOrThrow({ where: { id } })).body).toBe("original");
  });

  it("PUT /api/configuration com homeBody", async () => {
    const before = await getConfiguration();

    const response = await configurationRoute.PUT(
      apiRequest("/api/configuration", { method: "PUT", body: { siteName: "Outro", homeBody: "texto" }, cookie: admin.cookie }),
    );

    await expectBusy(response);
    expect((await getConfiguration()).siteName).toBe(before.siteName);
  });

  it("o que não altera o texto nunca pede o worker, então nunca é 503: título, estado, coleção, leitura", async () => {
    const mine = await createContent({ title: "T", slug: "t", type: "DOCUMENT", authorId: ana.id, body: "original" });

    const patch = await contentRoute.PATCH(
      apiRequest(`/api/contents/${mine.id}`, { method: "PATCH", body: { title: "Novo" }, cookie: ana.cookie }),
      routeContext({ id: mine.id }),
    );
    const collection = await contentsRoute.POST(
      apiRequest("/api/contents", { method: "POST", body: { title: "C", slug: "c", type: "COLLECTION" }, cookie: ana.cookie }),
    );
    const read = await contentRoute.GET(apiRequest(`/api/contents/${mine.id}`, { cookie: ana.cookie }), routeContext({ id: mine.id }));
    const config = await configurationRoute.PUT(
      apiRequest("/api/configuration", { method: "PUT", body: { siteName: "Só o nome" }, cookie: admin.cookie }),
    );

    expect([patch.status, collection.status, read.status, config.status]).toEqual([200, 201, 200, 200]);
    expect(checkRenderable).not.toHaveBeenCalled();
  });
});
