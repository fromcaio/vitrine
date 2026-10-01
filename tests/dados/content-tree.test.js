// Unidade: montagem da árvore, poda por estado e resolução de caminho (sem banco).
import { describe, expect, it } from "vitest";
import { buildTree, resolvePath, wouldCreateCycle } from "@/lib/content-tree";

let seq = 0;
/** @param {Record<string, unknown>} fields */
function row(fields) {
  seq += 1;
  return {
    id: `id-${seq}`,
    title: "t",
    type: "COLLECTION",
    status: "PUBLISHED",
    order: 0,
    parentId: null,
    createdAt: new Date(2026, 0, 1, 0, 0, seq),
    ...fields,
  };
}

describe("buildTree", () => {
  it("monta a hierarquia a partir de linhas planas", () => {
    const rows = [
      row({ id: "a", slug: "a" }),
      row({ id: "b", slug: "b", parentId: "a" }),
      row({ id: "c", slug: "c", parentId: "b", type: "DOCUMENT" }),
    ];

    const tree = buildTree(/** @type {any} */ (rows));

    expect(tree.map((n) => n.id)).toEqual(["a"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["b"]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["c"]);
  });

  it("ordena irmãos por ordem crescente (RN05) e, em empate, por data de criação", () => {
    const rows = [
      row({ id: "tarde", slug: "tarde", order: 1, createdAt: new Date("2026-03-01") }),
      row({ id: "cedo", slug: "cedo", order: 1, createdAt: new Date("2026-01-01") }),
      row({ id: "primeiro", slug: "primeiro", order: 0, createdAt: new Date("2026-06-01") }),
    ];

    const tree = buildTree(/** @type {any} */ (rows));

    expect(tree.map((n) => n.id)).toEqual(["primeiro", "cedo", "tarde"]);
  });

  it("ordena também os níveis internos", () => {
    const rows = [
      row({ id: "pai", slug: "pai" }),
      row({ id: "f2", slug: "f2", parentId: "pai", order: 2 }),
      row({ id: "f1", slug: "f1", parentId: "pai", order: 1 }),
    ];

    expect(buildTree(/** @type {any} */ (rows))[0].children.map((n) => n.id)).toEqual(["f1", "f2"]);
  });

  it("sem onlyPublished devolve rascunhos, com o status (painel, RF26)", () => {
    const rows = [row({ id: "a", slug: "a", status: "DRAFT" })];

    const tree = buildTree(/** @type {any} */ (rows));

    expect(tree).toHaveLength(1);
    expect(tree[0].status).toBe("DRAFT");
  });

  it("onlyPublished remove um rascunho junto com toda a subárvore, mesmo de descendentes publicados (RN15)", () => {
    const rows = [
      row({ id: "pub", slug: "pub" }),
      row({ id: "rasc", slug: "rasc", status: "DRAFT" }),
      row({ id: "filho-pub", slug: "filho", parentId: "rasc" }),
      row({ id: "neto-pub", slug: "neto", parentId: "filho-pub", type: "DOCUMENT" }),
      row({ id: "pub-filho", slug: "ok", parentId: "pub", type: "DOCUMENT" }),
      row({ id: "pub-rasc", slug: "x", parentId: "pub", type: "DOCUMENT", status: "DRAFT" }),
    ];

    const tree = buildTree(/** @type {any} */ (rows), { onlyPublished: true });

    expect(tree.map((n) => n.id)).toEqual(["pub"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["pub-filho"]);
  });

  it("não altera as linhas de entrada", () => {
    const rows = [row({ id: "a", slug: "a" }), row({ id: "b", slug: "b", parentId: "a" })];
    const snapshot = JSON.stringify(rows);

    buildTree(/** @type {any} */ (rows));

    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(rows[0]).not.toHaveProperty("children");
  });

  it("descarta linhas órfãs (pai ausente) e aceita lista vazia", () => {
    expect(buildTree([])).toEqual([]);
    expect(buildTree(/** @type {any} */ ([row({ id: "x", slug: "x", parentId: "inexistente" })]))).toEqual([]);
  });
});

describe("resolvePath", () => {
  const tree = buildTree(
    /** @type {any} */ ([
      row({ id: "c", slug: "c" }),
      row({ id: "intro", slug: "introducao", parentId: "c" }),
      row({ id: "doc", slug: "o-que-e-c", parentId: "intro", type: "DOCUMENT" }),
      row({ id: "rasc", slug: "rascunho", parentId: "c", status: "DRAFT", type: "DOCUMENT" }),
    ]),
  );

  it("resolve um caminho existente (RN04)", () => {
    expect(resolvePath(tree, ["c"])?.id).toBe("c");
    expect(resolvePath(tree, ["c", "introducao", "o-que-e-c"])?.id).toBe("doc");
  });

  it("devolve null para um caminho inexistente", () => {
    expect(resolvePath(tree, ["nao-existe"])).toBeNull();
    expect(resolvePath(tree, ["c", "nao-existe"])).toBeNull();
    expect(resolvePath(tree, ["introducao"])).toBeNull(); // slug de nível interno na raiz
  });

  it("devolve null para lista vazia ou inválida", () => {
    expect(resolvePath(tree, [])).toBeNull();
    expect(resolvePath(tree, /** @type {any} */ (undefined))).toBeNull();
  });

  it("não resolve um rascunho em uma árvore podada (RN15)", () => {
    const publica = buildTree(
      /** @type {any} */ ([
        row({ id: "c", slug: "c" }),
        row({ id: "rasc", slug: "rascunho", parentId: "c", status: "DRAFT", type: "DOCUMENT" }),
      ]),
      { onlyPublished: true },
    );

    expect(resolvePath(publica, ["c", "rascunho"])).toBeNull();
    expect(resolvePath(publica, ["c"])?.id).toBe("c");
  });
});

describe("wouldCreateCycle (RN06)", () => {
  // a -> b -> c ; d (raiz)
  const parentOf = new Map([
    ["a", null],
    ["b", "a"],
    ["c", "b"],
    ["d", null],
  ]);

  it("detecta o destino igual ao próprio nó", () => {
    expect(wouldCreateCycle(parentOf, "a", "a")).toBe(true);
  });

  it("detecta o destino em qualquer nível de descendência", () => {
    expect(wouldCreateCycle(parentOf, "a", "b")).toBe(true);
    expect(wouldCreateCycle(parentOf, "a", "c")).toBe(true);
  });

  it("permite mover para a raiz, para um ancestral ou para outra árvore", () => {
    expect(wouldCreateCycle(parentOf, "c", null)).toBe(false);
    expect(wouldCreateCycle(parentOf, "c", "a")).toBe(false);
    expect(wouldCreateCycle(parentOf, "c", "d")).toBe(false);
  });
});
