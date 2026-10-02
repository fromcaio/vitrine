// @vitest-environment jsdom
// Rascunho local do editor (M09; RF15, CT20): chave por usuário e por conteúdo, leitura tolerante
// a dados corrompidos e a armazenamento indisponível, e limpeza ao sair (A-010, nota 10).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_KEY_PREFIX,
  clearAllDrafts,
  draftStorageKey,
  parseDraft,
  readDraft,
  removeDraft,
  writeDraft,
} from "@/components/editor/draft";

const VALUES = { title: "Cálculo I", slug: "calculo-1", body: "# Limites\n\n$\\lim_{x \\to 0} x$", status: /** @type {const} */ ("DRAFT") };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("draftStorageKey", () => {
  it("tem o formato vitrine:rascunho:{usuário}:{conteúdo}", () => {
    expect(DRAFT_KEY_PREFIX).toBe("vitrine:rascunho:");
    expect(draftStorageKey("u1", "c9")).toBe("vitrine:rascunho:u1:c9");
  });

  it('usa "novo" enquanto o conteúdo não existe', () => {
    expect(draftStorageKey("u1", null)).toBe("vitrine:rascunho:u1:novo");
    expect(draftStorageKey("u1", undefined)).toBe("vitrine:rascunho:u1:novo");
    expect(draftStorageKey("u1", "")).toBe("vitrine:rascunho:u1:novo");
  });

  it("é diferente para cada usuário e para cada conteúdo", () => {
    const keys = new Set([draftStorageKey("u1", "c1"), draftStorageKey("u2", "c1"), draftStorageKey("u1", "c2"), draftStorageKey("u1", null), draftStorageKey("u2", null)]);
    expect(keys.size).toBe(5);
  });

  it("exige o identificador do usuário: sem ele, o rascunho seria de todos", () => {
    for (const userId of ["", undefined, null, 42]) {
      expect(() => draftStorageKey(/** @type {any} */ (userId), "c1")).toThrow(TypeError);
    }
  });
});

describe("writeDraft e readDraft", () => {
  it("guarda e devolve os valores, a versão de base e a data", () => {
    const key = draftStorageKey("u1", "c1");
    const before = Date.now();
    const stored = writeDraft(key, { values: VALUES, baseVersion: "2026-10-02T10:00:00.000Z" });

    expect(stored).toMatchObject({ values: VALUES, baseVersion: "2026-10-02T10:00:00.000Z" });
    expect(Date.parse(/** @type {any} */ (stored).savedAt)).toBeGreaterThanOrEqual(before);
    expect(readDraft(key)).toEqual(stored);
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem(key)))).toEqual(stored);
  });

  it("aceita um conteúdo novo, sem versão de base", () => {
    const key = draftStorageKey("u1", null);
    writeDraft(key, { values: VALUES, baseVersion: null });
    expect(readDraft(key)?.baseVersion).toBeNull();
  });

  it("o rascunho de um usuário não é lido por outro, nem o de um conteúdo por outro", () => {
    writeDraft(draftStorageKey("u1", "c1"), { values: VALUES, baseVersion: null });
    expect(readDraft(draftStorageKey("u2", "c1"))).toBeNull();
    expect(readDraft(draftStorageKey("u1", "c2"))).toBeNull();
    expect(readDraft(draftStorageKey("u1", "c1"))).not.toBeNull();
  });

  it("grava só os campos do editor, mesmo que o objeto traga mais", () => {
    const key = draftStorageKey("u1", "c1");
    writeDraft(key, { values: /** @type {any} */ ({ ...VALUES, authorId: "u9", senha: "x" }), baseVersion: null });
    const raw = JSON.parse(/** @type {string} */ (localStorage.getItem(key)));
    expect(Object.keys(raw.values).sort()).toEqual(["body", "slug", "status", "title"]);
  });

  it("devolve ausente quando não há rascunho", () => {
    expect(readDraft(draftStorageKey("u1", "c1"))).toBeNull();
  });

  it("removeDraft apaga só a chave pedida", () => {
    const a = draftStorageKey("u1", "c1");
    const b = draftStorageKey("u1", "c2");
    writeDraft(a, { values: VALUES, baseVersion: null });
    writeDraft(b, { values: VALUES, baseVersion: null });
    removeDraft(a);
    expect(readDraft(a)).toBeNull();
    expect(readDraft(b)).not.toBeNull();
    expect(() => removeDraft(a)).not.toThrow();
  });
});

describe("parseDraft: dado corrompido ou de outro formato vale como ausente", () => {
  const valid = { values: VALUES, baseVersion: "v1", savedAt: "2026-10-02T10:00:00.000Z" };

  it("aceita o formato certo", () => {
    expect(parseDraft(JSON.stringify(valid))).toEqual(valid);
    expect(parseDraft(null)).toBeNull();
  });

  it.each([
    ["texto que não é JSON", "{isto não é json"],
    ["JSON de outro tipo", '"texto"'],
    ["nulo", "null"],
    ["número", "42"],
    ["lista", "[]"],
    ["objeto vazio", "{}"],
    ["sem os valores", JSON.stringify({ baseVersion: null, savedAt: valid.savedAt })],
    ["valores nulos", JSON.stringify({ ...valid, values: null })],
    ["título que não é texto", JSON.stringify({ ...valid, values: { ...VALUES, title: 1 } })],
    ["slug ausente", JSON.stringify({ ...valid, values: { title: "a", body: "b", status: "DRAFT" } })],
    ["corpo nulo", JSON.stringify({ ...valid, values: { ...VALUES, body: null } })],
    ["estado desconhecido", JSON.stringify({ ...valid, values: { ...VALUES, status: "ARCHIVED" } })],
    ["data que não é texto", JSON.stringify({ ...valid, savedAt: 123 })],
    ["data inválida", JSON.stringify({ ...valid, savedAt: "ontem" })],
    ["versão de base numérica", JSON.stringify({ ...valid, baseVersion: 7 })],
    ["versão de base ausente", JSON.stringify({ values: VALUES, savedAt: valid.savedAt })],
  ])("%s", (_name, raw) => {
    expect(parseDraft(raw)).toBeNull();
  });

  it("descarta campos desconhecidos ao ler", () => {
    const parsed = parseDraft(JSON.stringify({ ...valid, extra: 1, values: { ...VALUES, authorId: "u9" } }));
    expect(parsed).toEqual(valid);
  });

  it("readDraft ignora um valor corrompido no armazenamento", () => {
    const key = draftStorageKey("u1", "c1");
    localStorage.setItem(key, "{corrompido");
    expect(readDraft(key)).toBeNull();
  });
});

describe("clearAllDrafts (ao sair)", () => {
  it("apaga os rascunhos de todos os usuários e conteúdos, e só eles", () => {
    writeDraft(draftStorageKey("u1", "c1"), { values: VALUES, baseVersion: null });
    writeDraft(draftStorageKey("u1", null), { values: VALUES, baseVersion: null });
    writeDraft(draftStorageKey("u2", "c1"), { values: VALUES, baseVersion: null });
    localStorage.setItem("vitrine:tema", "escuro");
    localStorage.setItem("outro-site:rascunho:u1:c1", "x");
    localStorage.setItem("vitrine:rascunhos-antigos", "x");

    expect(clearAllDrafts()).toBe(3);

    expect(readDraft(draftStorageKey("u1", "c1"))).toBeNull();
    expect(readDraft(draftStorageKey("u1", null))).toBeNull();
    expect(readDraft(draftStorageKey("u2", "c1"))).toBeNull();
    expect(localStorage.getItem("vitrine:tema")).toBe("escuro");
    expect(localStorage.getItem("outro-site:rascunho:u1:c1")).toBe("x");
    expect(localStorage.getItem("vitrine:rascunhos-antigos")).toBe("x");
    expect(localStorage.length).toBe(3);
  });

  it("apaga todos mesmo quando são muitos (a remoção não pula chaves)", () => {
    for (let index = 0; index < 25; index += 1) writeDraft(draftStorageKey("u1", `c${index}`), { values: VALUES, baseVersion: null });
    expect(clearAllDrafts()).toBe(25);
    expect(localStorage.length).toBe(0);
  });

  it("não falha sem rascunhos", () => {
    expect(clearAllDrafts()).toBe(0);
  });
});

describe("armazenamento indisponível: o editor continua funcionando, sem rascunho", () => {
  it("setItem recusado (cheio): writeDraft devolve nulo, sem lançar", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(writeDraft(draftStorageKey("u1", "c1"), { values: VALUES, baseVersion: null })).toBeNull();
  });

  it("getItem recusado: readDraft devolve nulo", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(readDraft(draftStorageKey("u1", "c1"))).toBeNull();
  });

  it("removeItem recusado: removeDraft não lança", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(() => removeDraft(draftStorageKey("u1", "c1"))).not.toThrow();
  });

  it("o próprio acesso ao localStorage lança (janela privada, dados bloqueados)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      const key = draftStorageKey("u1", "c1");
      expect(readDraft(key)).toBeNull();
      expect(writeDraft(key, { values: VALUES, baseVersion: null })).toBeNull();
      expect(() => removeDraft(key)).not.toThrow();
      expect(clearAllDrafts()).toBe(0);
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
      else delete (/** @type {any} */ (window).localStorage);
    }
  });

  it("clearAllDrafts não lança se a iteração falhar", () => {
    writeDraft(draftStorageKey("u1", "c1"), { values: VALUES, baseVersion: null });
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(clearAllDrafts()).toBe(0);
  });
});
