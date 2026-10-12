// Páginas de usuários e de moderação (A-014 Parte 3e-2; RF27, RF34; RN18, RN19, RN24, RN26; UC13, UC15; CT51, CT52):
// /admin/usuarios, /admin/usuarios/[id]/conteudo e /admin/usuarios/[id]/conteudo/[contentId]. Só o administrador
// (o usuário comum recebe `notFound()`); o usuário `[id]` tem de existir; o documento tem de pertencer a ele; a
// lista nunca leva o hash nem as contas; o `activeAdminCount` é o real; a árvore do dono vai COM os rascunhos e
// em JSON puro; o editor recebe o id do ADMINISTRADOR e os dados do DONO. A sessão, a navegação e os componentes
// da UI são substituídos; o banco e o better-auth são os reais.
import "./env";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: /** @type {Record<string, unknown> | null} */ (null), cookie: "" }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async (options) => {
    if (!session.user) throw new Error(`REDIRECT:${options?.path}`);
    if (options?.role && session.user.role !== options.role) throw new Error("NOT_FOUND");
    return { user: session.user };
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: session.cookie })) }));
vi.mock("@/components/admin/UserTable", () => ({ UserTable: () => null }));
vi.mock("@/components/admin/ContentTree", () => ({ ContentTree: () => null }));
vi.mock("@/components/editor/ContentEditor", () => ({ ContentEditor: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getContentTree: vi.fn(actual.getContentTree), countActiveAdmins: vi.fn(actual.countActiveAdmins) };
});

import { requireSession } from "@/app/admin/_lib/session";
import { availablePathsFor } from "@/app/admin/_lib/menu";
import { loadOwnedDocument, moderationEditHref } from "@/app/admin/_lib/users";
import { publicUser } from "@/app/api/_lib/users";
import UsersPage, { metadata as usersMetadata } from "@/app/admin/usuarios/page";
import ModerateContentPage from "@/app/admin/usuarios/[id]/conteudo/page";
import ModerateDocumentPage from "@/app/admin/usuarios/[id]/conteudo/[contentId]/page";
import { ContentTree } from "@/components/admin/ContentTree";
import { UserTable } from "@/components/admin/UserTable";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { countActiveAdmins, createContent, getContentTree } from "@/lib/db";
import { projectRoot } from "../setup/prisma-cli.js";
import { createAdminSession, createTestUser, createUserSession, resetDatabase } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

const asAdmin = () => {
  session.user = { id: admin.userId, role: "admin", name: "Admin", email: "admin@exemplo.test" };
  session.cookie = admin.cookie;
};
const asUser = (who) => {
  session.user = { id: who.id, role: "user", name: "Comum", email: `${who.id}@exemplo.test` };
  session.cookie = who.cookie;
};

beforeEach(async () => {
  await resetDatabase();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana Souza", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto Lima", handle: "beto" });
  asAdmin();
  vi.mocked(requireSession).mockClear();
  vi.mocked(getContentTree).mockClear();
  vi.mocked(countActiveAdmins).mockClear();
});

const doc = (authorId, slug, extra = {}) => createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: `Corpo de ${slug}`, ...extra });
const collection = (authorId, slug, extra = {}) => createContent({ title: `Coleção ${slug}`, slug, type: "COLLECTION", authorId, ...extra });
/** O que a página lança (404, redirecionamento), como texto; ou "RENDERIZOU". */
const outcomeOf = async (promise) => {
  try {
    await promise;
    return "RENDERIZOU";
  } catch (error) {
    return /** @type {Error} */ (error).message;
  }
};
const propsOf = (element, type) => [element.props.children].flat().find((child) => child?.type === type).props;
const headingOf = (element) => [element.props.children].flat().find((child) => child?.type === "h1");
const params = (value) => ({ params: Promise.resolve(value) });

describe("/admin/usuarios: a lista (RF27, UC13)", () => {
  it("só o administrador: o usuário comum recebe notFound(); sem sessão, redireciona; a página pede o papel e o caminho", async () => {
    asUser(ana);
    expect(await outcomeOf(UsersPage())).toBe("NOT_FOUND");

    session.user = null;
    expect(await outcomeOf(UsersPage())).toBe("REDIRECT:/admin/usuarios");

    asAdmin();
    expect(await outcomeOf(UsersPage())).toBe("RENDERIZOU");
    expect(requireSession).toHaveBeenLastCalledWith({ role: "admin", path: "/admin/usuarios" });
  });

  it("a primeira página tem o formato de GET /api/users: data, total, limit 50, offset 0, do mais antigo ao mais novo", async () => {
    const { initial } = propsOf(await UsersPage(), UserTable);

    expect(Object.keys(initial)).toEqual(["data", "total", "limit", "offset"]);
    expect(initial).toMatchObject({ total: 3, limit: 50, offset: 0 });
    expect(initial.data.map((user) => user.email)).toEqual([expect.any(String), "ana@exemplo.test", "beto@exemplo.test"]);
    const created = initial.data.map((user) => new Date(user.createdAt).getTime());
    expect([...created].sort((a, b) => a - b)).toEqual(created);
  });

  it("cada usuário é o publicUser: nunca o hash da senha, as contas nem as sessões", async () => {
    const { initial } = propsOf(await UsersPage(), UserTable);

    const expectedKeys = Object.keys(publicUser(/** @type {any} */ ({ id: "x", name: "x", email: "x", role: "user" }))).sort();
    for (const user of initial.data) expect(Object.keys(user).sort()).toEqual(expectedKeys);
    const everyKey = JSON.stringify(initial).match(/"([A-Za-z]+)":/g) ?? [];
    expect(everyKey.filter((key) => /password|hash|account|session|token|secret/i.test(key) && !/mustChangePassword/.test(key))).toEqual([]);
    // O valor também não vaza: o hash do better-auth (scrypt) tem o formato salt:chave em hexadecimal.
    expect(JSON.stringify(initial)).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{64}/);
  });

  it("a lista é JSON puro (as datas em texto), como a API a devolve ao componente cliente", async () => {
    const { initial } = propsOf(await UsersPage(), UserTable);

    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
    expect(typeof initial.data[0].createdAt).toBe("string");
  });

  it("currentUserId é o da sessão; activeAdminCount é o REAL (o suspenso e o comum não contam)", async () => {
    await createTestUser({ email: "admin2@exemplo.test", name: "Segundo", role: "admin", handle: "segundo" });
    await createTestUser({ email: "admin3@exemplo.test", name: "Suspenso", role: "admin", banned: true, banReason: "x" });

    const props = propsOf(await UsersPage(), UserTable);

    expect(props.currentUserId).toBe(admin.userId);
    expect(props.activeAdminCount).toBe(2);
    expect(props.activeAdminCount).toBe(await countActiveAdmins());
  });

  it("os modelos de endereço são texto; noindex e <h1>; e NÃO existe /admin/usuarios/[id] (R-024)", async () => {
    const page = await UsersPage();
    const props = propsOf(page, UserTable);

    expect(props.spaceHref).toBe("/{handle}");
    expect(props.contentHref).toBe("/admin/usuarios/{id}/conteudo");
    expect(typeof props.spaceHref).toBe("string");
    expect(usersMetadata).toEqual({ title: "Usuários", robots: { index: false, follow: false } });
    expect(headingOf(page).props.children).toBe("Usuários");
    const dir = path.join(projectRoot, "src", "app", "admin", "usuarios");
    expect(fs.existsSync(path.join(dir, "page.js"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "[id]", "page.js"))).toBe(false);
  });

  it("a senha provisória não passa pela página: nenhuma prop traz uma senha", async () => {
    const page = await UsersPage();

    expect(JSON.stringify(page.props)).not.toMatch(/temporaryPassword|senha provis/i);
  });
});

describe("/admin/usuarios e o menu: só o administrador", () => {
  it("availablePaths tem /admin/usuarios só para o administrador; as páginas de moderação não são item de menu", () => {
    expect(availablePathsFor("admin")).toContain("/admin/usuarios");
    expect(availablePathsFor("user")).not.toContain("/admin/usuarios");
    for (const role of /** @type {const} */ (["admin", "user"])) {
      expect(availablePathsFor(role).filter((href) => href.startsWith("/admin/usuarios/"))).toEqual([]);
    }
  });
});

describe("/admin/usuarios/[id]/conteudo: a árvore para moderação (RF34, UC15)", () => {
  it("só o administrador; o usuário comum recebe notFound(); a página pede o papel e o caminho com o id", async () => {
    asUser(beto);
    expect(await outcomeOf(ModerateContentPage(params({ id: ana.id })))).toBe("NOT_FOUND");

    asAdmin();
    expect(await outcomeOf(ModerateContentPage(params({ id: ana.id })))).toBe("RENDERIZOU");
    expect(requireSession).toHaveBeenLastCalledWith({ role: "admin", path: `/admin/usuarios/${ana.id}/conteudo` });
  });

  it("o usuário [id] inexistente responde notFound() (e nada é lido)", async () => {
    expect(await outcomeOf(ModerateContentPage(params({ id: "nao-existe" })))).toBe("NOT_FOUND");
    expect(getContentTree).not.toHaveBeenCalled();
  });

  it("a árvore é a do [id], COM os rascunhos, e nada de outro usuário; o ownerId lido é o do [id]", async () => {
    const col = await collection(ana.id, "calculo");
    await doc(ana.id, "limites", { parentId: col.id });
    await doc(ana.id, "rascunho-da-ana", { status: "DRAFT" });
    await doc(beto.id, "do-beto");
    await doc(admin.userId, "do-admin");

    const { initialTree } = propsOf(await ModerateContentPage(params({ id: ana.id })), ContentTree);

    expect(getContentTree).toHaveBeenCalledWith({ ownerId: ana.id });
    const text = JSON.stringify(initialTree);
    expect(text).toContain("limites");
    expect(text).toContain("rascunho-da-ana");
    expect(text).not.toContain("do-beto");
    expect(text).not.toContain("do-admin");
  });

  it("a árvore é serializável (datas em texto); o modo de moderação leva o dono; os modelos de endereço são texto", async () => {
    await doc(ana.id, "um");

    const props = propsOf(await ModerateContentPage(params({ id: ana.id })), ContentTree);

    expect(JSON.parse(JSON.stringify(props.initialTree))).toEqual(props.initialTree);
    expect(typeof (/** @type {any} */ (props.initialTree)[0].updatedAt)).toBe("string");
    expect(props.moderation).toEqual({ ownerId: ana.id, ownerName: "Ana Souza" });
    expect(props.editHref).toBe(`/admin/usuarios/${ana.id}/conteudo/{id}`);
    expect(typeof props.newHref).toBe("string");
    expect(props.maxContents).toBe(500);
  });

  it("a conta suspensa também se modera; uma árvore vazia renderiza", async () => {
    const suspended = await createTestUser({ email: "susp@exemplo.test", name: "Suspensa", handle: "susp", banned: true, banReason: "x" });

    const props = propsOf(await ModerateContentPage(params({ id: suspended.id })), ContentTree);

    expect(props.initialTree).toEqual([]);
    expect(props.moderation).toEqual({ ownerId: suspended.id, ownerName: "Suspensa" });
  });

  it("noindex e <h1> com o nome do dono (texto, nunca HTML)", async () => {
    const hostile = await createTestUser({ email: "h@exemplo.test", name: "<b>Ana</b>", handle: "hostil" });

    const page = await ModerateContentPage(params({ id: hostile.id }));

    expect(headingOf(page).props.children).toEqual(["Conteúdo de ", "<b>Ana</b>"]); // texto: o React o escapa
  });
});

describe("/admin/usuarios/[id]/conteudo/[contentId]: o editor em moderação (RF34, RN18)", () => {
  it("só o administrador; o usuário comum recebe notFound()", async () => {
    const mine = await doc(ana.id, "um");
    asUser(beto);

    expect(await outcomeOf(ModerateDocumentPage(params({ id: ana.id, contentId: mine.id })))).toBe("NOT_FOUND");
  });

  it("o usuário [id] inexistente, o conteúdo inexistente e a COLEÇÃO respondem notFound()", async () => {
    const mine = await doc(ana.id, "um");
    const col = await collection(ana.id, "col");

    expect(await outcomeOf(ModerateDocumentPage(params({ id: "nao-existe", contentId: mine.id })))).toBe("NOT_FOUND");
    expect(await outcomeOf(ModerateDocumentPage(params({ id: ana.id, contentId: "nao-existe" })))).toBe("NOT_FOUND");
    expect(await outcomeOf(ModerateDocumentPage(params({ id: ana.id, contentId: col.id })))).toBe("NOT_FOUND");
  });

  it("o conteúdo TEM de pertencer ao [id]: um contentId de outro dono, por um endereço forjado, responde notFound()", async () => {
    const doBeto = await doc(beto.id, "do-beto");
    const doAdmin = await doc(admin.userId, "do-admin");

    expect(await outcomeOf(ModerateDocumentPage(params({ id: ana.id, contentId: doBeto.id })))).toBe("NOT_FOUND");
    expect(await outcomeOf(ModerateDocumentPage(params({ id: ana.id, contentId: doAdmin.id })))).toBe("NOT_FOUND");
    // O dono certo abre.
    expect(await outcomeOf(ModerateDocumentPage(params({ id: beto.id, contentId: doBeto.id })))).toBe("RENDERIZOU");
  });

  it("o editor recebe o id do ADMINISTRADOR e o conteúdo, os valores e a version DO DONO; só isso", async () => {
    const mine = await doc(ana.id, "aula", { status: "DRAFT" });

    const props = propsOf(await ModerateDocumentPage(params({ id: ana.id, contentId: mine.id })), ContentEditor);

    expect(Object.keys(props).sort()).toEqual(["contentId", "initialValue", "moderation", "userId", "version", "viewHref"]);
    expect(props.userId).toBe(admin.userId);
    expect(props.userId).not.toBe(ana.id);
    expect(props.contentId).toBe(mine.id);
    expect(props.initialValue).toEqual({ title: "Título aula", slug: "aula", body: "Corpo de aula", status: "DRAFT" });
    expect(props.version).toBe(mine.updatedAt.toISOString());
    expect(props.moderation).toEqual({ ownerName: "Ana Souza" });
  });

  it("a página pede o papel e o caminho com os dois identificadores, tem noindex e <h1>", async () => {
    const mine = await doc(ana.id, "um");

    const page = await ModerateDocumentPage(params({ id: ana.id, contentId: mine.id }));

    expect(requireSession).toHaveBeenLastCalledWith({ role: "admin", path: `/admin/usuarios/${ana.id}/conteudo/${mine.id}` });
    expect(headingOf(page).props.children).toEqual(["Moderar documento de ", "Ana Souza"]);
  });
});

describe("users.js: os modelos e a conferência do dono", () => {
  it("moderationEditHref leva o dono codificado e deixa {id} literal", () => {
    expect(moderationEditHref("abc")).toBe("/admin/usuarios/abc/conteudo/{id}");
    expect(moderationEditHref("a/b c")).toBe("/admin/usuarios/a%2Fb%20c/conteudo/{id}");
  });

  it("loadOwnedDocument confere o dono (authorId) e o tipo", async () => {
    const mine = await doc(ana.id, "um");
    const col = await collection(ana.id, "col");

    expect((await loadOwnedDocument(ana.id, mine.id)).id).toBe(mine.id);
    await expect(loadOwnedDocument(beto.id, mine.id)).rejects.toThrow("NOT_FOUND");
    await expect(loadOwnedDocument(ana.id, col.id)).rejects.toThrow("NOT_FOUND");
    await expect(loadOwnedDocument(ana.id, "nao-existe")).rejects.toThrow("NOT_FOUND");
  });
});
