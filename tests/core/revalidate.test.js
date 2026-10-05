// Regras de revalidação por espaço (RN10, RN16, ADR-030; Tabela de eventos do Cap. 5 §5.7.2; CT44).
// O `revalidatePath` do Next.js só existe dentro do servidor: aqui ele é substituído para conferir as
// chamadas, que têm de ser LITERAIS (nunca o tipo "layout") e por espaço.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import {
  STRUCTURAL_FIELDS,
  affectsDirectory,
  hasStructuralChange,
  revalidateConfiguration,
  revalidatePortal,
  revalidateSnapshots,
  revalidateUrls,
  snapshotUrls,
  spaceUrl,
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

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset();
});

describe("hasStructuralChange (RN10, RN16)", () => {
  it("só o corpo mudou, ou nada mudou: não é estrutural", () => {
    expect(hasStructuralChange(before, { ...before, body: "texto novo", updatedAt: new Date() })).toBe(false);
    expect(hasStructuralChange(before, { ...before })).toBe(false);
  });

  it.each([
    ["título", { title: "Limites e continuidade" }],
    ["slug", { slug: "limites-e-continuidade" }],
    ["pai", { parentId: "analise" }],
    ["pai (para a raiz)", { parentId: null }],
    ["ordem", { order: 4 }],
    ["estado de publicação (RN16)", { status: "DRAFT" }],
    ["tipo", { type: "COLLECTION" }],
  ])("%s mudou: é estrutural", (_label, change) => {
    expect(hasStructuralChange(before, { ...before, ...change })).toBe(true);
  });

  it("corpo e título mudaram juntos: é estrutural", () => {
    expect(hasStructuralChange(before, { ...before, body: "novo", title: "Novo título" })).toBe(true);
  });

  it("a lista de campos estruturais é a da RN10", () => {
    expect([...STRUCTURAL_FIELDS].sort()).toEqual(["order", "parentId", "slug", "status", "title", "type"]);
  });
});

describe("affectsDirectory (RN28: só a raiz importa)", () => {
  const root = { parentId: null, status: "PUBLISHED" };
  const child = { parentId: "calculo", status: "PUBLISHED" };

  it("criar ou excluir uma raiz altera o diretório; um filho, não", () => {
    expect(affectsDirectory(null, root)).toBe(true);
    expect(affectsDirectory(root, null)).toBe(true);
    expect(affectsDirectory(null, child)).toBe(false);
    expect(affectsDirectory(child, null)).toBe(false);
  });

  it("publicar ou despublicar uma raiz altera o diretório", () => {
    expect(affectsDirectory(root, { ...root, status: "DRAFT" })).toBe(true);
    expect(affectsDirectory({ ...root, status: "DRAFT" }, root)).toBe(true);
  });

  it("entrar na raiz ou sair dela altera o diretório; mudar de pai entre filhos, não", () => {
    expect(affectsDirectory(child, { ...child, parentId: null })).toBe(true);
    expect(affectsDirectory(root, { ...root, parentId: "calculo" })).toBe(true);
    expect(affectsDirectory(child, { ...child, parentId: "analise" })).toBe(false);
  });

  it("renomear ou reordenar uma raiz não altera o diretório", () => {
    expect(affectsDirectory(root, { ...root })).toBe(false);
  });
});

describe("caminhos literais de um espaço (RN04, ADR-030)", () => {
  it("a URL pública é /{handle} seguida da cadeia de slugs", () => {
    expect(spaceUrl("ana")).toBe("/ana");
    expect(spaceUrl("ana", ["calculo", "integrais", "por-partes"])).toBe("/ana/calculo/integrais/por-partes");
  });

  it("snapshotUrls: a página inicial e cada caminho, sem repetição, na união dos retratos", () => {
    const antes = { handle: "ana", paths: [["a"], ["a", "b"]] };
    const depois = { handle: "ana", paths: [["z"], ["z", "b"], ["a"]] };
    expect(snapshotUrls(antes, depois)).toEqual(["/ana", "/ana/a", "/ana/a/b", "/ana/z", "/ana/z/b"]);
  });

  it("snapshotUrls: um retrato do espaço inteiro traz a coleção e tudo o que há nela (a sidebar e o redirecionamento da coleção, RN14)", () => {
    const espaco = {
      handle: "ana",
      paths: [["calculo"], ["calculo", "integrais"], ["calculo", "integrais", "por-partes"], ["sobre"]],
    };
    expect(snapshotUrls(espaco)).toEqual([
      "/ana",
      "/ana/calculo",
      "/ana/calculo/integrais",
      "/ana/calculo/integrais/por-partes",
      "/ana/sobre",
    ]);
  });

  it("dois handles (o antigo e o novo) geram as páginas de cada um", () => {
    const antigo = { handle: "ana", paths: [["a"]] };
    const novo = { handle: "ana-maria", paths: [["a"]] };
    expect(snapshotUrls(antigo, novo)).toEqual(["/ana", "/ana/a", "/ana-maria", "/ana-maria/a"]);
  });

  it("sem handle, o espaço não tem URL e nada é invalidado", () => {
    expect(snapshotUrls({ handle: null, paths: [["a"]] })).toEqual([]);
  });
});

describe("chamadas a revalidatePath", () => {
  it("revalidateUrls chama o caminho literal, sem o tipo, uma vez por página", () => {
    revalidateUrls(["/ana", "/ana/a"]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/ana");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/ana/a");
  });

  it("revalidateSnapshots invalida o espaço, e só ele (nunca o layout)", () => {
    revalidateSnapshots({ handle: "ana", paths: [["a"]] });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(vi.mocked(revalidatePath).mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("o portal e a configuração do site invalidam só a página `/`", () => {
    revalidatePortal();
    revalidateConfiguration();
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/", "page");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/", "page");
  });

  it("uma falha na revalidação é registrada e não se propaga (RNF10); as demais páginas seguem", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("cache indisponível");
    });

    expect(() => revalidateUrls(["/ana", "/ana/a"])).not.toThrow();
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledOnce();

    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error("cache indisponível");
    });
    expect(() => revalidatePortal()).not.toThrow();
    log.mockRestore();
  });
});
