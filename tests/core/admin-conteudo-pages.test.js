// Páginas /admin/conteudo, /admin/perfil e a visão geral /admin (A-014 Parte 3e-1; RF03, RF06, RF07, RF26, RF28,
// RF29, RN19, RN25; CT10 a CT12): a árvore é a DO USUÁRIO DA SESSÃO (nunca de um identificador da URL; a de outro
// usuário não aparece), serializável para o Componente Cliente, com os modelos de endereço de edição e de
// criação; o perfil leva só os quatro campos do formulário e o endereço do espaço; a visão geral leva os números
// do próprio usuário. A sessão e os componentes da UI são substituídos; o banco é o SQLite temporário.
import "./env";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: /** @type {Record<string, unknown> | null} */ (null) }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async (options) => {
    if (!session.user) throw new Error(`REDIRECT:${options?.path}`);
    return { user: session.user };
  }),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/admin/ContentTree", () => ({ ContentTree: () => null }));
vi.mock("@/components/admin/ProfileForm", () => ({ ProfileForm: () => null }));
vi.mock("@/components/admin/AdminOverview", () => ({ AdminOverview: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getContentTree: vi.fn(actual.getContentTree), countUnread: vi.fn(actual.countUnread) };
});

import { requireSession } from "@/app/admin/_lib/session";
import { EDIT_HREF, NEW_HREF, countContents, serializableTree, spaceHrefOf } from "@/app/admin/_lib/content-tree";
import { availablePathsFor } from "@/app/admin/_lib/menu";
import AdminPage from "@/app/admin/page";
import ContentPage, { metadata as contentMetadata } from "@/app/admin/conteudo/page";
import ProfilePage, { metadata as profileMetadata } from "@/app/admin/perfil/page";
import { ProfileFormWithRefresh } from "@/app/admin/perfil/ProfileFormWithRefresh";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { ContentTree } from "@/components/admin/ContentTree";
import { ProfileForm } from "@/components/admin/ProfileForm";
import { countUnread, createContent, getContentTree, notify } from "@/lib/db";
import { projectRoot } from "../setup/prisma-cli.js";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string, name: string, email: string, handle: string | null, role: string }} */
let ana;
/** @type {{ id: string, name: string, email: string, handle: string | null, role: string }} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  const a = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  const b = await createTestUser({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
  ana = { id: a.id, name: "Ana", email: "ana@exemplo.test", handle: "ana", role: "user" };
  beto = { id: b.id, name: "Beto", email: "beto@exemplo.test", handle: "beto", role: "user" };
  session.user = ana;
  vi.mocked(requireSession).mockClear();
  vi.mocked(getContentTree).mockClear();
  router.refresh.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const doc = (authorId, slug, extra = {}) => createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: "corpo", ...extra });
const collection = (authorId, slug, extra = {}) => createContent({ title: `Coleção ${slug}`, slug, type: "COLLECTION", authorId, ...extra });
/** Props do componente `type` na árvore devolvida pela página. */
const propsOf = (element, type) => [element.props.children].flat().find((child) => child?.type === type).props;
const headingOf = (element) => [element.props.children].flat().find((child) => child?.type === "h1");
/** A visão geral devolve o próprio `AdminOverview` (sem moldura): as props são as dele. */
const overviewProps = (element) => {
  expect(element.type).toBe(AdminOverview);
  return element.props;
};

describe("content-tree.js: os auxiliares puros", () => {
  const node = (status, children = []) => ({ id: Math.random().toString(36), slug: "x", title: "x", type: "DOCUMENT", status, order: 0, children });

  it("countContents conta TODOS os nós, em qualquer nível, por estado", () => {
    const tree = [node("PUBLISHED", [node("DRAFT", [node("PUBLISHED"), node("DRAFT")]), node("PUBLISHED")]), node("DRAFT")];

    expect(countContents(tree)).toEqual({ contents: 6, published: 3, drafts: 3 });
    expect(countContents([])).toEqual({ contents: 0, published: 0, drafts: 0 });
  });

  it("serializableTree devolve JSON puro: as datas viram texto ISO e nada além de JSON atravessa", () => {
    const when = new Date("2026-10-06T12:00:00.000Z");
    const tree = [{ ...node("PUBLISHED"), updatedAt: when, children: [{ ...node("DRAFT"), updatedAt: when }] }];

    const plain = /** @type {any} */ (serializableTree(/** @type {any} */ (tree)));

    expect(plain[0].updatedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(plain[0].children[0].updatedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(JSON.parse(JSON.stringify(plain))).toEqual(plain);
  });

  it("spaceHrefOf: /handle, ou null sem handle", () => {
    expect(spaceHrefOf("ana")).toBe("/ana");
    for (const empty of [null, undefined, ""]) expect(spaceHrefOf(empty)).toBeNull();
  });

  it("os modelos de endereço batem com as páginas que existem (edição por [id], criação por novo/?pai=)", () => {
    expect(EDIT_HREF).toBe("/admin/conteudo/{id}");
    expect(NEW_HREF).toEqual({ root: "/admin/conteudo/novo", child: "/admin/conteudo/novo?pai={parentId}" });
    const app = path.join(projectRoot, "src", "app");
    expect(fs.existsSync(path.join(app, "admin", "conteudo", "[id]", "page.js"))).toBe(true);
    expect(fs.existsSync(path.join(app, "admin", "conteudo", "novo", "page.js"))).toBe(true);
    // O parâmetro da página de criação é `pai`, o mesmo do modelo.
    expect(fs.readFileSync(path.join(app, "admin", "conteudo", "novo", "page.js"), "utf8")).toContain("const { pai } = await searchParams;");
    expect(NEW_HREF.child).toContain("?pai=");
  });

  it("availablePaths inclui o conteúdo e o perfil; os usuários só entram para o administrador (Parte 3e-2)", () => {
    for (const role of /** @type {const} */ (["user", "admin"])) {
      expect(availablePathsFor(role)).toEqual(expect.arrayContaining(["/admin/conteudo", "/admin/perfil"]));
    }
    expect(availablePathsFor("user")).not.toContain("/admin/usuarios");
    expect(availablePathsFor("admin")).toContain("/admin/usuarios");
  });
});

describe("/admin/conteudo: a árvore do dono da sessão", () => {
  it("exige a sessão com o próprio caminho; sem sessão, redireciona e nada é lido", async () => {
    session.user = null;

    await expect(ContentPage()).rejects.toThrow("REDIRECT:/admin/conteudo");
    expect(getContentTree).not.toHaveBeenCalled();
    session.user = ana;
    await ContentPage();
    expect(requireSession).toHaveBeenLastCalledWith({ path: "/admin/conteudo" });
  });

  it("lê a árvore SÓ do user.id da sessão: com os rascunhos, e sem nada de outro usuário", async () => {
    const col = await collection(ana.id, "calculo");
    await doc(ana.id, "limites", { parentId: col.id });
    await doc(ana.id, "rascunho", { status: "DRAFT" });
    await doc(beto.id, "do-beto");
    await collection(beto.id, "colecao-do-beto");

    const { initialTree } = propsOf(await ContentPage(), ContentTree);

    expect(getContentTree).toHaveBeenCalledWith({ ownerId: ana.id });
    const slugs = JSON.stringify(initialTree);
    expect(slugs).toContain("limites");
    expect(slugs).toContain("rascunho"); // o dono vê os rascunhos (RF26)
    expect(slugs).not.toContain("do-beto");
    expect(slugs).not.toContain("colecao-do-beto");

    // A sessão do outro usuário vê só a dele.
    session.user = beto;
    const other = JSON.stringify(propsOf(await ContentPage(), ContentTree).initialTree);
    expect(other).toContain("do-beto");
    expect(other).not.toContain("limites");
  });

  it("a página não recebe parâmetros: nenhum identificador da URL chega à árvore", async () => {
    await doc(beto.id, "do-beto");

    expect(ContentPage.length).toBe(0);
    const page = await ContentPage(/** @type {any} */ ({ params: { userId: beto.id }, searchParams: { ownerId: beto.id } }));

    expect(JSON.stringify(propsOf(page, ContentTree).initialTree)).not.toContain("do-beto");
  });

  it("a árvore é serializável (as datas em texto) e os modelos de endereço e a cota seguem para o componente", async () => {
    await doc(ana.id, "um");

    const props = propsOf(await ContentPage(), ContentTree);

    expect(JSON.parse(JSON.stringify(props.initialTree))).toEqual(props.initialTree);
    expect(typeof (/** @type {any} */ (props.initialTree)[0].updatedAt)).toBe("string");
    expect(props.editHref).toBe(EDIT_HREF);
    expect(props.newHref).toEqual(NEW_HREF);
    expect(props.maxContents).toBe(500);
    vi.stubEnv("MAX_CONTENTS_PER_USER", "12");
    expect(propsOf(await ContentPage(), ContentTree).maxContents).toBe(12);
  });

  it("tem noindex e um <h1>", async () => {
    expect(contentMetadata).toEqual({ title: "Conteúdo", robots: { index: false, follow: false } });
    expect(headingOf(await ContentPage()).props.children).toBe("Conteúdo");
  });
});

describe("/admin/perfil: o perfil da sessão", () => {
  it("exige a sessão com o próprio caminho; tem noindex e <h1>", async () => {
    const page = await ProfilePage();

    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/perfil" });
    expect(profileMetadata).toEqual({ title: "Perfil", robots: { index: false, follow: false } });
    expect(headingOf(page).props.children).toBe("Perfil");
  });

  it("entrega só nome, e-mail, handle e papel (nada de id, suspensão ou datas) e o endereço do espaço", async () => {
    session.user = { ...ana, banned: true, banReason: "segredo", mustChangePassword: false, createdAt: new Date() };

    const props = propsOf(await ProfilePage(), ProfileFormWithRefresh);

    expect(props.user).toEqual({ name: "Ana", email: "ana@exemplo.test", handle: "ana", role: "user" });
    expect(props.spaceHref).toBe("/ana");
    expect(JSON.stringify(props)).not.toContain("segredo");
  });

  it("sem handle, o endereço do espaço é null (a UI mostra o aviso)", async () => {
    session.user = { ...ana, handle: null };

    const props = propsOf(await ProfilePage(), ProfileFormWithRefresh);

    expect(props.user.handle).toBeNull();
    expect(props.spaceHref).toBeNull();
  });

  it("o envoltório Cliente atualiza o cabeçalho: onSaved chama router.refresh()", () => {
    const element = ProfileFormWithRefresh({ user: { name: "Ana", email: "a@x.test", handle: "ana", role: "user" }, spaceHref: "/ana" });

    expect(element.type).toBe(ProfileForm);
    expect(element.props).toMatchObject({ spaceHref: "/ana", user: { name: "Ana" } });
    element.props.onSaved("Ana Maria");

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("/admin: a visão geral com os números do próprio usuário", () => {
  it("conta os conteúdos por estado (só os dele), com a cota, o não lido, o endereço e as páginas que existem", async () => {
    const col = await collection(ana.id, "calculo");
    await doc(ana.id, "um", { parentId: col.id });
    await doc(ana.id, "dois", { parentId: col.id, status: "DRAFT" });
    await doc(ana.id, "tres", { status: "DRAFT" });
    await doc(beto.id, "do-beto");
    await notify({ userId: ana.id, type: "ACCOUNT", severity: "INFO", data: {} });
    await notify({ userId: ana.id, type: "ACCOUNT", severity: "INFO", data: {} });
    await notify({ userId: beto.id, type: "ACCOUNT", severity: "INFO", data: {} });

    const props = overviewProps(await AdminPage());

    expect(requireSession).toHaveBeenCalledWith({ path: "/admin" });
    expect(props.counts).toEqual({ contents: 4, published: 2, drafts: 2 });
    expect(props.limits).toEqual({ maxContents: 500 });
    expect(props.unreadCount).toBe(2);
    expect(props.spaceHref).toBe("/ana");
    expect(props.availablePaths).toEqual(availablePathsFor("user"));
    expect(countUnread).toHaveBeenCalledWith(ana.id);
  });

  it("o administrador recebe as páginas dele; sem handle, o endereço do espaço é null; sem nada, zero", async () => {
    session.user = { ...ana, role: "admin", handle: null };

    const props = overviewProps(await AdminPage());

    expect(props.availablePaths).toEqual(availablePathsFor("admin"));
    expect(props.availablePaths).toContain("/admin/configuracoes");
    expect(props.spaceHref).toBeNull();
    expect(props.counts).toEqual({ contents: 0, published: 0, drafts: 0 });
    expect(props.unreadCount).toBe(0);
  });

  it("um papel desconhecido vale como usuário comum (nunca vê as Configurações)", async () => {
    session.user = { ...ana, role: "ADMIN" };

    expect(overviewProps(await AdminPage()).availablePaths).not.toContain("/admin/configuracoes");
  });

  it("a cota vem do ambiente (MAX_CONTENTS_PER_USER)", async () => {
    vi.stubEnv("MAX_CONTENTS_PER_USER", "40");

    expect(overviewProps(await AdminPage()).limits).toEqual({ maxContents: 40 });
  });
});
