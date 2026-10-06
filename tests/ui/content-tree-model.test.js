// Modelo da árvore do painel (RF03, RF06, RF07, RF26; RN02, RN05, RN06, RN07, RN16, RN25): funções
// puras sobre a árvore de `GET /api/contents`. Roda em ambiente node, sem DOM.
import { describe, expect, it } from "vitest";
import {
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  countDescendants,
  countNodes,
  countPublishedDescendants,
  expandableIds,
  hidingAncestor,
  locate,
  moveTargets,
  normalizeTree,
  slugsUnder,
  suggestSlug,
  swapWithSibling,
  validateNewCollection,
  withStatus,
  withoutNode,
} from "@/components/admin/content-tree-model";
import { SLUG_PATTERN as SERVER_SLUG_PATTERN, SLUG_MAX_LENGTH as SERVER_SLUG_MAX } from "@/lib/validators";

let counter = 0;
/** @param {string} title @param {"COLLECTION" | "DOCUMENT"} type @param {"PUBLISHED" | "DRAFT"} status @param {any[]} [children] */
function node(title, type, status, children = []) {
  counter += 1;
  return { id: `n${counter}`, title, slug: title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"), type, status, parentId: null, order: counter, children };
}
const doc = (/** @type {string} */ title, status = /** @type {const} */ ("PUBLISHED")) => node(title, "DOCUMENT", status);
const col = (/** @type {string} */ title, /** @type {any[]} */ children = [], status = /** @type {const} */ ("PUBLISHED")) => node(title, "COLLECTION", status, children);

/** C (A (a1, a2, B (b1)), d1) , E (rascunho: e1 publicado) , doc solto */
function sample() {
  const b1 = doc("b1");
  const b = col("B", [b1]);
  const a1 = doc("a1");
  const a2 = doc("a2", "DRAFT");
  const a = col("A", [a1, a2, b]);
  const d1 = doc("d1");
  const c = col("C", [a, d1]);
  const e1 = doc("e1");
  const e = col("E", [e1], "DRAFT");
  const solto = doc("solto");
  return { roots: [c, e, solto], c, a, a1, a2, b, b1, d1, e, e1, solto };
}

describe("SLUG_PATTERN (cópia de validators.js)", () => {
  it("é a mesma regra e o mesmo tamanho do servidor", () => {
    expect(SLUG_PATTERN.source).toBe(SERVER_SLUG_PATTERN.source);
    expect(SLUG_MAX_LENGTH).toBe(SERVER_SLUG_MAX);
  });
});

describe("normalizeTree", () => {
  it("mantém os campos conhecidos e a ordem recebida", () => {
    const tree = normalizeTree([
      { id: "a", title: "A", slug: "a", type: "COLLECTION", status: "DRAFT", parentId: null, order: 3, children: [{ id: "b", title: "B", slug: "b", type: "DOCUMENT", status: "PUBLISHED", parentId: "a", order: 0, children: [] }] },
      { id: "c", title: "C", slug: "c", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 1, children: [] },
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "c"]);
    expect(tree[0]).toMatchObject({ title: "A", status: "DRAFT", order: 3 });
    expect(tree[0].children[0]).toMatchObject({ id: "b", parentId: "a", type: "DOCUMENT" });
  });

  it("descarta nós sem id e ignora o que não é lista", () => {
    expect(normalizeTree([{ title: "sem id" }, null, 7, { id: "" }, { id: "ok" }]).map((n) => n.id)).toEqual(["ok"]);
    expect(normalizeTree(null)).toEqual([]);
    expect(normalizeTree({})).toEqual([]);
    expect(normalizeTree(undefined)).toEqual([]);
  });

  it("tipos errados viram os padrões: título vazio, DOCUMENT, PUBLISHED, ordem 0, sem pai", () => {
    expect(normalizeTree([{ id: "x", title: 5, slug: null, type: "PASTA", status: "ARQUIVADO", parentId: 9, order: "2" }])[0]).toEqual({
      id: "x", title: "", slug: "", type: "DOCUMENT", status: "PUBLISHED", parentId: null, order: 0, children: [],
    });
  });

  it("só uma COLEÇÃO tem filhos (RN02): os de um documento são descartados", () => {
    const [document] = normalizeTree([{ id: "d", type: "DOCUMENT", children: [{ id: "x" }] }]);
    expect(document.children).toEqual([]);
  });

  it("não repassa o que a tela não usa (o corpo, o autor, as datas)", () => {
    const [n] = normalizeTree([{ id: "x", body: "texto", authorId: "u1", createdAt: "ontem", children: [] }]);
    expect(Object.keys(n).sort()).toEqual(["children", "id", "order", "parentId", "slug", "status", "title", "type"]);
  });
});

describe("contagens (RN07, RN16, RN25)", () => {
  it("conta todos os nós, em qualquer estado", () => {
    expect(countNodes(sample().roots)).toBe(10);
    expect(countNodes([])).toBe(0);
  });

  it("conta os descendentes que a exclusão leva junto", () => {
    const { c, a, b, solto } = sample();
    expect(countDescendants(c)).toBe(6);
    expect(countDescendants(a)).toBe(4);
    expect(countDescendants(b)).toBe(1);
    expect(countDescendants(solto)).toBe(0);
  });

  it("conta só os descendentes publicados (o que sairia do ar ao despublicar)", () => {
    const { c, a, e } = sample();
    expect(countPublishedDescendants(c)).toBe(5); // a, a1, b, b1, d1 (a2 é rascunho)
    expect(countPublishedDescendants(a)).toBe(3); // a1, b, b1
    expect(countPublishedDescendants(e)).toBe(1);
  });
});

describe("locate e hidingAncestor", () => {
  it("acha o nó com o pai, os irmãos, o índice e o nível", () => {
    const { roots, a, b1, c } = sample();
    expect(locate(roots, b1.id)).toMatchObject({ depth: 3, index: 0, parent: { id: expect.any(String) } });
    expect(locate(roots, b1.id)?.parent?.title).toBe("B");
    expect(locate(roots, a.id)).toMatchObject({ depth: 1, index: 0 });
    expect(locate(roots, c.id)).toMatchObject({ depth: 0, index: 0, parent: null });
    expect(locate(roots, "inexistente")).toBeNull();
  });

  it("um nó publicado sob um rascunho tem o rascunho como ancestral que o esconde", () => {
    const { roots, e1, e } = sample();
    expect(hidingAncestor(roots, e1.id)).toBe(e);
  });

  it("sem ancestral em rascunho, ou na raiz, não é escondido (um rascunho próprio não é 'oculto pelo pai')", () => {
    const { roots, a1, a2, e, solto, b1 } = sample();
    expect(hidingAncestor(roots, a1.id)).toBeNull();
    expect(hidingAncestor(roots, a2.id)).toBeNull();
    expect(hidingAncestor(roots, e.id)).toBeNull();
    expect(hidingAncestor(roots, solto.id)).toBeNull();
    expect(hidingAncestor(roots, b1.id)).toBeNull();
  });

  it("vários níveis: o que esconde é o ancestral em rascunho mais alto, mesmo com os do meio publicados", () => {
    const x = doc("x");
    const inner = col("inner", [x]);
    const outer = col("outer", [inner], "DRAFT");
    expect(hidingAncestor([outer], x.id)).toBe(outer);
    expect(hidingAncestor([outer], inner.id)).toBe(outer);
  });

  it("um id inexistente não é escondido por ninguém", () => {
    expect(hidingAncestor(sample().roots, "nada")).toBeNull();
  });
});

describe("withStatus e withoutNode (imutáveis)", () => {
  it("troca o estado só do nó e preserva os ramos que não mudaram", () => {
    const { roots, a1, e, c, b } = sample();
    const next = withStatus(roots, a1.id, "DRAFT");
    expect(locate(next, a1.id)?.node.status).toBe("DRAFT");
    expect(locate(roots, a1.id)?.node.status).toBe("PUBLISHED"); // a original não mudou
    expect(next[1]).toBe(e); // ramo sem relação: o mesmo objeto
    expect(next[0]).not.toBe(c);
    expect(locate(next, b.id)?.node).toBe(b);
  });

  it("despublicar uma coleção não muda o estado dos filhos (RN16)", () => {
    const { roots, c, a1 } = sample();
    const next = withStatus(roots, c.id, "DRAFT");
    expect(locate(next, c.id)?.node.status).toBe("DRAFT");
    expect(locate(next, a1.id)?.node.status).toBe("PUBLISHED");
  });

  it("remove o nó e toda a subárvore (RN07)", () => {
    const { roots, a, b1, d1 } = sample();
    const next = withoutNode(roots, a.id);
    expect(countNodes(next)).toBe(5);
    expect(locate(next, b1.id)).toBeNull();
    expect(locate(next, d1.id)).not.toBeNull();
    expect(countNodes(roots)).toBe(10);
  });

  it("remover um id inexistente não muda nada", () => {
    const { roots } = sample();
    expect(countNodes(withoutNode(roots, "nada"))).toBe(10);
  });
});

describe("swapWithSibling: subir e descer (RF03, RN05)", () => {
  it("sobe: troca com o irmão de cima e manda TODOS os irmãos renumerados, com o mesmo pai", () => {
    const { roots, a, a2 } = sample();
    const result = swapWithSibling(roots, a2.id, -1);
    expect(result).not.toBeNull();
    const siblings = locate(result?.roots ?? [], a.id)?.node.children.map((n) => n.title);
    expect(siblings).toEqual(["a2", "a1", "B"]);
    expect(result?.items).toEqual([
      { id: a2.id, parentId: a.id, order: 0 },
      { id: sample().a1.id && result?.items[1].id, parentId: a.id, order: 1 },
      { id: result?.items[2].id, parentId: a.id, order: 2 },
    ]);
    expect(result?.position).toBe(1);
    expect(result?.total).toBe(3);
  });

  it("desce: troca com o irmão de baixo", () => {
    const { roots, c, a } = sample();
    const result = swapWithSibling(roots, a.id, 1);
    expect(locate(result?.roots ?? [], c.id)?.node.children.map((n) => n.title)).toEqual(["d1", "A"]);
    expect(result?.position).toBe(2);
    expect(result?.items.map((i) => i.order)).toEqual([0, 1]);
  });

  it("na raiz, o pai do lote é nulo", () => {
    const { roots, solto } = sample();
    const result = swapWithSibling(roots, solto.id, -1);
    expect(result?.roots.map((n) => n.title)).toEqual(["C", "solto", "E"]);
    expect(result?.items.every((i) => i.parentId === null)).toBe(true);
    expect(result?.items.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it("o primeiro não sobe e o último não desce: devolve nulo", () => {
    const { roots, c, solto, a1, b } = sample();
    expect(swapWithSibling(roots, c.id, -1)).toBeNull();
    expect(swapWithSibling(roots, solto.id, 1)).toBeNull();
    expect(swapWithSibling(roots, a1.id, -1)).toBeNull();
    expect(swapWithSibling(roots, b.id, 1)).toBeNull();
    expect(swapWithSibling(roots, "nada", 1)).toBeNull();
  });

  it("renumera mesmo com ordens gravadas com lacunas ou empates", () => {
    const x = { ...doc("x"), order: 7 };
    const y = { ...doc("y"), order: 7 };
    const z = { ...doc("z"), order: 40 };
    const result = swapWithSibling([x, y, z], z.id, -1);
    expect(result?.items.map((i) => i.order)).toEqual([0, 1, 2]);
    expect(result?.roots.map((n) => n.title)).toEqual(["x", "z", "y"]);
  });

  it("não altera a árvore original (a tela guarda o retrato para reverter)", () => {
    const { roots, a2 } = sample();
    const before = JSON.stringify(roots);
    swapWithSibling(roots, a2.id, -1);
    expect(JSON.stringify(roots)).toBe(before);
  });

  it("o lote só tem irmãos do mesmo nível", () => {
    const { roots, b } = sample();
    const result = swapWithSibling(roots, b.id, -1);
    expect(result?.items).toHaveLength(3);
    expect(new Set(result?.items.map((i) => i.parentId)).size).toBe(1);
  });
});

describe("moveTargets: o seletor de 'mover' (RF07, RN06)", () => {
  const labels = (/** @type {ReturnType<typeof moveTargets>} */ targets) => targets.map((t) => t.label);

  it("só coleções (e a raiz): documentos nunca são destino (RN02)", () => {
    const { roots, d1 } = sample();
    const all = labels(moveTargets(roots, d1.id));
    expect(all).not.toContain("solto");
    expect(all.join("|")).not.toMatch(/d1|a1|a2|b1/);
    expect(all).toContain("C › A");
    expect(all).toContain("E");
  });

  it("sem ciclo: o próprio nó e toda a sua subárvore ficam de fora (RN06)", () => {
    const { roots, a } = sample();
    const all = labels(moveTargets(roots, a.id));
    expect(all.join("|")).not.toMatch(/C › A|C › A › B/);
    expect(all).toContain("E");
  });

  it("uma coleção na raiz não pode ir para dentro de uma filha, mas pode ir para outra", () => {
    const { roots, c } = sample();
    const all = labels(moveTargets(roots, c.id));
    expect(all).toEqual(["E"]);
  });

  it("não oferece o pai atual (não mudaria nada), e oferece a raiz a quem está dentro de uma coleção", () => {
    const { roots, a1, solto } = sample();
    const fromA = moveTargets(roots, a1.id);
    expect(labels(fromA)).not.toContain("C › A");
    expect(fromA[0]).toEqual({ value: "", label: "Raiz do espaço (sem coleção)", depth: 0 });
    // Quem já está na raiz não tem a raiz como opção.
    expect(labels(moveTargets(roots, solto.id))).not.toContain("Raiz do espaço (sem coleção)");
  });

  it("os valores são os ids das coleções; o rótulo é o caminho, e o nível serve ao recuo", () => {
    const { roots, solto, b } = sample();
    const targets = moveTargets(roots, solto.id);
    const target = targets.find((t) => t.label === "C › A › B");
    expect(target).toEqual({ value: b.id, label: "C › A › B", depth: 3 });
    expect(targets.find((t) => t.label === "C")?.depth).toBe(1);
  });

  it("a coleção em rascunho também é destino (o dono pode mover para uma coleção oculta)", () => {
    const { roots, solto, e } = sample();
    expect(moveTargets(roots, solto.id).some((t) => t.value === e.id)).toBe(true);
  });

  it("um id inexistente não tem destinos", () => {
    expect(moveTargets(sample().roots, "nada")).toEqual([]);
  });
});

describe("suggestSlug e validateNewCollection (RN03)", () => {
  it("tira acentos e usa hífens", () => {
    expect(suggestSlug("Cálculo Numérico I", [])).toBe("calculo-numerico-i");
    expect(suggestSlug("  Álgebra & Geometria!! ", [])).toBe("algebra-geometria");
  });

  it("um slug já usado pelos irmãos ganha -2, -3...", () => {
    expect(suggestSlug("Cálculo", ["calculo"])).toBe("calculo-2");
    expect(suggestSlug("Cálculo", ["calculo", "calculo-2"])).toBe("calculo-3");
  });

  it("o sufixo cabe nos 80 caracteres", () => {
    const long = "a".repeat(100);
    const first = suggestSlug(long, []);
    expect(first).toHaveLength(80);
    const second = suggestSlug(long, [first]);
    expect(second).toHaveLength(80);
    expect(second.endsWith("-2")).toBe(true);
    expect(SLUG_PATTERN.test(second)).toBe(true);
  });

  it("um título sem letra nem dígito não dá sugestão", () => {
    expect(suggestSlug("!!!", [])).toBe("");
    expect(suggestSlug("", [])).toBe("");
  });

  it("todo slug sugerido é válido", () => {
    for (const title of ["Introdução à Programação", "C++ e C#", "2026: um ano", "ação-reação"]) {
      expect(SLUG_PATTERN.test(suggestSlug(title, []))).toBe(true);
    }
  });

  it("valida o título e o slug, com as mensagens do servidor", () => {
    expect(validateNewCollection({ title: "Ok", slug: "ok" })).toEqual({});
    expect(validateNewCollection({ title: "   ", slug: "ok" })).toEqual({ title: "O título é obrigatório." });
    expect(validateNewCollection({ title: "Ok", slug: "" })).toEqual({ slug: "O slug é obrigatório." });
    expect(validateNewCollection({ title: "Ok", slug: "Maiúscula" })).toEqual({ slug: "O slug deve conter apenas letras minúsculas, dígitos e hífens." });
    expect(validateNewCollection({ title: "Ok", slug: "a--b" }).slug).toMatch(/apenas letras minúsculas/);
    expect(validateNewCollection({ title: "Ok", slug: "a".repeat(81) })).toEqual({ slug: "O slug deve ter no máximo 80 caracteres." });
    expect(validateNewCollection({ title: "Ok", slug: "a".repeat(80) })).toEqual({});
  });
});

describe("slugsUnder e expandableIds", () => {
  it("lista os slugs dos filhos diretos de um pai, ou das raízes", () => {
    const { roots, a } = sample();
    expect(slugsUnder(roots, null)).toEqual(["c", "e", "solto"]);
    expect(slugsUnder(roots, a.id)).toEqual(["a1", "a2", "b"]);
    expect(slugsUnder(roots, "nada")).toEqual([]);
  });

  it("só as coleções com filhos se recolhem", () => {
    const { roots, c, a, b, e } = sample();
    expect(expandableIds(roots).sort()).toEqual([c.id, a.id, b.id, e.id].sort());
    expect(expandableIds([col("vazia")])).toEqual([]);
  });
});

describe("500 nós em 5 níveis", () => {
  /** 5 níveis, 500 nós: 4 raízes de 5 coleções, cada uma com... gerado por contagem. */
  function big() {
    let made = 0;
    /** @param {number} depth @returns {any[]} */
    const level = (depth) => {
      const out = [];
      const width = depth === 0 ? 5 : depth === 4 ? 6 : 4;
      for (let i = 0; i < width && made < 500; i += 1) {
        made += 1;
        const isCollection = depth < 4 && made % 7 !== 0;
        out.push(node(`N${made}`, isCollection ? "COLLECTION" : "DOCUMENT", made % 5 === 0 ? "DRAFT" : "PUBLISHED", isCollection ? level(depth + 1) : []));
      }
      return out;
    };
    const roots = [];
    while (made < 500) roots.push(...level(0));
    return roots;
  }

  it("as funções do modelo passam em poucos milissegundos", () => {
    const roots = big();
    expect(countNodes(roots)).toBe(500);
    const start = performance.now();
    for (let i = 0; i < 50; i += 1) {
      countNodes(roots);
      const last = locate(roots, roots[roots.length - 1].id);
      if (last) swapWithSibling(roots, last.node.id, -1);
      moveTargets(roots, roots[0].id);
      hidingAncestor(roots, roots[roots.length - 1].id);
    }
    const perRound = (performance.now() - start) / 50;
    expect(perRound).toBeLessThan(20);
  });
});
