// Barreira real da API (RF21, RN01; CT04): toda rota de conteúdo e de configuração exige sessão
// válida no servidor. Os Route Handlers são chamados diretamente, isto é, SEM passar pelo Proxy:
// a recusa não depende dele.
import "./env";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as reorderRoute from "@/app/api/contents/reorder/route";
import * as contentsRoute from "@/app/api/contents/route";
import { createContent, prisma } from "@/lib/db";
import { apiRequest, authRequest, createAdminSession, resetContent, routeContext, signIn } from "./helpers";

/** @type {string} */
let adminId;
/** @type {import("@/generated/prisma/client").Content} */
let existing;

beforeAll(async () => {
  ({ userId: adminId } = await createAdminSession());
});

beforeEach(async () => {
  await resetContent();
  existing = await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: adminId, body: "original" });
  vi.mocked(revalidatePath).mockClear();
});

const newContent = { title: "Novo", slug: "novo", type: "DOCUMENT" };

/**
 * Todas as rotas do contrato (Cap. 5 §5.10) que exigem sessão; `call` recebe as opções de
 * `apiRequest` (cookie e cabeçalhos) e executa o handler.
 * @type {Array<[string, (options?: { cookie?: string, headers?: Record<string, string> }) => Promise<Response>]>}
 */
const writeRoutes = [
  ["POST /api/contents", (o) => contentsRoute.POST(apiRequest("/api/contents", { method: "POST", body: newContent, ...o }))],
  [
    "PATCH /api/contents/:id",
    (o) =>
      contentRoute.PATCH(
        apiRequest(`/api/contents/${existing.id}`, { method: "PATCH", body: { body: "alterado" }, ...o }),
        routeContext({ id: existing.id }),
      ),
  ],
  [
    "DELETE /api/contents/:id",
    (o) =>
      contentRoute.DELETE(
        apiRequest(`/api/contents/${existing.id}`, { method: "DELETE", ...o }),
        routeContext({ id: existing.id }),
      ),
  ],
  [
    "PATCH /api/contents/reorder",
    (o) =>
      reorderRoute.PATCH(
        apiRequest("/api/contents/reorder", { method: "PATCH", body: [{ id: existing.id, order: 9 }], ...o }),
      ),
  ],
  [
    "PUT /api/configuration",
    (o) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body: { siteName: "Invadido" }, ...o })),
  ],
];

/** @type {typeof writeRoutes} */
const readRoutes = [
  ["GET /api/contents", (o) => contentsRoute.GET(apiRequest("/api/contents", o))],
  [
    "GET /api/contents/:id",
    (o) => contentRoute.GET(apiRequest(`/api/contents/${existing.id}`, o), routeContext({ id: existing.id })),
  ],
  ["GET /api/configuration", (o) => configurationRoute.GET(apiRequest("/api/configuration", o))],
];

/** O banco continua como o `beforeEach` deixou. */
async function expectNothingChanged() {
  const rows = await prisma.content.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: existing.id, body: "original", order: existing.order });
  expect(await prisma.configuration.count()).toBe(0);
  expect(revalidatePath).not.toHaveBeenCalled();
}

async function expectUnauthenticated(response) {
  expect(response.status).toBe(401);
  const { error } = await response.json();
  expect(error.code).toBe("UNAUTHENTICATED");
  expect(error.details).toEqual([]);
}

describe("CT04: rotas de escrita sem sessão respondem 401 e não escrevem", () => {
  it.each(writeRoutes)("%s sem cookie", async (_name, call) => {
    await expectUnauthenticated(await call());
    await expectNothingChanged();
  });

  it.each(writeRoutes)("%s com cookie forjado", async (_name, call) => {
    await expectUnauthenticated(await call({ cookie: "better-auth.session_token=forjado.assinatura" }));
    await expectNothingChanged();
  });

  it.each(writeRoutes)("%s com sessão expirada (RN12)", async (_name, call) => {
    const { cookie } = await signIn();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await expectUnauthenticated(await call({ cookie }));
    await expectNothingChanged();
  });

  it.each(writeRoutes)("%s depois de encerrar a sessão (RF20)", async (_name, call) => {
    const { cookie } = await signIn();
    expect((await authRequest("/sign-out", { cookie, body: {} })).status).toBe(200);

    await expectUnauthenticated(await call({ cookie }));
    await expectNothingChanged();
  });

  it("a sessão é verificada antes da entrada: corpo inválido sem sessão também responde 401", async () => {
    const response = await contentsRoute.POST(apiRequest("/api/contents", { method: "POST", body: "{ malformado" }));
    await expectUnauthenticated(response);
  });
});

describe("rotas de leitura do painel também exigem sessão", () => {
  it.each(readRoutes)("%s sem cookie responde 401", async (_name, call) => {
    await expectUnauthenticated(await call());
    expect(await prisma.configuration.count()).toBe(0); // nem o registro padrão é criado
  });
});

describe("com sessão válida", () => {
  it.each([...readRoutes, ...writeRoutes])("%s é atendida", async (_name, call) => {
    const { cookie } = await signIn();
    const response = await call({ cookie });

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});

describe("mutação vinda de outra origem (CSRF)", () => {
  it.each(writeRoutes)("%s com Origin de outro site é recusada mesmo com cookie válido", async (_name, call) => {
    const { cookie } = await signIn();

    await expectUnauthenticated(await call({ cookie, headers: { origin: "https://malicioso.test" } }));
    await expectNothingChanged();
  });
});
