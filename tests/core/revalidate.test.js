// Regras de revalidação (RN10, RN16; Tabela de eventos do Cap. 5 §5.7.2). O `revalidatePath` do
// Next.js só existe dentro do servidor: aqui ele é substituído para conferir as chamadas.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import {
  ROOT_LAYOUT,
  contentUpdateTarget,
  findSlugPath,
  publicPath,
  revalidateConfiguration,
  revalidateContentTree,
  revalidateContentUpdate,
} from "@/lib/revalidate";

const before = {
  id: "doc-1",
  title: "Limites",
  slug: "limites",
  body: "texto antigo",
  type: "DOCUMENT",
  status: "PUBLISHED",
  order: 0,
  parentId: "calculo",
  updatedAt: new Date("2026-10-01T10:00:00Z"),
};
const slugs = ["calculo", "limites"];

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset();
});

describe("contentUpdateTarget", () => {
  it("só o corpo mudou: apenas a página do documento", () => {
    const after = { ...before, body: "texto novo", updatedAt: new Date("2026-10-01T11:00:00Z") };
    expect(contentUpdateTarget(before, after, slugs)).toEqual({ path: "/calculo/limites" });
  });

  it("nada mudou: apenas a página", () => {
    expect(contentUpdateTarget(before, { ...before }, slugs)).toEqual({ path: "/calculo/limites" });
  });

  it.each([
    ["título", { title: "Limites e continuidade" }],
    ["slug", { slug: "limites-e-continuidade" }],
    ["pai", { parentId: "analise" }],
    ["pai (para a raiz)", { parentId: null }],
    ["ordem", { order: 4 }],
    ["estado de publicação (RN16)", { status: "DRAFT" }],
    ["tipo", { type: "COLLECTION" }],
  ])("%s mudou: layout raiz", (_label, change) => {
    expect(contentUpdateTarget(before, { ...before, ...change }, slugs)).toEqual(ROOT_LAYOUT);
  });

  it("corpo e título mudaram juntos: layout raiz", () => {
    const after = { ...before, body: "novo", title: "Novo título" };
    expect(contentUpdateTarget(before, after, slugs)).toEqual(ROOT_LAYOUT);
  });

  it("sem o caminho do documento, cai no layout raiz", () => {
    expect(contentUpdateTarget(before, { ...before, body: "novo" }, null)).toEqual(ROOT_LAYOUT);
  });
});

describe("caminho público (RN04)", () => {
  const tree = [
    {
      id: "calculo",
      slug: "calculo",
      children: [
        { id: "doc-1", slug: "limites", children: [] },
        { id: "sub", slug: "integrais", children: [{ id: "doc-2", slug: "por-partes", children: [] }] },
      ],
    },
    { id: "sobre", slug: "sobre", children: [] },
  ];

  it("encontra a cadeia de slugs da raiz ao nó", () => {
    expect(findSlugPath(tree, "sobre")).toEqual(["sobre"]);
    expect(findSlugPath(tree, "doc-1")).toEqual(["calculo", "limites"]);
    expect(findSlugPath(tree, "doc-2")).toEqual(["calculo", "integrais", "por-partes"]);
    expect(findSlugPath(tree, "inexistente")).toBeNull();
  });

  it("monta a URL com barras", () => {
    expect(publicPath(["calculo", "integrais", "por-partes"])).toBe("/calculo/integrais/por-partes");
  });
});

describe("chamadas a revalidatePath", () => {
  it("criar, excluir, mover e reordenar revalidam o layout raiz", () => {
    revalidateContentTree();
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("configuração revalida o layout raiz", () => {
    revalidateConfiguration();
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("alteração só de corpo revalida a página, sem o tipo layout", () => {
    revalidateContentUpdate(before, { ...before, body: "novo" }, slugs);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/calculo/limites");
  });

  it("mudança de estado revalida o layout raiz", () => {
    revalidateContentUpdate(before, { ...before, status: "DRAFT" }, slugs);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("uma falha na revalidação é registrada e não se propaga (RNF10)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error("cache indisponível");
    });

    expect(() => revalidateContentTree()).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
