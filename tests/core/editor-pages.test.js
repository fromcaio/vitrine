// Páginas do editor (A-014 Parte 3a, item 7; P-012, R-007; RN18, RN19; CT53): `/admin/conteudo/novo` e
// `/admin/conteudo/[id]`. O dono é conferido ANTES de renderizar; o conteúdo de outro dono (também para o
// administrador), o inexistente, uma coleção e um `?pai=` que não seja uma coleção do próprio usuário
// respondem `notFound()`; a página entrega ao editor o `userId`, o `contentId` e a `version`. A sessão e
// a navegação do Next.js e o editor (da UI) são substituídos; o banco é o SQLite temporário do setup.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async (options) => {
    if (!session.current) throw new Error(`REDIRECT:${options?.path}`);
    return { user: session.current };
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/components/editor/ContentEditor", () => ({ ContentEditor: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getContentById: vi.fn(actual.getContentById) };
});

import { requireSession } from "@/app/admin/_lib/session";
import EditContentPage, { metadata as editMetadata } from "@/app/admin/conteudo/[id]/page";
import NewContentPage, { metadata as newMetadata } from "@/app/admin/conteudo/novo/page";
import { ContentEditor } from "@/components/editor/ContentEditor";
import { createContent, getContentById, prisma, updateContent } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string, role: string }} */
let ana;
/** @type {{ id: string, role: string }} */
let beto;
/** @type {{ id: string, role: string }} */
let admin;

beforeEach(async () => {
  await resetDatabase();
  const a = await createTestUser({ email: "ana@exemplo.test", handle: "ana" });
  const b = await createTestUser({ email: "beto@exemplo.test", handle: "beto" });
  const c = await createTestUser({ email: "admin@exemplo.test", role: "admin" });
  ana = { id: a.id, role: "user" };
  beto = { id: b.id, role: "user" };
  admin = { id: c.id, role: "admin" };
  session.current = ana;
  vi.mocked(requireSession).mockClear();
  vi.mocked(getContentById).mockClear();
});

const seed = (authorId, slug, extra = {}) =>
  createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: "corpo", ...extra });

/** Props do editor na árvore devolvida pela página. */
function editorProps(element) {
  const children = [element.props.children].flat();
  const editor = children.find((child) => child?.type === ContentEditor);
  return editor.props;
}

const newPage = (pai) => NewContentPage({ searchParams: Promise.resolve(pai === undefined ? {} : { pai }) });
const editPage = (id) => EditContentPage({ params: Promise.resolve({ id }) });

describe("/admin/conteudo/novo", () => {
  it("sem ?pai=, o conteúdo nasce na raiz, publicado, com o editor do próprio usuário", async () => {
    const element = await newPage();

    expect(editorProps(element)).toEqual({
      userId: ana.id,
      contentId: null,
      parentId: null,
      editPath: "/admin/conteudo/{id}",
      initialValue: { status: "PUBLISHED" },
    });
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/conteudo/novo" });
    expect(JSON.stringify(element.props.children[0])).toContain("Novo conteúdo");
    expect(newMetadata).toEqual({ title: "Novo conteúdo", robots: { index: false, follow: false } });
  });

  it("?pai= vazio vale como ausente", async () => {
    expect(editorProps(await newPage("")).parentId).toBeNull();
  });

  it("?pai= de uma coleção do próprio usuário: o conteúdo nasce dentro dela", async () => {
    const collection = await seed(ana.id, "calculo", { type: "COLLECTION", body: null });

    const element = await newPage(collection.id);

    expect(editorProps(element).parentId).toBe(collection.id);
    // O destino do login preserva a consulta.
    expect(requireSession).toHaveBeenCalledWith({ path: `/admin/conteudo/novo?pai=${collection.id}` });
  });

  it("?pai= de uma coleção de OUTRO usuário responde 404 (RN19)", async () => {
    const theirs = await seed(beto.id, "do-beto", { type: "COLLECTION", body: null });

    await expect(newPage(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("?pai= de uma coleção de outro usuário também responde 404 ao administrador", async () => {
    const theirs = await seed(ana.id, "da-ana", { type: "COLLECTION", body: null });
    session.current = admin;

    await expect(newPage(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("?pai= de um DOCUMENTO do próprio usuário responde 404 (só coleção)", async () => {
    const document = await seed(ana.id, "documento");

    await expect(newPage(document.id)).rejects.toThrow("NOT_FOUND");
  });

  it("?pai= inexistente e ?pai= repetido respondem 404, indistinguíveis do de outro dono", async () => {
    const collection = await seed(ana.id, "calculo", { type: "COLLECTION", body: null });

    await expect(newPage("nao-existe")).rejects.toThrow("NOT_FOUND");
    await expect(newPage([collection.id, collection.id])).rejects.toThrow("NOT_FOUND");
  });

  it("sem sessão, a página não consulta o banco: a sessão vem primeiro", async () => {
    session.current = null;

    await expect(newPage("qualquer")).rejects.toThrow("REDIRECT:/admin/conteudo/novo?pai=qualquer");
    expect(getContentById).not.toHaveBeenCalled();
  });
});

describe("/admin/conteudo/[id]", () => {
  it("o dono edita o próprio documento: o editor recebe o usuário, o conteúdo, os valores e a version", async () => {
    const mine = await seed(ana.id, "da-ana", { status: "DRAFT" });

    const element = await editPage(mine.id);

    expect(editorProps(element)).toEqual({
      userId: ana.id,
      contentId: mine.id,
      initialValue: { title: "Título da-ana", slug: "da-ana", body: "corpo", status: "DRAFT" },
      version: mine.updatedAt.toISOString(),
    });
    expect(requireSession).toHaveBeenCalledWith({ path: `/admin/conteudo/${mine.id}` });
    expect(editMetadata).toEqual({ title: "Editar conteúdo", robots: { index: false, follow: false } });
  });

  it("a version é o updatedAt ATUAL do servidor: muda quando o conteúdo muda (RN18)", async () => {
    const mine = await seed(ana.id, "da-ana");
    const first = editorProps(await editPage(mine.id)).version;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateContent(mine.id, { body: "outro corpo" });
    const second = editorProps(await editPage(mine.id)).version;

    expect(first).toBe(mine.updatedAt.toISOString());
    expect(second).toBe(updated.updatedAt.toISOString());
    expect(second).not.toBe(first);
    expect(editorProps(await editPage(mine.id)).initialValue.body).toBe("outro corpo");
  });

  it("o documento de OUTRO usuário responde 404", async () => {
    const theirs = await seed(beto.id, "do-beto");

    await expect(editPage(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("o administrador também recebe 404 no documento alheio (a moderação é da interface própria, com motivo)", async () => {
    const theirs = await seed(ana.id, "da-ana");
    session.current = admin;

    await expect(editPage(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("o inexistente responde 404, igual ao alheio", async () => {
    await expect(editPage("nao-existe")).rejects.toThrow("NOT_FOUND");
  });

  it("uma coleção própria responde 404: o editor é só para documentos (R-007)", async () => {
    const collection = await seed(ana.id, "calculo", { type: "COLLECTION", body: null });

    await expect(editPage(collection.id)).rejects.toThrow("NOT_FOUND");
  });

  it("sem sessão, a página não consulta o banco", async () => {
    const mine = await seed(ana.id, "da-ana");
    session.current = null;
    vi.mocked(getContentById).mockClear();

    await expect(editPage(mine.id)).rejects.toThrow(`REDIRECT:/admin/conteudo/${mine.id}`);
    expect(getContentById).not.toHaveBeenCalled();
  });

  it("a página não altera nada no banco", async () => {
    const mine = await seed(ana.id, "da-ana");

    await editPage(mine.id);

    expect(await prisma.content.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ body: "corpo", slug: "da-ana" });
  });
});
