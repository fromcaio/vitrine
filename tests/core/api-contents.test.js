// Route Handlers de conteúdo (M04) sobre o SQLite temporário, com sessão real do better-auth:
// CT07 (criar), CT08 (slug duplicado), CT09 (pai inválido), CT10 (ciclo), validação de formato,
// mapeamento de erros e revalidação POR ESPAÇO, por caminhos literais (RN10, RN16, ADR-030, CT44).
// `revalidatePath` é substituído para conferir as chamadas, pois só funciona dentro do servidor do
// Next.js. O dono é o administrador, que ganha o handle "ada": sem handle o espaço não tem URL.
import "./env";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as reorderRoute from "@/app/api/contents/reorder/route";
import * as contentsRoute from "@/app/api/contents/route";
import { prisma } from "@/lib/db";
import { apiRequest, createAdminSession, resetContent, routeContext } from "./helpers";

/** @type {string} */
let cookie;
/** @type {string} */
let adminId;

beforeAll(async () => {
  ({ cookie, userId: adminId } = await createAdminSession());
  await prisma.user.update({ where: { id: adminId }, data: { handle: "ada" } });
});

/** Páginas literais invalidadas (chamadas de um só argumento), ordenadas; o portal é a chamada literal `("/")`, à parte. */
const pages = () =>
  vi.mocked(revalidatePath).mock.calls.filter((call) => call.length === 1 && call[0] !== "/").map((call) => call[0]).sort();
const portalCalls = () => vi.mocked(revalidatePath).mock.calls.filter((call) => call[0] === "/");
/** Nenhuma chamada usa o tipo "layout" (ADR-030: nunca por mudança de espaço). */
const noLayout = () => expect(vi.mocked(revalidatePath).mock.calls.some((call) => call[1] === "layout")).toBe(false);

beforeEach(async () => {
  await resetContent();
  vi.mocked(revalidatePath).mockClear();
});

// ---- atalhos: cada um chama o Route Handler como o Next.js chamaria ----

const listTree = () => contentsRoute.GET(apiRequest("/api/contents", { cookie }));
const create = (body) => contentsRoute.POST(apiRequest("/api/contents", { method: "POST", body, cookie }));
const getOne = (id) => contentRoute.GET(apiRequest(`/api/contents/${id}`, { cookie }), routeContext({ id }));
/**
 * PATCH. Quando altera o corpo e não traz `version` (RN18), este atalho acrescenta a versão atual do
 * conteúdo, como o editor faria; passe `version` explícito (ou `{ raw: true }`) para testar a recusa.
 */
const update = async (id, body, { raw = false } = {}) => {
  if (!raw && body && typeof body === "object" && "body" in body && !("version" in body)) {
    const row = await prisma.content.findUnique({ where: { id }, select: { updatedAt: true } });
    if (row) body = { ...body, version: row.updatedAt.toISOString() };
  }
  return contentRoute.PATCH(apiRequest(`/api/contents/${id}`, { method: "PATCH", body, cookie }), routeContext({ id }));
};
const remove = (id) =>
  contentRoute.DELETE(apiRequest(`/api/contents/${id}`, { method: "DELETE", cookie }), routeContext({ id }));
const reorder = (body) =>
  reorderRoute.PATCH(apiRequest("/api/contents/reorder", { method: "PATCH", body, cookie }));

/** Cria um conteúdo pela API e devolve o registro. */
async function created(body) {
  const response = await create(body);
  expect(response.status).toBe(201);
  return (await response.json()).data;
}

const collection = (slug, extra = {}) => created({ title: slug, slug, type: "COLLECTION", ...extra });
const document = (slug, extra = {}) => created({ title: slug, slug, type: "DOCUMENT", ...extra });

/** Corpo de erro no formato padrão. */
async function errorOf(response) {
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["error"]);
  expect(Object.keys(body.error).sort()).toEqual(["code", "details", "message"]);
  return body.error;
}

describe("POST /api/contents", () => {
  it("CT07: documento válido responde 201 e aparece na árvore", async () => {
    const response = await create({ title: "Introdução", slug: "introducao", type: "DOCUMENT", body: "# Olá" });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = await response.json();
    expect(data).toMatchObject({
      title: "Introdução",
      slug: "introducao",
      type: "DOCUMENT",
      body: "# Olá",
      parentId: null,
      order: 0,
    });
    expect(response.headers.get("location")).toBe(`/api/contents/${data.id}`);

    const tree = (await (await listTree()).json()).data;
    expect(tree.map((node) => node.slug)).toEqual(["introducao"]);
  });

  it("o autor vem da sessão, não da entrada (RN13)", async () => {
    const data = await created({ title: "A", slug: "a", type: "DOCUMENT", authorId: "intruso" });
    expect(data.authorId).toBe(adminId);
  });

  it("sem estado explícito, cria como PUBLISHED; aceita criar como DRAFT (RN16)", async () => {
    expect((await document("publicado")).status).toBe("PUBLISHED");
    expect((await document("rascunho", { status: "DRAFT" })).status).toBe("DRAFT");
  });

  it("cria dentro de uma coleção, no fim do nível", async () => {
    const parent = await collection("calculo");
    const first = await document("limites", { parentId: parent.id });
    const second = await document("derivadas", { parentId: parent.id });

    expect([first.order, second.order]).toEqual([0, 1]);
    expect(second.parentId).toBe(parent.id);
  });

  it("revalida a página inicial do espaço e o caminho do novo conteúdo, não o layout (RN10, ADR-030)", async () => {
    const parent = await collection("calculo");
    vi.mocked(revalidatePath).mockClear();

    await document("limites", { parentId: parent.id });

    // A coleção-pai também: ela redireciona ao primeiro documento publicado (RN14).
    expect(pages()).toEqual(["/ada", "/ada/calculo", "/ada/calculo/limites"]);
    expect(portalCalls()).toEqual([]); // criar um filho não altera o diretório
    noLayout();
  });

  it("criar uma raiz publicada revalida também o portal, que a lista no diretório (RN28)", async () => {
    await document("a");

    expect(pages()).toEqual(["/ada", "/ada/a"]);
    expect(portalCalls()).toEqual([["/"]]);
    noLayout();
  });

  it("um rascunho recém-criado só revalida a página inicial do espaço (nada público a invalidar)", async () => {
    await document("a", { status: "DRAFT" });

    expect(pages()).toEqual(["/ada"]);
  });

  it("autor sem handle: o espaço não tem URL e nada é revalidado", async () => {
    await prisma.user.update({ where: { id: adminId }, data: { handle: null } });
    try {
      await document("a");
      expect(pages()).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: adminId }, data: { handle: "ada" } });
    }
  });

  it("CT08: slug duplicado entre irmãos responde 409 SLUG_CONFLICT com sugestão", async () => {
    const parent = await collection("calculo");
    await document("limites", { parentId: parent.id });
    vi.mocked(revalidatePath).mockClear();

    const response = await create({ title: "Outro", slug: "limites", type: "DOCUMENT", parentId: parent.id });

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toEqual({
      code: "SLUG_CONFLICT",
      message: "Já existe um conteúdo com este slug no mesmo nível.",
      details: [{ field: "slug", value: "limites", suggestion: "limites-2" }],
    });
    expect(await prisma.content.count()).toBe(2);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("CT08: slug duplicado na raiz também responde 409 (índice parcial)", async () => {
    await document("sobre");
    await document("sobre-2");

    const response = await create({ title: "Sobre", slug: "sobre", type: "DOCUMENT" });

    expect(response.status).toBe(409);
    expect((await errorOf(response)).details).toEqual([{ field: "slug", value: "sobre", suggestion: "sobre-3" }]);
  });

  it("o mesmo slug em pais diferentes é aceito", async () => {
    const a = await collection("a");
    const b = await collection("b");
    await document("introducao", { parentId: a.id });

    expect((await create({ title: "I", slug: "introducao", type: "DOCUMENT", parentId: b.id })).status).toBe(201);
  });

  it("CT09: pai que não é coleção responde 422 INVALID_PARENT", async () => {
    const parent = await document("folha");

    const response = await create({ title: "Filho", slug: "filho", type: "DOCUMENT", parentId: parent.id });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({
      code: "INVALID_PARENT",
      details: [{ field: "parentId", value: parent.id }],
    });
    expect(await prisma.content.count()).toBe(1);
  });

  it("pai inexistente responde 422 INVALID_PARENT", async () => {
    const response = await create({ title: "Filho", slug: "filho", type: "DOCUMENT", parentId: "nao-existe" });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("INVALID_PARENT");
  });

  it.each([
    ["slug fora do formato", { slug: "Com Espaço" }, "slug"],
    ["estado fora do domínio", { status: "ARCHIVED" }, "status"],
    ["tipo fora do domínio", { type: "PAGE" }, "type"],
    ["ordem negativa", { order: -1 }, "order"],
    ["título em branco", { title: " " }, "title"],
  ])("%s responde 422 VALIDATION_ERROR", async (_label, change, field) => {
    const response = await create({ title: "Título", slug: "titulo", type: "DOCUMENT", ...change });

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details.map((detail) => detail.field)).toEqual([field]);
    expect(await prisma.content.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o slug da raiz não tem nomes reservados: fica sob /{handle} (RN03)", async () => {
    for (const slug of ["admin", "api", "login", "logout"]) {
      expect((await create({ title: slug, slug, type: "DOCUMENT" })).status, slug).toBe(201);
    }
    const parent = await collection("docs");
    expect((await create({ title: "API", slug: "api", type: "DOCUMENT", parentId: parent.id })).status).toBe(201);
  });

  it("JSON malformado responde 400", async () => {
    const response = await create("{ title: ");

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
  });

  it("corpo que não é JSON (formulário) responde 400 e nada é criado", async () => {
    const response = await contentsRoute.POST(
      apiRequest("/api/contents", {
        method: "POST",
        body: "title=x&slug=x&type=DOCUMENT",
        cookie,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.content.count()).toBe(0);
  });
});

describe("GET /api/contents", () => {
  it("devolve a árvore completa, com rascunhos e estado, sem o corpo (RF26)", async () => {
    const parent = await collection("calculo", { status: "DRAFT" });
    await document("limites", { parentId: parent.id, body: "corpo longo" });

    const response = await listTree();

    expect(response.status).toBe(200);
    const [root] = (await response.json()).data;
    expect(root).toMatchObject({ slug: "calculo", status: "DRAFT" });
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ slug: "limites", status: "PUBLISHED" });
    expect(root.children[0]).not.toHaveProperty("body");
  });

  it("a leitura da árvore não revalida nada", async () => {
    await document("a");
    vi.mocked(revalidatePath).mockClear();

    await listTree();

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("árvore vazia", async () => {
    expect((await (await listTree()).json()).data).toEqual([]);
  });
});

describe("GET /api/contents/:id", () => {
  it("devolve o detalhe com o corpo e o estado", async () => {
    const doc = await document("limites", { body: "# Limites", status: "DRAFT" });

    const response = await getOne(doc.id);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: doc.id, body: "# Limites", status: "DRAFT" });
  });

  it("identificador inexistente responde 404 NOT_FOUND", async () => {
    const response = await getOne("nao-existe");

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: "NOT_FOUND", details: [{ field: "id", value: "nao-existe" }] });
  });
});

describe("PATCH /api/contents/:id", () => {
  it("alteração só do corpo revalida apenas a página do documento (RN10)", async () => {
    const parent = await collection("calculo");
    const doc = await document("limites", { parentId: parent.id, body: "antigo" });
    vi.mocked(revalidatePath).mockClear();

    const response = await update(doc.id, { body: "novo" });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: doc.id, body: "novo", title: "limites" });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/ada/calculo/limites");
  });

  it("alteração só do corpo de um rascunho não revalida página alguma (nada público)", async () => {
    const doc = await document("rascunho", { body: "antigo", status: "DRAFT" });
    vi.mocked(revalidatePath).mockClear();

    await update(doc.id, { body: "novo" });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reenviar os mesmos metadados com o corpo novo ainda revalida só a página", async () => {
    const doc = await document("sobre", { body: "antigo" });
    vi.mocked(revalidatePath).mockClear();

    await update(doc.id, { title: "sobre", slug: "sobre", status: "PUBLISHED", body: "novo" });

    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/ada/sobre");
  });

  it.each([
    ["título", { title: "Novo título" }, ["/ada", "/ada/sobre"], 0],
    ["slug (o caminho antigo e o novo)", { slug: "novo-slug" }, ["/ada", "/ada/novo-slug", "/ada/sobre"], 0],
    ["ordem", { order: 7 }, ["/ada", "/ada/sobre"], 0],
    // Despublicar: o caminho antigo sai do ar, e a raiz deixa o diretório do portal (RN28).
    ["estado de publicação (RN16)", { status: "DRAFT" }, ["/ada", "/ada/sobre"], 1],
  ])("mudança de %s revalida os caminhos literais do espaço, não o layout", async (_label, patch, expected, portal) => {
    const doc = await document("sobre");
    vi.mocked(revalidatePath).mockClear();

    const response = await update(doc.id, patch);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject(patch);
    expect(pages()).toEqual(expected);
    expect(portalCalls()).toHaveLength(portal);
    noLayout();
  });

  it("renomear o título de um documento invalida também as páginas irmãs, cuja sidebar o lista (A-014 3a)", async () => {
    const doc = await document("a");
    await document("b");
    const parent = await collection("pasta");
    await document("c", { parentId: parent.id });
    vi.mocked(revalidatePath).mockClear();

    await update(doc.id, { title: "Novo título de A" });

    expect(pages()).toEqual(["/ada", "/ada/a", "/ada/b", "/ada/pasta", "/ada/pasta/c"]);
    noLayout();
  });

  it("alterar só o corpo continua invalidando só a página do documento, sem as irmãs", async () => {
    const doc = await document("a", { body: "antigo" });
    await document("b");
    vi.mocked(revalidatePath).mockClear();

    await update(doc.id, { body: "novo" });

    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/ada/a");
  });

  it("renomear uma coleção revalida o caminho antigo e o novo dela e dos descendentes (CT22, CT44)", async () => {
    const parent = await collection("calculo");
    await document("limites", { parentId: parent.id });
    const sub = await collection("integrais", { parentId: parent.id });
    await document("por-partes", { parentId: sub.id });
    await document("rascunho", { parentId: parent.id, status: "DRAFT" });
    vi.mocked(revalidatePath).mockClear();

    await update(parent.id, { slug: "analise" });

    // O rascunho não é público: nenhum caminho dele.
    const expected = ["/ada"];
    for (const root of ["calculo", "analise"]) {
      expected.push(`/ada/${root}`, `/ada/${root}/limites`, `/ada/${root}/integrais`, `/ada/${root}/integrais/por-partes`);
    }
    expect(pages()).toEqual(expected.sort());
    noLayout();
  });

  it("despublicar uma coleção revalida os descendentes que saem do ar (RN15, RN16)", async () => {
    const parent = await collection("calculo");
    await document("limites", { parentId: parent.id });
    vi.mocked(revalidatePath).mockClear();

    await update(parent.id, { status: "DRAFT" });

    expect(pages()).toEqual(["/ada", "/ada/calculo", "/ada/calculo/limites"]);
  });

  it("mover para outro pai revalida o caminho antigo e o novo, e põe o nó no fim do nível", async () => {
    const a = await collection("a");
    const b = await collection("b");
    await document("existente", { parentId: b.id });
    const doc = await document("movido", { parentId: a.id });
    vi.mocked(revalidatePath).mockClear();

    const response = await update(doc.id, { parentId: b.id });

    expect((await response.json()).data).toMatchObject({ parentId: b.id, order: 1 });
    // O espaço inteiro (a sidebar de cada página lista a árvore): o caminho de antes (/ada/a/movido), o
    // de depois (/ada/b/movido) e as páginas que não mudaram de caminho.
    expect(pages()).toEqual(["/ada", "/ada/a", "/ada/a/movido", "/ada/b", "/ada/b/existente", "/ada/b/movido"]);
    noLayout();
  });

  it("CT10: mover um nó para dentro de um descendente responde 422 CYCLE_DETECTED", async () => {
    const root = await collection("raiz");
    const child = await collection("filha", { parentId: root.id });
    const grandchild = await collection("neta", { parentId: child.id });
    vi.mocked(revalidatePath).mockClear();

    const response = await update(root.id, { parentId: grandchild.id });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("CYCLE_DETECTED");
    expect((await prisma.content.findUniqueOrThrow({ where: { id: root.id } })).parentId).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("mover um nó para dentro de si mesmo responde 422 CYCLE_DETECTED", async () => {
    const root = await collection("raiz");
    const response = await update(root.id, { parentId: root.id });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("CYCLE_DETECTED");
  });

  it("CT08: renomear para um slug já usado pelo irmão responde 409 com sugestão", async () => {
    await document("a");
    const b = await document("b");

    const response = await update(b.id, { slug: "a" });

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "SLUG_CONFLICT",
      details: [{ field: "slug", value: "a", suggestion: "a-2" }],
    });
  });

  it("CT09: mover para dentro de um documento responde 422 INVALID_PARENT", async () => {
    const leaf = await document("folha");
    const doc = await document("outro");

    const response = await update(doc.id, { parentId: leaf.id });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("INVALID_PARENT");
  });

  it("coleção com filhos não pode virar documento: 422 VALIDATION_ERROR no campo type", async () => {
    const parent = await collection("calculo");
    await document("limites", { parentId: parent.id });

    const response = await update(parent.id, { type: "DOCUMENT" });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({ code: "VALIDATION_ERROR", details: [{ field: "type" }] });
  });

  it("o slug da raiz não tem nomes reservados: renomear e mover para a raiz aceitam admin e login (RN03)", async () => {
    const parent = await collection("docs");
    const nested = await document("api", { parentId: parent.id });
    const rootDoc = await document("sobre");

    expect((await update(rootDoc.id, { slug: "login" })).status).toBe(200);
    expect((await update(nested.id, { parentId: null })).status).toBe(200);
    expect((await prisma.content.findUniqueOrThrow({ where: { id: nested.id } })).parentId).toBeNull();
  });

  it("identificador inexistente responde 404", async () => {
    const response = await update("nao-existe", { title: "x" });

    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("NOT_FOUND");
  });

  it("entrada inválida ou vazia responde 422 e não altera o conteúdo", async () => {
    const doc = await document("sobre");

    expect((await update(doc.id, { status: "ARCHIVED" })).status).toBe(422);
    expect((await update(doc.id, {})).status).toBe(422);
    expect((await update(doc.id, { authorId: "intruso" })).status).toBe(422);
    expect((await prisma.content.findUniqueOrThrow({ where: { id: doc.id } })).authorId).toBe(adminId);
  });
});

describe("DELETE /api/contents/:id", () => {
  it("exclui o nó e os descendentes, responde 204 e revalida os caminhos que saem do ar (RN07, RN10)", async () => {
    const parent = await collection("calculo");
    const child = await collection("integrais", { parentId: parent.id });
    await document("por-partes", { parentId: child.id });
    await document("sobre");
    vi.mocked(revalidatePath).mockClear();

    const response = await remove(parent.id);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect((await prisma.content.findMany()).map((row) => row.slug)).toEqual(["sobre"]);
    // O espaço inteiro: o que saiu do ar e o que ficou (a sidebar de "sobre" perdeu a coleção).
    expect(pages()).toEqual(
      ["/ada", "/ada/calculo", "/ada/calculo/integrais", "/ada/calculo/integrais/por-partes", "/ada/sobre"].sort(),
    );
    expect(portalCalls()).toEqual([["/"]]); // uma raiz saiu do diretório
    noLayout();
  });

  it("identificador inexistente responde 404 e não revalida", async () => {
    const response = await remove("nao-existe");

    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("NOT_FOUND");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/contents/reorder", () => {
  it("persiste a nova ordem, devolve a árvore atualizada e revalida o espaço do dono, sem o layout", async () => {
    const a = await document("a");
    const b = await document("b");
    const c = await document("c");
    vi.mocked(revalidatePath).mockClear();

    const response = await reorder([
      { id: c.id, order: 0 },
      { id: a.id, order: 1 },
      { id: b.id, order: 2 },
    ]);

    expect(response.status).toBe(200);
    expect((await response.json()).data.map((node) => node.slug)).toEqual(["c", "a", "b"]);
    expect(pages()).toEqual(["/ada", "/ada/a", "/ada/b", "/ada/c"]);
    expect(portalCalls()).toEqual([]); // ninguém entrou na raiz nem saiu dela
    noLayout();
  });

  it("move um item para outra coleção", async () => {
    const parent = await collection("calculo");
    const doc = await document("limites");

    vi.mocked(revalidatePath).mockClear();

    const response = await reorder([{ id: doc.id, parentId: parent.id, order: 0 }]);

    expect(response.status).toBe(200);
    const [root] = (await response.json()).data;
    expect(root.children.map((node) => node.slug)).toEqual(["limites"]);
    // O caminho antigo (/ada/limites) e o novo (/ada/calculo/limites); a raiz saiu do diretório (RN28).
    expect(pages()).toEqual(["/ada", "/ada/calculo", "/ada/calculo/limites", "/ada/limites"]);
    expect(portalCalls()).toEqual([["/"]]);
    noLayout();
  });

  it("CT10: ciclo no lote responde 422 CYCLE_DETECTED e rejeita o lote inteiro", async () => {
    const root = await collection("raiz");
    const child = await collection("filha", { parentId: root.id });
    const other = await document("outro");
    vi.mocked(revalidatePath).mockClear();

    const response = await reorder([
      { id: other.id, order: 5 },
      { id: root.id, parentId: child.id, order: 0 },
    ]);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("CYCLE_DETECTED");
    // Tudo ou nada: o primeiro item do lote também não foi aplicado
    expect((await prisma.content.findUniqueOrThrow({ where: { id: other.id } })).order).not.toBe(5);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("item inexistente responde 404; destino que é documento responde 422 INVALID_PARENT", async () => {
    const leaf = await document("folha");
    const doc = await document("outro");

    const missing = await reorder([{ id: "nao-existe", order: 0 }]);
    expect(missing.status).toBe(404);
    expect((await errorOf(missing)).code).toBe("NOT_FOUND");

    const invalidParent = await reorder([{ id: doc.id, parentId: leaf.id, order: 0 }]);
    expect(invalidParent.status).toBe(422);
    expect((await errorOf(invalidParent)).code).toBe("INVALID_PARENT");
  });

  it("slug repetido no destino responde 409", async () => {
    const parent = await collection("calculo");
    await document("limites", { parentId: parent.id });
    const rootDoc = await document("limites");

    const response = await reorder([{ id: rootDoc.id, parentId: parent.id, order: 1 }]);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("SLUG_CONFLICT");
  });

  it("lote malformado, vazio ou com ids repetidos responde 422", async () => {
    const doc = await document("a");

    for (const body of [{ id: doc.id, order: 0 }, [], [{ id: doc.id }], [{ id: doc.id, order: -1 }]]) {
      const response = await reorder(body);
      expect(response.status).toBe(422);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }

    const repeated = await reorder([
      { id: doc.id, order: 0 },
      { id: doc.id, order: 1 },
    ]);
    expect(repeated.status).toBe(422);
    expect((await errorOf(repeated)).code).toBe("VALIDATION_ERROR");
  });

  it("mover para a raiz um conteúdo de slug admin é aceito: não há nomes reservados na raiz (RN03)", async () => {
    const parent = await collection("docs");
    const nested = await document("admin", { parentId: parent.id });

    const response = await reorder([{ id: nested.id, parentId: null, order: 0 }]);

    expect(response.status).toBe(200);
    expect((await prisma.content.findUniqueOrThrow({ where: { id: nested.id } })).parentId).toBeNull();
  });
});

describe("erro não previsto", () => {
  it("responde 500 INTERNAL_ERROR com mensagem genérica, sem vazar o erro do banco", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = vi
      .spyOn(prisma.content, "findMany")
      .mockRejectedValueOnce(new Error("SQLITE_IOERR: disk I/O error em /data/vitrine.db"));

    const response = await listTree();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: [] },
    });
    expect(text).not.toContain("SQLITE");
    expect(log).toHaveBeenCalled();

    failure.mockRestore();
    log.mockRestore();
  });
});
