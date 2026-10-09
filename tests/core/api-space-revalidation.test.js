// Revalidação por espaço nas rotas de aparência, de conta e de conteúdo (A-014 Parte 2, item 3; RN10,
// ADR-030; CT44, CT22, CT32 no que é do servidor): caminhos LITERAIS, calculados antes e depois da
// escrita; a aparência, o handle (antigo e novo) e a suspensão invalidam o espaço inteiro; um autor
// nunca invalida as páginas de outro; nunca `revalidatePath("/", "layout")`. `revalidatePath` é
// substituído para conferir as chamadas. better-auth real sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as appearanceRoute from "@/app/api/appearance/route";
import * as contentRoute from "@/app/api/contents/[id]/route";
import * as banRoute from "@/app/api/users/[id]/ban/route";
import * as userRoute from "@/app/api/users/[id]/route";
import * as meRoute from "@/app/api/users/me/route";
import * as usersRoute from "@/app/api/users/route";
import { createContent, prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

/** Espaço da Ana: duas coleções, um documento e um rascunho (que nunca é público). */
async function seedSpace(authorId) {
  const calculo = await createContent({ title: "Cálculo", slug: "calculo", type: "COLLECTION", authorId });
  await createContent({ title: "Limites", slug: "limites", type: "DOCUMENT", authorId, parentId: calculo.id, body: "x" });
  await createContent({ title: "Rascunho", slug: "rascunho", type: "DOCUMENT", authorId, status: "DRAFT" });
  await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId, body: "x" });
}
const ANA_PAGES = ["/ana", "/ana/calculo", "/ana/calculo/limites", "/ana/sobre"];

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
  await seedSpace(ana.id);
  vi.mocked(revalidatePath).mockClear();
});

const pages = () =>
  vi.mocked(revalidatePath).mock.calls.filter((call) => call.length === 1 && call[0] !== "/").map((call) => call[0]).sort();
const portalCalls = () => vi.mocked(revalidatePath).mock.calls.filter((call) => call[0] === "/");
const noLayout = () => expect(vi.mocked(revalidatePath).mock.calls.some((call) => call[1] === "layout")).toBe(false);

const putAppearance = (body, cookie) =>
  appearanceRoute.PUT(apiRequest("/api/appearance", { method: "PUT", body, cookie }));
const patchUser = (id, body) =>
  userRoute.PATCH(apiRequest(`/api/users/${id}`, { method: "PATCH", body, cookie: admin.cookie }), routeContext({ id }));
const deleteUser = (id, query = "") =>
  userRoute.DELETE(apiRequest(`/api/users/${id}${query}`, { method: "DELETE", cookie: admin.cookie }), routeContext({ id }));
const ban = (id) =>
  banRoute.POST(apiRequest(`/api/users/${id}/ban`, { method: "POST", body: { reason: "spam" }, cookie: admin.cookie }), routeContext({ id }));
const unban = (id) =>
  banRoute.DELETE(apiRequest(`/api/users/${id}/ban`, { method: "DELETE", cookie: admin.cookie }), routeContext({ id }));

// A paleta de um modo é uma unidade (as três cores; ADR-038): uma cor sozinha seria 422.
const NEW_PALETTE = { primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" };

describe("aparência do dono (RN10): o espaço inteiro", () => {
  it("só a paleta mudou: a página inicial e todos os caminhos públicos do dono, sem o portal e sem o rascunho", async () => {
    const response = await putAppearance(NEW_PALETTE, ana.cookie);

    expect(response.status).toBe(200);
    expect(pages()).toEqual(ANA_PAGES);
    expect(portalCalls()).toEqual([]);
    noLayout();
  });

  it.each([["siteName", { siteName: "Notas da Ana" }], ["siteDescription", { siteDescription: "Cálculo" }]])(
    "%s mudou: o espaço inteiro e também o portal, que mostra o diretório (RN28)",
    async (_field, body) => {
      await putAppearance(body, ana.cookie);

      expect(pages()).toEqual(ANA_PAGES);
      expect(portalCalls()).toEqual([["/"]]);
    },
  );

  it("corpo inválido (422): nada é revalidado", async () => {
    expect((await putAppearance({ primaryColor: "vermelho" }, ana.cookie)).status).toBe(422);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a aparência de um autor não invalida as páginas de outro (CT44)", async () => {
    await seedSpace(beto.id);
    vi.mocked(revalidatePath).mockClear();

    await putAppearance(NEW_PALETTE, beto.cookie);

    expect(pages().every((page) => page === "/beto" || page.startsWith("/beto/"))).toBe(true);
    expect(pages()).toContain("/beto/sobre");
  });

  it("sem handle, o espaço não tem URL: nada é revalidado", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", name: "Carla" });

    expect((await putAppearance(NEW_PALETTE, carla.cookie)).status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("conteúdo: um autor não invalida o espaço de outro (CT44)", () => {
  it("editar o título de um documento da Ana toca só o espaço /ana, inteiro", async () => {
    await seedSpace(beto.id);
    const target = await prisma.content.findFirstOrThrow({ where: { authorId: ana.id, slug: "sobre" } });
    vi.mocked(revalidatePath).mockClear();

    const response = await contentRoute.PATCH(
      apiRequest(`/api/contents/${target.id}`, { method: "PATCH", body: { title: "Sobre mim" }, cookie: ana.cookie }),
      routeContext({ id: target.id }),
    );

    expect(response.status).toBe(200);
    // O espaço inteiro da Ana (a sidebar de cada página muda), e nenhuma página do Beto.
    expect(pages()).toEqual(ANA_PAGES);
    expect(pages().some((page) => page.startsWith("/beto"))).toBe(false);
    noLayout();
  });
});

describe("handle (RN10, RN20): o antigo e o novo", () => {
  it("mudar o handle invalida o espaço inteiro sob os dois handles e o portal", async () => {
    const response = await patchUser(ana.id, { handle: "ana-maria" });

    expect(response.status).toBe(200);
    expect(pages()).toEqual([...ANA_PAGES, ...ANA_PAGES.map((page) => page.replace("/ana", "/ana-maria"))].sort());
    expect(portalCalls()).toEqual([["/"]]);
    noLayout();
  });

  it("dar um handle a quem não tinha: as páginas do novo handle e o portal", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", name: "Carla" });
    await seedSpace(carla.id);
    vi.mocked(revalidatePath).mockClear();

    await patchUser(carla.id, { handle: "carla" });

    expect(pages()).toEqual(ANA_PAGES.map((page) => page.replace("/ana", "/carla")).sort());
  });

  it("remover o handle: as páginas antigas saem do ar (retirar o handle quebra as URLs)", async () => {
    const response = await patchUser(ana.id, { handle: null });

    expect(response.status).toBe(200);
    expect(pages()).toEqual(ANA_PAGES);
    expect(portalCalls()).toEqual([["/"]]);
  });

  it("reenviar o mesmo handle não revalida o espaço", async () => {
    await patchUser(ana.id, { handle: "ana" });

    expect(pages()).toEqual([]);
    expect(portalCalls()).toEqual([]);
  });

  it("mudar só o nome: só o portal (o diretório mostra o nome); só o papel: nada", async () => {
    await patchUser(ana.id, { name: "Ana Maria" });
    expect(pages()).toEqual([]);
    expect(portalCalls()).toEqual([["/"]]);

    vi.mocked(revalidatePath).mockClear();
    await patchUser(ana.id, { role: "admin" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("handle repetido (409): nada é revalidado", async () => {
    const response = await patchUser(ana.id, { handle: "beto" });

    expect(response.status).toBe(409);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o próprio usuário que muda o nome em /api/users/me revalida só o portal", async () => {
    const response = await meRoute.PATCH(
      apiRequest("/api/users/me", { method: "PATCH", body: { name: "Ana Souza" }, cookie: ana.cookie }),
    );

    expect(response.status).toBe(200);
    expect(pages()).toEqual([]);
    expect(portalCalls()).toEqual([["/"]]);
  });

  it("criar uma conta com handle invalida a página inicial dele; sem handle, nada", async () => {
    const create = (body) => usersRoute.POST(apiRequest("/api/users", { method: "POST", body, cookie: admin.cookie }));

    expect((await create({ email: "dora@exemplo.test", name: "Dora", handle: "dora" })).status).toBe(201);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/dora"]]);

    vi.mocked(revalidatePath).mockClear();
    expect((await create({ email: "eva@exemplo.test", name: "Eva" })).status).toBe(201);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("suspensão (RN23): o espaço inteiro e o portal", () => {
  it("suspender invalida o espaço do suspenso, antes de revogar as sessões, e o portal", async () => {
    const response = await ban(ana.id);

    expect(response.status).toBe(200);
    expect(pages()).toEqual(ANA_PAGES); // o espaço passa a responder 404; o conteúdo continua no banco
    expect(portalCalls()).toEqual([["/"]]);
    expect(await prisma.content.count({ where: { authorId: ana.id } })).toBe(4);
    noLayout();
  });

  it("reativar invalida o espaço de novo", async () => {
    await ban(ana.id);
    vi.mocked(revalidatePath).mockClear();

    const response = await unban(ana.id);

    expect(response.status).toBe(200);
    expect(pages()).toEqual(ANA_PAGES);
    expect(portalCalls()).toEqual([["/"]]);
  });

  it("ninguém suspende a si mesmo (403): nada é revalidado", async () => {
    const response = await ban(admin.userId);

    expect(response.status).toBe(403);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a suspensão de um autor não toca o espaço de outro (CT44)", async () => {
    await seedSpace(beto.id);
    vi.mocked(revalidatePath).mockClear();

    await ban(ana.id);

    expect(pages().some((page) => page.startsWith("/beto"))).toBe(false);
  });
});

describe("exclusão de usuário (RN24): o espaço que sai do ar e o do destino", () => {
  it("excluir o conteúdo junto: as páginas do excluído saem do ar, e o portal", async () => {
    const response = await deleteUser(ana.id, "?content=delete");

    expect(response.status).toBe(200);
    expect(pages()).toEqual(ANA_PAGES);
    expect(portalCalls()).toEqual([["/"]]);
    noLayout();
  });

  it("transferir: as páginas antigas saem do ar e o espaço do destino é revalidado por inteiro, com o que chegou", async () => {
    await createContent({ title: "Meu", slug: "meu", type: "DOCUMENT", authorId: beto.id, body: "x" });
    vi.mocked(revalidatePath).mockClear();

    const response = await deleteUser(ana.id, `?content=transfer&to=${beto.id}`);

    expect(response.status).toBe(200);
    const urls = pages();
    for (const page of ANA_PAGES) expect(urls).toContain(page); // o espaço extinto
    for (const page of ["/beto", "/beto/meu", "/beto/calculo", "/beto/calculo/limites", "/beto/sobre"]) {
      expect(urls).toContain(page); // o destino, com o conteúdo transferido
    }
    expect(urls.some((page) => page.includes("rascunho"))).toBe(false);
    expect(portalCalls().length).toBeGreaterThan(0);
    noLayout();
  });

  it("a recusa (409 USER_HAS_CONTENT) não revalida nada", async () => {
    const response = await deleteUser(ana.id);

    expect(response.status).toBe(409);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("excluir quem não tinha handle nem conteúdo não revalida nada", async () => {
    const carla = await createUserSession({ email: "carla@exemplo.test", name: "Carla" });

    expect((await deleteUser(carla.id)).status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
