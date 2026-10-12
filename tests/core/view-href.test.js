// `viewHref` do editor (P-025; RF08, RN15, RN23): o caminho PÚBLICO do documento, só se ele tem página agora
// (dono ativo e com `handle`, documento e TODOS os ancestrais PUBLISHED); caso contrário `null`. Na moderação o
// caminho é o do DONO. O valor é só o caminho, com cada segmento codificado. A sessão, a navegação e o editor
// (da UI) são substituídos; o banco é o SQLite temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: /** @type {any} */ (null) }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async () => ({ user: session.current })),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/components/editor/ContentEditor", () => ({ ContentEditor: () => null }));

import { publicViewHref } from "@/app/admin/_lib/editor";
import EditContentPage from "@/app/admin/conteudo/[id]/page";
import ModerateDocumentPage from "@/app/admin/usuarios/[id]/conteudo/[contentId]/page";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { createContent, prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

let ana;
let admin;

beforeEach(async () => {
  await resetDatabase();
  ana = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  admin = await createTestUser({ email: "admin@exemplo.test", name: "Admin", role: "admin", handle: "chefe" });
  session.current = { id: ana.id, role: "user" };
});

const make = (authorId, slug, extra = {}) =>
  createContent({ title: `T ${slug}`, slug, type: "DOCUMENT", authorId, body: "x", ...extra });

const editorProps = (element) => [element.props.children].flat().find((c) => c?.type === ContentEditor).props;
const editPage = async (id) => editorProps(await EditContentPage({ params: Promise.resolve({ id }) }));
const moderatePage = async (ownerId, contentId) => {
  session.current = { id: admin.id, role: "admin" };
  return editorProps(await ModerateDocumentPage({ params: Promise.resolve({ id: ownerId, contentId }) }));
};

describe("publicViewHref", () => {
  it("documento publicado na raiz: /handle/slug", async () => {
    const d = await make(ana.id, "aula");
    expect(await publicViewHref(ana.id, d.id)).toBe("/ana/aula");
  });

  it("documento aninhado: handle e slugs da raiz ao documento", async () => {
    const a = await make(ana.id, "aeds-i", { type: "COLLECTION" });
    const b = await make(ana.id, "p1", { type: "COLLECTION", parentId: a.id });
    const d = await make(ana.id, "testes", { parentId: b.id });
    expect(await publicViewHref(ana.id, d.id)).toBe("/ana/aeds-i/p1/testes");
  });

  it("rascunho: null", async () => {
    const d = await make(ana.id, "aula", { status: "DRAFT" });
    expect(await publicViewHref(ana.id, d.id)).toBeNull();
  });

  it("ancestral em rascunho: null, mesmo com o documento publicado", async () => {
    const a = await make(ana.id, "colecao", { type: "COLLECTION", status: "DRAFT" });
    const d = await make(ana.id, "aula", { parentId: a.id });
    expect(await publicViewHref(ana.id, d.id)).toBeNull();
  });

  it("espaço do dono suspenso: null", async () => {
    const d = await make(ana.id, "aula");
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banExpires: null } });
    expect(await publicViewHref(ana.id, d.id)).toBeNull();
  });

  it("dono sem handle: null", async () => {
    const s = await createTestUser({ email: "sem@exemplo.test" });
    const d = await make(s.id, "aula");
    expect(await publicViewHref(s.id, d.id)).toBeNull();
  });

  it("documento de outro dono ou inexistente: null", async () => {
    const d = await make(ana.id, "aula");
    expect(await publicViewHref(admin.id, d.id)).toBeNull();
    expect(await publicViewHref(ana.id, "nao-existe")).toBeNull();
  });

  it("codifica cada segmento com encodeURIComponent", async () => {
    const d = await make(ana.id, "a b%c");
    expect(await publicViewHref(ana.id, d.id)).toBe("/ana/a%20b%25c");
  });
});

describe("as páginas do editor entregam o viewHref", () => {
  it("o dono: o caminho público do documento publicado, e mais nada além do caminho", async () => {
    const d = await make(ana.id, "aula");
    const props = await editPage(d.id);
    expect(props.viewHref).toBe("/ana/aula");
    expect(JSON.stringify(props.viewHref)).not.toContain(ana.id);
  });

  it("o dono: null em rascunho", async () => {
    const d = await make(ana.id, "aula", { status: "DRAFT" });
    expect((await editPage(d.id)).viewHref).toBeNull();
  });

  it("moderação: o caminho é o do DONO, não o do administrador", async () => {
    const d = await make(ana.id, "aula");
    const props = await moderatePage(ana.id, d.id);
    expect(props.viewHref).toBe("/ana/aula");
    expect(props.viewHref).not.toContain("chefe");
  });

  it("moderação: null com o dono suspenso ou o documento em rascunho", async () => {
    const draft = await make(ana.id, "rascunho", { status: "DRAFT" });
    expect((await moderatePage(ana.id, draft.id)).viewHref).toBeNull();
    const d = await make(ana.id, "aula");
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banExpires: null } });
    expect((await moderatePage(ana.id, d.id)).viewHref).toBeNull();
  });
});
