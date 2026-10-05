// Caminhos e navegação do espaço (RF12, RF13, RN04): funções puras de space-paths.js.
import { describe, expect, it } from "vitest";
import { activeIds, contentHref, navItemsOf, neighboursOf } from "@/components/layout/space-paths";
import { node, sampleCollection } from "./space-helpers";

describe("contentHref", () => {
  it("junta o prefixo do espaço e a cadeia de slugs", () => {
    expect(contentHref("/maria", ["algoritmos", "introducao", "o-que-e-c"])).toBe("/maria/algoritmos/introducao/o-que-e-c");
  });

  it("aceita o prefixo vazio (portal) e ignora a barra final do prefixo", () => {
    expect(contentHref("", ["c"])).toBe("/c");
    expect(contentHref("/maria/", ["c"])).toBe("/maria/c");
  });

  it("codifica cada slug, sem deixar uma barra ou um caractere de controle passar", () => {
    expect(contentHref("/maria", ["a/b", "c d?x=1"])).toBe("/maria/a%2Fb/c%20d%3Fx%3D1");
  });
});

describe("navItemsOf (RF13)", () => {
  const roots = [
    node("C", "c", "COLLECTION"),
    node("Documento solto", "solto", "DOCUMENT"),
    node("Python", "python", "COLLECTION"),
  ];

  it("lista só as coleções raiz, na ordem da árvore, com a URL de cada uma", () => {
    expect(navItemsOf(roots, { basePath: "/maria" }).map(({ label, href }) => [label, href])).toEqual([
      ["C", "/maria/c"],
      ["Python", "/maria/python"],
    ]);
  });

  it("marca como corrente só a raiz do slug ativo", () => {
    const items = navItemsOf(roots, { basePath: "/maria", activeSlug: "python" });
    expect(items.map((item) => item.current)).toEqual([false, true]);
    expect(navItemsOf(roots, { basePath: "/maria" }).every((item) => item.current === false)).toBe(true);
  });

  it("sem raízes, lista vazia", () => {
    expect(navItemsOf([], { basePath: "/maria" })).toEqual([]);
  });
});

describe("activeIds", () => {
  const collection = sampleCollection();
  const [intro, , estruturas] = collection.children;

  it("devolve a coleção e os nós da cadeia da página corrente", () => {
    const ids = activeIds(collection, ["algoritmos", "introducao", "historia"]);
    expect(ids).toEqual(new Set([collection.id, intro.id, intro.children[1].id]));
  });

  it("cobre os cinco níveis", () => {
    const listas = estruturas.children[0];
    const encadeadas = listas.children[0];
    const nos = encadeadas.children[0];
    const ids = activeIds(collection, ["algoritmos", "estruturas", "listas", "encadeadas", "nos", "ponteiros-duplos"]);
    expect([...ids]).toEqual([collection.id, estruturas.id, listas.id, encadeadas.id, nos.id, nos.children[0].id]);
  });

  it("para onde a cadeia deixa de existir, sem lançar", () => {
    expect(activeIds(collection, ["algoritmos", "introducao", "nao-existe"])).toEqual(new Set([collection.id, intro.id]));
  });

  it("é vazio sem página corrente ou com uma página de outra coleção", () => {
    expect(activeIds(collection, [])).toEqual(new Set());
    expect(activeIds(collection, ["outra", "introducao"])).toEqual(new Set());
  });
});

describe("neighboursOf (RF12)", () => {
  const collection = sampleCollection();
  const at = (/** @type {string[]} */ path) => neighboursOf(collection, ["algoritmos", ...path], "/maria");

  it("o anterior e o seguinte seguem a ordem da árvore em profundidade, só com documentos", () => {
    expect(at(["introducao", "o-que-e-c"])).toEqual({ previous: null, next: { title: "História de C", href: "/maria/algoritmos/introducao/historia" } });
    expect(at(["introducao", "historia"])).toEqual({
      previous: { title: "O que é C", href: "/maria/algoritmos/introducao/o-que-e-c" },
      next: { title: "Variáveis", href: "/maria/algoritmos/variaveis" },
    });
  });

  it("atravessa os níveis fundos: o seguinte de Variáveis é o documento de cinco níveis", () => {
    expect(at(["variaveis"]).next).toEqual({
      title: "Ponteiros duplos",
      href: "/maria/algoritmos/estruturas/listas/encadeadas/nos/ponteiros-duplos",
    });
    expect(at(["estruturas", "listas", "encadeadas", "nos", "ponteiros-duplos"])).toEqual({
      previous: { title: "Variáveis", href: "/maria/algoritmos/variaveis" },
      next: { title: "Arquivos", href: "/maria/algoritmos/arquivos" },
    });
  });

  it("o último documento não tem seguinte", () => {
    expect(at(["arquivos"]).next).toBeNull();
    expect(at(["arquivos"]).previous?.title).toBe("Ponteiros duplos");
  });

  it("uma coleção, um caminho que não existe ou a própria raiz não têm vizinhos", () => {
    const none = { previous: null, next: null };
    expect(at(["introducao"])).toEqual(none);
    expect(at(["introducao", "nao-existe"])).toEqual(none);
    expect(neighboursOf(collection, ["algoritmos"], "/maria")).toEqual(none);
    expect(neighboursOf(collection, [], "/maria")).toEqual(none);
  });

  it("uma coleção sem documentos não tem vizinhos", () => {
    expect(neighboursOf(node("Vazia", "vazia", "COLLECTION"), ["vazia"], "/maria")).toEqual({ previous: null, next: null });
  });
});
