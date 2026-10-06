// Orçamento de renderização nas rotas de gravação (A-021, ADR-033; RN25; CT39 ajustado; CT novo): `POST` e
// `PATCH` de conteúdo com `body` e `PUT /api/configuration` com `homeBody` recusam, com 422
// `CONTENT_TOO_COMPLEX`, o texto que o pipeline do `MarkdownRenderer` não renderiza em 2 s, SEM gravar nada
// e SEM notificar; a cota em bytes vem antes (barata, sem tocar o worker); o `PATCH` que não traz `body` não
// é validado (um corpo antigo, acima do limite, segue editável); a moderação também passa pelo orçamento.
// better-auth real sobre o banco temporário; o worker é o REAL (`render-budget.js`).
import "./env";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as contentsRoute from "@/app/api/contents/route";
import { createContent, getConfiguration, listNotifications, prisma } from "@/lib/db";
import { RENDER_BUDGET_MS, checkRenderable, shutdownRenderWorker, stats } from "@/lib/render-budget";
import { aged, apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";
import { HOSTILE_64K, commonDocument } from "./fixtures/documents.js";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;

beforeEach(async () => {
  await resetDatabase();
  delete process.env.MAX_BODY_BYTES;
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
});

afterAll(async () => {
  await shutdownRenderWorker();
});

const create = (body, cookie = ana.cookie) => contentsRoute.POST(apiRequest("/api/contents", { method: "POST", body, cookie }));
const update = (id, body, cookie = ana.cookie) =>
  contentRoute.PATCH(apiRequest(`/api/contents/${id}`, { method: "PATCH", body, cookie }), routeContext({ id }));
const put = (body) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie: admin.cookie }));
const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const row = (/** @type {string} */ id) => prisma.content.findUniqueOrThrow({ where: { id } });
/** `limits`: um corpo gravado ANTES do limite de 64 KiB (ADR-033) precisa de uma cota larga na criação do teste. */
const seed = async (slug, extra = {}, options = {}) =>
  aged(await createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId: ana.id, body: "original", ...extra }, options));
const WIDE = { limits: { maxBodyBytes: 1_000_000 } };
const document = { title: "A", slug: "a", type: "DOCUMENT" };

/** Quantas validações o worker recebeu até agora (a cota barata e o PATCH sem corpo não podem somar). */
const checks = () => stats.checks;

describe("POST /api/contents: o texto complexo demais não é criado", () => {
  it("o texto hostil de 64 KiB: 422 CONTENT_TOO_COMPLEX, nada criado, nada revalidado, decidido logo depois do orçamento", async () => {
    const start = performance.now();
    const response = await create({ ...document, body: HOSTILE_64K });
    const total = performance.now() - start;

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error).toMatchObject({
      code: "CONTENT_TOO_COMPLEX",
      message: "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.",
      details: [{ field: "body", reason: "timeout", budgetMs: RENDER_BUDGET_MS }],
    });
    expect(await prisma.content.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(total).toBeLessThan(RENDER_BUDGET_MS + 5000); // o orçamento, mais a subida de um worker novo
  }, 30_000);

  it("o documento comum de 62 KiB é criado (201) e o corpo é gravado inteiro", async () => {
    const body = commonDocument();

    const response = await create({ ...document, body });

    expect(response.status).toBe(201);
    expect((await row((await response.json()).data.id)).body).toBe(body);
  });

  it("a cota em bytes vem ANTES: 422 QUOTA_EXCEEDED sem tocar o worker", async () => {
    const before = checks();

    const response = await create({ ...document, body: HOSTILE_64K + HOSTILE_64K.slice(0, 30_000) }); // > 64 KiB, < limite de leitura

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("QUOTA_EXCEEDED");
    expect(checks()).toBe(before);
    expect(await prisma.content.count()).toBe(0);
  });

  it("o corpo acima do limite de leitura é 413, antes de tudo, sem tocar o worker", async () => {
    const before = checks();

    const response = await contentsRoute.POST(
      apiRequest("/api/contents", { method: "POST", body: JSON.stringify({ ...document, body: "x".repeat(200_000) }), cookie: ana.cookie }),
    );

    expect(response.status).toBe(413);
    expect(checks()).toBe(before);
  });

  it("sem corpo (uma coleção, um documento vazio): nenhuma validação cara", async () => {
    const before = checks();

    expect((await create({ title: "Coleção", slug: "col", type: "COLLECTION" })).status).toBe(201);
    expect((await create({ ...document, body: "" })).status).toBe(201);
    expect(checks()).toBe(before);
  });
});

describe("PATCH /api/contents/:id: só quando o PATCH altera o corpo", () => {
  it("o corpo hostil: 422 CONTENT_TOO_COMPLEX, o corpo e a version ficam como estavam, nada revalidado", async () => {
    const mine = await seed("da-ana");

    const response = await update(mine.id, { body: HOSTILE_64K, version: mine.updatedAt.toISOString() });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({ code: "CONTENT_TOO_COMPLEX", details: [{ field: "body", reason: "timeout" }] });
    expect(await row(mine.id)).toMatchObject({ body: "original", updatedAt: mine.updatedAt });
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 30_000);

  it("a moderação passa pelo orçamento: o administrador edita o corpo alheio, 422, sem gravar e SEM notificar o dono", async () => {
    const theirs = await seed("da-ana");

    const response = await update(
      theirs.id,
      { body: HOSTILE_64K, version: theirs.updatedAt.toISOString(), reason: "correção" },
      admin.cookie,
    );

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("CONTENT_TOO_COMPLEX");
    expect((await row(theirs.id)).body).toBe("original");
    expect(await listNotifications(ana.id, { take: 20 })).toEqual([]);
  }, 30_000);

  it("o corpo comum de 62 KiB é aceito (200)", async () => {
    const mine = await seed("da-ana");
    const body = commonDocument();

    const response = await update(mine.id, { body, version: mine.updatedAt.toISOString() });

    expect(response.status).toBe(200);
    expect((await row(mine.id)).body).toBe(body);
  });

  it("um corpo JÁ gravado acima do limite continua editável nos outros campos, sem validação (título, estado, slug)", async () => {
    const mine = await seed("da-ana", { body: HOSTILE_64K + HOSTILE_64K.slice(0, 40_000) }, WIDE); // 100 KB: gravado antes do limite
    const before = checks();

    expect((await update(mine.id, { title: "Novo título" })).status).toBe(200);
    expect((await update(mine.id, { status: "DRAFT" })).status).toBe(200);
    expect((await update(mine.id, { slug: "novo-slug" })).status).toBe(200);

    expect(checks()).toBe(before);
    expect(await row(mine.id)).toMatchObject({ title: "Novo título", status: "DRAFT", slug: "novo-slug" });
  });

  it("alterar o corpo desse conteúdo antigo passa a valer a cota: 422 QUOTA_EXCEEDED, sem tocar o worker", async () => {
    const mine = await seed("da-ana", { body: HOSTILE_64K + HOSTILE_64K.slice(0, 40_000) }, WIDE);
    const before = checks();

    const response = await update(mine.id, { body: "y".repeat(100_000), version: mine.updatedAt.toISOString() });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("QUOTA_EXCEEDED");
    expect(checks()).toBe(before);
  });

  it("o PATCH sem version continua 422 de validação, antes do worker", async () => {
    const mine = await seed("da-ana");
    const before = checks();

    const response = await update(mine.id, { body: "novo" });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    expect(checks()).toBe(before);
  });
});

describe("PUT /api/configuration: o texto do portal (homeBody)", () => {
  it("o texto hostil: 422 CONTENT_TOO_COMPLEX com field homeBody; a configuração não muda e nada é revalidado", async () => {
    const before = await getConfiguration();

    const response = await put({ siteName: "Outro nome", homeBody: HOSTILE_64K });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({
      code: "CONTENT_TOO_COMPLEX",
      details: [{ field: "homeBody", reason: "timeout", budgetMs: RENDER_BUDGET_MS }],
    });
    const after = await getConfiguration();
    expect(after.siteName).toBe(before.siteName); // nem o nome, enviado junto, foi gravado
    expect(after.homeBody).toBe(before.homeBody);
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 30_000);

  it("o texto comum de 62 KiB é aceito (200)", async () => {
    const response = await put({ homeBody: commonDocument() });

    expect(response.status).toBe(200);
    expect((await getConfiguration()).homeBody).toBe(commonDocument().trim()); // o validador apara as pontas
  });

  it("sem homeBody (ou null): nenhuma validação cara; a cota em bytes continua antes", async () => {
    const before = checks();

    expect((await put({ siteName: "Só o nome" })).status).toBe(200);
    expect((await put({ homeBody: null })).status).toBe(200);
    expect(checks()).toBe(before);

    const over = await put({ homeBody: "x".repeat(70_000) });
    expect(over.status).toBe(422);
    expect((await errorOf(over)).code).toBe("QUOTA_EXCEEDED");
    expect(checks()).toBe(before);
  });
});

describe("o servidor continua respondendo durante a validação", () => {
  it("uma leitura da API e um temporizador seguem em tempo enquanto um texto hostil é validado", async () => {
    const mine = await seed("da-ana");
    await checkRenderable("# aquece o worker");
    let worst = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last - 20);
      last = now;
    }, 20);

    const pending = update(mine.id, { body: HOSTILE_64K, version: mine.updatedAt.toISOString() });
    const start = performance.now();
    const read = await contentRoute.GET(apiRequest(`/api/contents/${mine.id}`, { cookie: ana.cookie }), routeContext({ id: mine.id }));
    const readMs = performance.now() - start;
    const response = await pending;
    clearInterval(timer);

    expect(read.status).toBe(200);
    expect(readMs).toBeLessThan(500); // a leitura nunca passa pelo worker
    expect(response.status).toBe(422);
    expect(worst).toBeLessThan(200);
  }, 30_000);
});

describe("A-022: a fila é justa entre usuários (o worker real)", () => {
  it("a Ana com uma hostil em andamento: a SEGUNDA gravação dela recebe 503 BUSY, a do Beto é atendida (201), e a dela volta a funcionar", async () => {
    const beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
    await checkRenderable("# aquece o worker");
    const before = stats.checks;

    const hostile = create({ ...document, body: HOSTILE_64K });
    await vi.waitFor(() => expect(stats.checks).toBe(before + 1)); // a validação da Ana chegou ao worker
    const second = await create({ ...document, slug: "b", body: "# segunda da Ana" });
    const betos = create({ ...document, slug: "do-beto", body: "# Do Beto\n\nTexto normal." }, beto.cookie);

    expect(second.status).toBe(503);
    expect(second.headers.get("retry-after")).toBe("3");
    expect((await errorOf(second)).code).toBe("BUSY");
    expect((await hostile).status).toBe(422); // a hostil é recusada por complexidade
    expect((await betos).status).toBe(201); // o Beto NÃO recebeu 503: esperou a vez e foi atendido
    // Terminou: a Ana volta a gravar.
    expect((await create({ ...document, slug: "c", body: "# Depois" })).status).toBe(201);
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(1);
  }, 60_000);
});
