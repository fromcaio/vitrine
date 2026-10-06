// Autorização por dono nas rotas de conteúdo, de aparência e de configuração (M16; CT04, CT39, CT53;
// RN13, RN18, RN19, RN25): dois usuários e o administrador, com o better-auth real sobre o banco
// temporário. Confere o recurso de outro dono (403, sem alterar nada), o `authorId` sempre da sessão,
// o lote de reordenação recusado por inteiro, as cotas, o limite de taxa e a ORDEM das verificações.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as appearanceRoute from "@/app/api/appearance/route";
import * as configurationRoute from "@/app/api/configuration/route";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as reorderRoute from "@/app/api/contents/reorder/route";
import * as contentsRoute from "@/app/api/contents/route";
import { RATE_LIMITS } from "@/app/api/_lib/rate-limit";
import { createContent, prisma } from "@/lib/db";
import { aged, apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  delete process.env.MAX_CONTENTS_PER_USER;
  delete process.env.MAX_BODY_BYTES;
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

// ---- atalhos ----

const tree = (cookie, query = "") => contentsRoute.GET(apiRequest(`/api/contents${query}`, { cookie }));
const create = (body, cookie, headers = {}) =>
  contentsRoute.POST(apiRequest("/api/contents", { method: "POST", body, cookie, headers }));
const getOne = (id, cookie) => contentRoute.GET(apiRequest(`/api/contents/${id}`, { cookie }), routeContext({ id }));
const update = (id, body, cookie) =>
  contentRoute.PATCH(apiRequest(`/api/contents/${id}`, { method: "PATCH", body, cookie }), routeContext({ id }));
const remove = (id, cookie, query = "") =>
  contentRoute.DELETE(apiRequest(`/api/contents/${id}${query}`, { method: "DELETE", cookie }), routeContext({ id }));
const reorder = (body, cookie) =>
  reorderRoute.PATCH(apiRequest("/api/contents/reorder", { method: "PATCH", body, cookie }));

const errorOf = async (/** @type {Response} */ response) => (await response.json()).error;
const content = (/** @type {string} */ id) => prisma.content.findUniqueOrThrow({ where: { id } });
const slugs = (/** @type {any} */ data) => data.map((/** @type {any} */ node) => node.slug);

/** Conteúdo de um dono, criado direto pela camada de dados. */
// O conteúdo nasce com a version no passado: a primeira atualização muda a version de forma determinística (`aged`).
const seed = async (/** @type {string} */ authorId, /** @type {string} */ slug, extra = {}) =>
  aged(await createContent({ title: slug, slug, type: "DOCUMENT", authorId, body: "original", ...extra }));

describe("CT04: escrita sem sessão e com sessão de outro dono", () => {
  it("toda rota de conteúdo, aparência e configuração responde 401 sem sessão", async () => {
    const mine = await seed(ana.id, "a");
    const calls = [
      tree(undefined),
      create({ title: "x", slug: "x", type: "DOCUMENT" }, undefined),
      getOne(mine.id, undefined),
      update(mine.id, { title: "x" }, undefined),
      remove(mine.id, undefined),
      reorder([{ id: mine.id, order: 1 }], undefined),
      appearanceRoute.GET(apiRequest("/api/appearance")),
      appearanceRoute.PUT(apiRequest("/api/appearance", { method: "PUT", body: { siteName: "x" } })),
      configurationRoute.GET(apiRequest("/api/configuration")),
      configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body: { siteName: "x" } })),
    ];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(401);
    expect((await content(mine.id)).title).toBe("a");
  });

  it("o conteúdo de outro dono responde 403 FORBIDDEN em ler, alterar, mover e excluir, sem alterar nada", async () => {
    const theirs = await seed(beto.id, "do-beto");

    for (const response of [
      await getOne(theirs.id, ana.cookie),
      await update(theirs.id, { title: "invadido", body: "x", version: theirs.updatedAt.toISOString() }, ana.cookie),
      await remove(theirs.id, ana.cookie),
      await reorder([{ id: theirs.id, order: 7 }], ana.cookie),
    ]) {
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN");
    }
    expect(await content(theirs.id)).toMatchObject({ title: "do-beto", body: "original", order: 0, authorId: beto.id });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o próprio dono age normalmente", async () => {
    const mine = await seed(ana.id, "da-ana");
    expect((await getOne(mine.id, ana.cookie)).status).toBe(200);
    expect((await update(mine.id, { title: "Novo" }, ana.cookie)).status).toBe(200);
    expect((await remove(mine.id, ana.cookie)).status).toBe(204);
  });

  it("identificador inexistente responde 404 a qualquer usuário; o 403 só vem para o que existe", async () => {
    expect((await getOne("nao-existe", ana.cookie)).status).toBe(404);
    expect((await update("nao-existe", { title: "x" }, ana.cookie)).status).toBe(404);
    expect((await remove("nao-existe", ana.cookie)).status).toBe(404);
  });

  it("o administrador só ESCREVE no conteúdo alheio como moderação: sem o motivo, 422; reordenar, sempre 403", async () => {
    const theirs = await seed(ana.id, "da-ana");

    // Sem `reason`, a moderação é recusada (a moderação completa está em api-moderation.test.js, CT51).
    for (const response of [await update(theirs.id, { status: "DRAFT" }, admin.cookie), await remove(theirs.id, admin.cookie)]) {
      expect(response.status).toBe(422);
      expect((await errorOf(response)).details).toEqual([expect.objectContaining({ field: "reason" })]);
    }
    // Reordenar o conteúdo alheio não é moderação.
    expect((await reorder([{ id: theirs.id, order: 3 }], admin.cookie)).status).toBe(403);

    expect(await content(theirs.id)).toMatchObject({ status: "PUBLISHED", order: 0 });
    expect(await prisma.notification.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o usuário comum recebe 403 ao escrever no conteúdo de outro usuário, com ou sem motivo", async () => {
    const theirs = await seed(beto.id, "do-beto");

    for (const response of [
      await update(theirs.id, { status: "DRAFT", reason: "tentando moderar" }, ana.cookie),
      await remove(theirs.id, ana.cookie, "?reason=tentando%20moderar"),
    ]) {
      expect(response.status).toBe(403);
    }
    expect(await content(theirs.id)).toMatchObject({ status: "PUBLISHED" });
    expect(await prisma.notification.count()).toBe(0);
  });

  it("o administrador LÊ o conteúdo e a árvore de outro usuário, para a moderação (RN19)", async () => {
    const theirs = await seed(ana.id, "da-ana", { status: "DRAFT" });

    const one = await getOne(theirs.id, admin.cookie);
    expect(one.status).toBe(200);
    expect((await one.json()).data).toMatchObject({ id: theirs.id, status: "DRAFT", body: "original" });

    const listed = await tree(admin.cookie, `?ownerId=${ana.id}`);
    expect(slugs((await listed.json()).data)).toEqual(["da-ana"]);
  });

  it("a ordem das verificações: 403 antes de 422 (corpo inválido não vaza que o recurso existe)", async () => {
    const theirs = await seed(beto.id, "do-beto");

    const response = await update(theirs.id, { slug: "Com Espaço", order: -5 }, ana.cookie);

    expect(response.status).toBe(403);
  });

  it("senha provisória vence tudo: 403 PASSWORD_CHANGE_REQUIRED, mesmo para um recurso inexistente", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", mustChangePassword: true });
    const response = await update("nao-existe", { title: "x" }, carla.cookie);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("conta suspensa responde 401, também nas rotas de conteúdo", async () => {
    const mine = await seed(ana.id, "da-ana");
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "x" } });

    expect((await getOne(mine.id, ana.cookie)).status).toBe(401);
    expect((await create({ title: "x", slug: "x", type: "DOCUMENT" }, ana.cookie)).status).toBe(401);
  });

  it("origem de outro site com o cookie de um dono responde 401 e não altera nada", async () => {
    const mine = await seed(ana.id, "da-ana");
    const response = await contentRoute.PATCH(
      apiRequest(`/api/contents/${mine.id}`, { method: "PATCH", body: { title: "x" }, cookie: ana.cookie, headers: { origin: "https://malicioso.test" } }),
      routeContext({ id: mine.id }),
    );
    expect(response.status).toBe(401);
    expect((await content(mine.id)).title).toBe("da-ana");
  });
});

describe("a árvore é do dono (RN13, RN19)", () => {
  beforeEach(async () => {
    await seed(ana.id, "da-ana");
    await seed(beto.id, "do-beto");
    await seed(admin.userId, "do-admin");
  });

  it("cada usuário lista só a própria árvore, o administrador também", async () => {
    expect(slugs((await (await tree(ana.cookie)).json()).data)).toEqual(["da-ana"]);
    expect(slugs((await (await tree(beto.cookie)).json()).data)).toEqual(["do-beto"]);
    expect(slugs((await (await tree(admin.cookie)).json()).data)).toEqual(["do-admin"]);
  });

  it("o usuário que pede o dono de outro (?ownerId=) recebe 403; o próprio é aceito", async () => {
    expect((await tree(ana.cookie, `?ownerId=${beto.id}`)).status).toBe(403);
    expect(slugs((await (await tree(ana.cookie, `?ownerId=${ana.id}`)).json()).data)).toEqual(["da-ana"]);
  });

  it("o administrador lista a árvore de outro com ?ownerId=, inclusive rascunhos", async () => {
    await seed(beto.id, "rascunho", { status: "DRAFT" });
    const data = (await (await tree(admin.cookie, `?ownerId=${beto.id}`)).json()).data;
    expect(slugs(data).sort()).toEqual(["do-beto", "rascunho"]);
  });

  it("dois donos podem ter a mesma raiz (índice por dono), mas não no mesmo dono", async () => {
    expect((await create({ title: "Sobre", slug: "sobre", type: "DOCUMENT" }, ana.cookie)).status).toBe(201);
    expect((await create({ title: "Sobre", slug: "sobre", type: "DOCUMENT" }, beto.cookie)).status).toBe(201);
    const again = await create({ title: "Sobre", slug: "sobre", type: "DOCUMENT" }, ana.cookie);
    expect(again.status).toBe(409);
    expect((await errorOf(again)).details[0]).toMatchObject({ field: "slug", suggestion: "sobre-2" });
  });

  it("a sugestão de slug olha só os irmãos do dono", async () => {
    await seed(beto.id, "sobre");
    await seed(beto.id, "sobre-2");
    await seed(ana.id, "sobre");
    const again = await create({ title: "Sobre", slug: "sobre", type: "DOCUMENT" }, ana.cookie);
    expect((await errorOf(again)).details[0].suggestion).toBe("sobre-2");
  });
});

describe("CT39: o autor vem sempre da sessão (RN13)", () => {
  it("o usuário que cria é o autor e o dono", async () => {
    const { data } = await (await create({ title: "A", slug: "a", type: "DOCUMENT" }, ana.cookie)).json();
    expect(data.authorId).toBe(ana.id);
  });

  it("o administrador que cria fica como autor e dono, mesmo informando outro authorId", async () => {
    const response = await create({ title: "A", slug: "a", type: "DOCUMENT", authorId: ana.id }, admin.cookie);
    const { data } = await response.json();

    expect(response.status).toBe(201);
    expect(data.authorId).toBe(admin.userId);
    expect((await content(data.id)).authorId).toBe(admin.userId);
  });

  it("um usuário comum não cria em nome de outro nem altera o autor no PATCH", async () => {
    const { data } = await (await create({ title: "A", slug: "a", type: "DOCUMENT", authorId: beto.id }, ana.cookie)).json();
    expect(data.authorId).toBe(ana.id);

    const patched = await update(data.id, { title: "B", authorId: beto.id }, ana.cookie);
    expect(patched.status).toBe(200);
    expect((await content(data.id)).authorId).toBe(ana.id);
  });

  it("o pai de outro dono é indistinguível do pai inexistente: 422 INVALID_PARENT com a mesma mensagem", async () => {
    const theirs = await seed(beto.id, "colecao-do-beto", { type: "COLLECTION" });

    const foreign = await create({ title: "F", slug: "f", type: "DOCUMENT", parentId: theirs.id }, ana.cookie);
    const missing = await create({ title: "F", slug: "f", type: "DOCUMENT", parentId: "nao-existe" }, ana.cookie);

    expect(foreign.status).toBe(422);
    const [foreignError, missingError] = [await errorOf(foreign), await errorOf(missing)];
    expect(foreignError.code).toBe("INVALID_PARENT");
    expect(foreignError.message).toBe(missingError.message);
    expect(foreignError.details[0].field).toBe(missingError.details[0].field);
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(0);
  });

  it("mover o próprio conteúdo para uma coleção de outro dono também é 422 INVALID_PARENT", async () => {
    const theirs = await seed(beto.id, "colecao-do-beto", { type: "COLLECTION" });
    const mine = await seed(ana.id, "da-ana");

    const response = await update(mine.id, { parentId: theirs.id }, ana.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("INVALID_PARENT");
    expect((await content(mine.id)).parentId).toBeNull();
  });
});

describe("reordenação: o lote é recusado por inteiro (RN05, RN19)", () => {
  it("um item de outro dono recusa o lote inteiro com 403, e nenhum item muda", async () => {
    const a1 = await seed(ana.id, "a1");
    const a2 = await seed(ana.id, "a2", { order: 1 });
    const b1 = await seed(beto.id, "b1");

    const response = await reorder(
      [
        { id: a1.id, order: 5 },
        { id: b1.id, order: 6 },
        { id: a2.id, order: 7 },
      ],
      ana.cookie,
    );

    expect(response.status).toBe(403);
    expect([(await content(a1.id)).order, (await content(a2.id)).order, (await content(b1.id)).order]).toEqual([0, 1, 0]);
  });

  it("o administrador também não reordena a árvore de outro", async () => {
    const a1 = await seed(ana.id, "a1");
    const response = await reorder([{ id: a1.id, order: 5 }], admin.cookie);
    expect(response.status).toBe(403);
    expect((await content(a1.id)).order).toBe(0);
  });

  it("mover um item próprio para uma coleção de outro dono: 422 INVALID_PARENT, nada muda", async () => {
    const a1 = await seed(ana.id, "a1");
    const theirs = await seed(beto.id, "colecao", { type: "COLLECTION" });
    const response = await reorder([{ id: a1.id, parentId: theirs.id, order: 0 }], ana.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("INVALID_PARENT");
    expect((await content(a1.id)).parentId).toBeNull();
  });

  it("o lote do próprio dono funciona e devolve só a árvore dele", async () => {
    const a1 = await seed(ana.id, "a1");
    const a2 = await seed(ana.id, "a2", { order: 1 });
    await seed(beto.id, "b1");

    const response = await reorder(
      [
        { id: a1.id, order: 1 },
        { id: a2.id, order: 0 },
      ],
      ana.cookie,
    );

    expect(response.status).toBe(200);
    expect(slugs((await response.json()).data)).toEqual(["a2", "a1"]);
  });

  it("item inexistente responde 404", async () => {
    expect((await reorder([{ id: "nao-existe", order: 1 }], ana.cookie)).status).toBe(404);
  });
});

describe("CT39: cotas e limites (RN25)", () => {
  it("MAX_CONTENTS_PER_USER: ao atingir o limite, 422 QUOTA_EXCEEDED, e o administrador também tem cota", async () => {
    process.env.MAX_CONTENTS_PER_USER = "2";
    for (const cookie of [ana.cookie, admin.cookie]) {
      expect((await create({ title: "1", slug: "um", type: "DOCUMENT" }, cookie)).status).toBe(201);
      expect((await create({ title: "2", slug: "dois", type: "DOCUMENT" }, cookie)).status).toBe(201);
      const over = await create({ title: "3", slug: "tres", type: "DOCUMENT" }, cookie);
      expect(over.status).toBe(422);
      expect(await errorOf(over)).toMatchObject({ code: "QUOTA_EXCEEDED", details: [{ field: "contents", max: 2 }] });
    }
    // a cota é por usuário: o Beto ainda cria
    expect((await create({ title: "1", slug: "um", type: "DOCUMENT" }, beto.cookie)).status).toBe(201);
  });

  it("MAX_BODY_BYTES conta bytes UTF-8, e não caracteres", async () => {
    process.env.MAX_BODY_BYTES = "10";
    // "ação ação" tem 9 caracteres e 13 bytes; "ação aç" tem 7 caracteres e exatamente 10 bytes
    const over = await create({ title: "A", slug: "a", type: "DOCUMENT", body: "ação ação" }, ana.cookie);
    expect(over.status).toBe(422);
    expect(await errorOf(over)).toMatchObject({ code: "QUOTA_EXCEEDED", details: [{ field: "body", bytes: 13, max: 10 }] });

    expect((await create({ title: "A", slug: "a", type: "DOCUMENT", body: "ação aç" }, ana.cookie)).status).toBe(201);
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(1);
  });

  it("no PATCH, o corpo acima da cota responde 422 e o conteúdo não muda", async () => {
    process.env.MAX_BODY_BYTES = "10";
    const mine = await seed(ana.id, "da-ana", { body: "curto" });
    const response = await update(mine.id, { body: "x".repeat(11), version: mine.updatedAt.toISOString() }, ana.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("QUOTA_EXCEEDED");
    expect((await content(mine.id)).body).toBe("curto");
  });

  it("um valor malformado nas variáveis é ignorado: vale o padrão, a cota nunca desliga", async () => {
    for (const value of ["", "abc", "-5", "0", "1.5"]) {
      process.env.MAX_BODY_BYTES = value;
      const over = await create({ title: "A", slug: `a${value.length}`, type: "DOCUMENT", body: "x".repeat(300_000) }, ana.cookie);
      expect(over.status, value).toBe(422);
    }
  });

  it("corpo muito acima do limite responde 413 PAYLOAD_TOO_LARGE, sem ser lido nem gravado", async () => {
    process.env.MAX_BODY_BYTES = "1000";
    // limite de leitura: 2 × 1000 + 64 KiB
    const huge = JSON.stringify({ title: "A", slug: "a", type: "DOCUMENT", body: "x".repeat(70_000) });
    const response = await create(huge, ana.cookie);

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(0);
  });

  it("entre a cota e o limite de leitura, o corpo é lido e responde 422 (não 413)", async () => {
    process.env.MAX_BODY_BYTES = "1000";
    const response = await create({ title: "A", slug: "a", type: "DOCUMENT", body: "x".repeat(2000) }, ana.cookie);
    expect(response.status).toBe(422);
  });

  it("limite de 60 escritas por minuto em conteúdo: a seguinte responde 429 com Retry-After, por usuário", async () => {
    expect(RATE_LIMITS.content).toBe(60);
    const mine = await seed(ana.id, "da-ana");
    for (let i = 0; i < RATE_LIMITS.content; i++) expect((await update(mine.id, { title: `t${i}` }, ana.cookie)).status).toBe(200);

    const limited = await update(mine.id, { title: "excedente" }, ana.cookie);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    expect((await content(mine.id)).title).toBe("t59");

    // outro usuário não é afetado
    expect((await create({ title: "B", slug: "b", type: "DOCUMENT" }, beto.cookie)).status).toBe(201);
    // leituras não contam
    expect((await getOne(mine.id, ana.cookie)).status).toBe(200);
  });

  it("as recusas por falta de permissão também contam no limite (a taxa vem antes do recurso)", async () => {
    const theirs = await seed(beto.id, "do-beto");
    for (let i = 0; i < RATE_LIMITS.content; i++) expect((await remove(theirs.id, ana.cookie)).status).toBe(403);
    expect((await remove(theirs.id, ana.cookie)).status).toBe(429);
  });
});

describe("CT53 (parte do servidor): versão no PATCH (RN18)", () => {
  it("o PATCH que altera o corpo sem version responde 422 e não altera nada", async () => {
    const mine = await seed(ana.id, "da-ana");
    const response = await update(mine.id, { body: "novo" }, ana.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details).toEqual([
      { field: "version", message: "Informe a versão em que o texto se baseou (campo version)." },
    ]);
    expect((await content(mine.id)).body).toBe("original");
  });

  it("corpo nulo (limpar o texto) também exige a versão", async () => {
    const mine = await seed(ana.id, "da-ana");
    expect((await update(mine.id, { body: null }, ana.cookie)).status).toBe(422);
  });

  it("com a versão atual, grava e devolve o novo updatedAt", async () => {
    const mine = await seed(ana.id, "da-ana");
    const response = await update(mine.id, { body: "novo", version: mine.updatedAt.toISOString() }, ana.cookie);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.body).toBe("novo");
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThanOrEqual(mine.updatedAt.getTime());
  });

  it("com a versão desatualizada, 409 VERSION_CONFLICT com a versão atual em details[0].value, sem alterar nada", async () => {
    const mine = await seed(ana.id, "da-ana");
    const opened = mine.updatedAt.toISOString();

    // outra aba grava primeiro
    const first = await update(mine.id, { body: "da outra aba", version: opened }, ana.cookie);
    const current = (await first.json()).data.updatedAt;
    expect(current).not.toBe(opened);

    const stale = await update(mine.id, { body: "da aba antiga", version: opened }, ana.cookie);

    expect(stale.status).toBe(409);
    const error = await errorOf(stale);
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(error.details[0]).toEqual({ field: "version", value: current });
    expect((await content(mine.id)).body).toBe("da outra aba");
  });

  it("reenviar com a versão atual é a escolha explícita de sobrescrever", async () => {
    const mine = await seed(ana.id, "da-ana");
    await update(mine.id, { body: "outra aba", version: mine.updatedAt.toISOString() }, ana.cookie);
    const conflict = await update(mine.id, { body: "minha", version: mine.updatedAt.toISOString() }, ana.cookie);
    const currentVersion = (await errorOf(conflict)).details[0].value;

    const retry = await update(mine.id, { body: "minha", version: currentVersion }, ana.cookie);

    expect(retry.status).toBe(200);
    expect((await content(mine.id)).body).toBe("minha");
  });

  it("a versão também é conferida quando vem com outro campo, e uma versão ilegível é 422", async () => {
    const mine = await seed(ana.id, "da-ana");
    await update(mine.id, { title: "T1" }, ana.cookie); // muda o updatedAt sem exigir version

    expect((await update(mine.id, { title: "T2", version: mine.updatedAt.toISOString() }, ana.cookie)).status).toBe(409);
    expect((await update(mine.id, { title: "T3", version: "ontem" }, ana.cookie)).status).toBe(422);
    expect((await content(mine.id)).title).toBe("T1");
  });

  it("alterar só o estado, o título ou o pai não exige a versão", async () => {
    const mine = await seed(ana.id, "da-ana");
    expect((await update(mine.id, { status: "DRAFT" }, ana.cookie)).status).toBe(200);
    expect((await update(mine.id, { title: "Novo título" }, ana.cookie)).status).toBe(200);
  });

  it("só a versão, sem nenhum campo do conteúdo, responde 422", async () => {
    const mine = await seed(ana.id, "da-ana");
    expect((await update(mine.id, { version: mine.updatedAt.toISOString() }, ana.cookie)).status).toBe(422);
  });

  it("o conflito entre o dono e o administrador: o administrador também tem de informar a versão (RN18)", async () => {
    const mine = await seed(ana.id, "da-ana");
    await update(mine.id, { body: "do dono", version: mine.updatedAt.toISOString() }, ana.cookie);

    const response = await update(
      mine.id,
      { body: "do admin", version: mine.updatedAt.toISOString(), reason: "correção" },
      admin.cookie,
    );

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("VERSION_CONFLICT");
    expect((await content(mine.id)).body).toBe("do dono");
    expect(await prisma.notification.count()).toBe(0); // nada aplicado, nada notificado
  });
});

describe("GET/PUT /api/appearance: a aparência é do próprio usuário (RN19)", () => {
  const get = (cookie) => appearanceRoute.GET(apiRequest("/api/appearance", { cookie }));
  const put = (body, cookie, headers = {}) =>
    appearanceRoute.PUT(apiRequest("/api/appearance", { method: "PUT", body, cookie, headers }));

  it("sem aparência salva, devolve os padrões sem escrever no banco", async () => {
    const response = await get(ana.cookie);
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ownerId: ana.id, siteName: "Ana", persisted: false });
    expect(await prisma.appearance.count()).toBe(0);
  });

  it("PUT parcial grava a aparência do usuário e devolve avisos; a do outro não muda", async () => {
    const response = await put({ siteName: "Espaço da Ana", primaryColor: "#FFFF00", darkPrimaryColor: "#112233" }, ana.cookie);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ ownerId: ana.id, siteName: "Espaço da Ana", primaryColor: "#FFFF00", darkPrimaryColor: "#112233", persisted: true });
    expect(body.warnings.map((/** @type {any} */ w) => w.field)).toContain("primaryColor");

    expect((await (await get(beto.cookie)).json()).data).toMatchObject({ siteName: "Beto", persisted: false });
    expect(await prisma.appearance.count()).toBe(1);
  });

  it("o administrador edita apenas a própria aparência: não há como informar a de outro", async () => {
    const response = await put({ siteName: "Do admin", ownerId: ana.id }, admin.cookie);
    expect(response.status).toBe(200);
    expect((await response.json()).data.ownerId).toBe(admin.userId);
    expect(await prisma.appearance.findUnique({ where: { ownerId: ana.id } })).toBeNull();
  });

  it("cor inválida, link malicioso e corpo vazio respondem 422", async () => {
    expect((await put({ primaryColor: "vermelho" }, ana.cookie)).status).toBe(422);
    expect((await put({ githubUrl: "javascript:alert(1)" }, ana.cookie)).status).toBe(422);
    expect((await put({}, ana.cookie)).status).toBe(422);
    expect(await prisma.appearance.count()).toBe(0);
  });

  it("campos do portal (homeBody, directoryEnabled) não passam pela aparência do usuário", async () => {
    expect((await put({ homeBody: "x", directoryEnabled: true }, ana.cookie)).status).toBe(422);
  });

  it("usa o limite de escritas de conteúdo e a verificação de origem", async () => {
    expect((await put({ siteName: "x" }, ana.cookie, { origin: "https://malicioso.test" })).status).toBe(401);
    for (let i = 0; i < RATE_LIMITS.content; i++) expect((await put({ siteName: `n${i}` }, ana.cookie)).status).toBe(200);
    expect((await put({ siteName: "excedente" }, ana.cookie)).status).toBe(429);
  });

  it("senha provisória bloqueia a aparência", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", mustChangePassword: true });
    expect((await get(carla.cookie)).status).toBe(403);
    expect((await put({ siteName: "x" }, carla.cookie)).status).toBe(403);
  });
});

describe("/api/configuration: só o administrador (RN19, RF30)", () => {
  const get = (cookie) => configurationRoute.GET(apiRequest("/api/configuration", { cookie }));
  const put = (body, cookie) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie }));

  it("usuário comum recebe 403 em ler e em alterar, sem alterar nada", async () => {
    const read = await get(ana.cookie);
    expect(read.status).toBe(403);
    expect((await errorOf(read)).code).toBe("FORBIDDEN");

    const write = await put({ siteName: "Invadido" }, ana.cookie);
    expect(write.status).toBe(403);
    expect(await prisma.configuration.count({ where: { siteName: "Invadido" } })).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o administrador lê e altera, inclusive as paletas noturnas, o portal e o diretório", async () => {
    const response = await put(
      { siteName: "Portal", darkPrimaryColor: "#112233", homeBody: "# Bem-vindo", directoryEnabled: false },
      admin.cookie,
    );
    const { data, warnings } = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ siteName: "Portal", darkPrimaryColor: "#112233", homeBody: "# Bem-vindo", directoryEnabled: false });
    expect(Array.isArray(warnings)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/");
    expect((await (await get(admin.cookie)).json()).data.siteName).toBe("Portal");
  });

  it("o texto do portal respeita a cota de bytes do corpo (RN25): 422 QUOTA_EXCEEDED", async () => {
    process.env.MAX_BODY_BYTES = "10";
    const response = await put({ homeBody: "x".repeat(11) }, admin.cookie);

    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("QUOTA_EXCEEDED");
    expect((await prisma.configuration.findFirst())?.homeBody ?? null).toBeNull();
  });

  it("corpo muito acima do limite responde 413", async () => {
    process.env.MAX_BODY_BYTES = "1000";
    const response = await configurationRoute.PUT(
      apiRequest("/api/configuration", { method: "PUT", body: JSON.stringify({ homeBody: "x".repeat(70_000) }), cookie: admin.cookie }),
    );
    expect(response.status).toBe(413);
  });
});
