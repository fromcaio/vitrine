// Cliente da API de conteúdo da árvore (RF03, RF06, RF07, RF26; Cap. 5 §5.10): o que cada função
// envia e como cada resposta de erro vira uma mensagem em português. Ambiente node, `fetch` simulado.
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, createCollection, deleteContent, fetchTree, moveTo, renameContent, reorder, setStatus } from "@/components/admin/content-tree-client";

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
const respond = (body, status = 200, headers = {}) =>
  vi.fn(async () => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));
/** @param {string} code @param {unknown} [details] */
const apiError = (code, details = []) => ({ error: { code, message: "x", details } });

const NODE = { id: "a", title: "A", slug: "a", type: "COLLECTION", status: "PUBLISHED", parentId: null, order: 0, children: [] };

describe("fetchTree", () => {
  it("lê GET /api/contents sem cache e devolve a árvore saneada", async () => {
    const fetchImpl = respond({ data: [NODE, { id: "" }, null] });
    const result = await fetchTree(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/contents", { cache: "no-store" });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.tree.map((n) => n.id)).toEqual(["a"]);
  });

  it("uma resposta sem data é uma árvore vazia", async () => {
    const result = await fetchTree(respond({}));
    expect(result.ok && result.tree).toEqual([]);
  });
});

describe("createCollection", () => {
  it("envia POST com o título aparado, o slug, o tipo COLLECTION e o pai", async () => {
    const fetchImpl = respond({ data: { id: "novo" } }, 201);
    const result = await createCollection({ title: "  Cálculo  ", slug: "calculo", parentId: "pai" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/contents");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ title: "Cálculo", slug: "calculo", type: "COLLECTION", parentId: "pai" });
    expect(result).toEqual({ ok: true, id: "novo" });
  });

  it("na raiz, o pai é nulo", async () => {
    const fetchImpl = respond({ data: { id: "n" } }, 201);
    await createCollection({ title: "T", slug: "t", parentId: null }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).parentId).toBeNull();
  });

  it("409 SLUG_CONFLICT traz a sugestão do servidor", async () => {
    const result = await createCollection({ title: "T", slug: "t", parentId: null }, respond(apiError("SLUG_CONFLICT", [{ field: "slug", value: "t", suggestion: "t-2" }]), 409));
    expect(result).toEqual({ ok: false, kind: "slug-conflict", message: MESSAGES.slugConflict, suggestion: "t-2" });
  });

  it("409 SLUG_CONFLICT sem sugestão não inventa uma", async () => {
    const result = await createCollection({ title: "T", slug: "t", parentId: null }, respond(apiError("SLUG_CONFLICT"), 409));
    expect(result).toMatchObject({ ok: false, kind: "slug-conflict" });
    expect(result.ok === false && "suggestion" in result).toBe(false);
  });

  it("422 QUOTA_EXCEEDED é a cota (RN25)", async () => {
    expect(await createCollection({ title: "T", slug: "t", parentId: null }, respond(apiError("QUOTA_EXCEEDED"), 422))).toMatchObject({ ok: false, kind: "quota", message: MESSAGES.quota });
  });

  it("422 INVALID_PARENT é destino inválido", async () => {
    expect(await createCollection({ title: "T", slug: "t", parentId: "x" }, respond(apiError("INVALID_PARENT"), 422))).toMatchObject({ ok: false, kind: "invalid-parent" });
  });
});

describe("setStatus e moveTo", () => {
  it("publicar e despublicar enviam só { status } por PATCH", async () => {
    const fetchImpl = respond({ data: NODE });
    expect(await setStatus("a b", "DRAFT", fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/contents/a%20b");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "DRAFT" });
  });

  it("mover envia só { parentId }, e a raiz é null", async () => {
    const fetchImpl = respond({ data: NODE });
    await moveTo("a", "dest", fetchImpl);
    await moveTo("a", null, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ parentId: "dest" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ parentId: null });
  });

  it("nunca envia version (só o PATCH do corpo a exige)", async () => {
    const fetchImpl = respond({ data: NODE });
    await setStatus("a", "DRAFT", fetchImpl);
    await moveTo("a", null, fetchImpl);
    for (const [, init] of fetchImpl.mock.calls) expect(init.body).not.toMatch(/version/);
  });

  it("422 CYCLE_DETECTED é destino inválido", async () => {
    expect(await moveTo("a", "b", respond(apiError("CYCLE_DETECTED"), 422))).toMatchObject({ ok: false, kind: "invalid-parent" });
  });
});

describe("reorder", () => {
  it("envia o lote como lista e devolve a árvore do servidor", async () => {
    const items = [{ id: "a", parentId: null, order: 0 }, { id: "b", parentId: null, order: 1 }];
    const fetchImpl = respond({ data: [NODE] });
    const result = await reorder(items, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/contents/reorder");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual(items);
    expect(result.ok && result.tree[0].id).toBe("a");
  });
});

describe("deleteContent", () => {
  it("envia DELETE e aceita 204 sem corpo", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await deleteContent("a", fetchImpl)).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/contents/a", { method: "DELETE" });
  });
});

describe("falhas comuns", () => {
  const call = (/** @type {typeof fetch} */ impl) => setStatus("a", "DRAFT", impl);

  it("401, 403, 404, 429, 5xx e rede", async () => {
    expect(await call(respond(apiError("UNAUTHENTICATED"), 401))).toMatchObject({ kind: "unauthenticated", message: MESSAGES.unauthenticated });
    expect(await call(respond(apiError("FORBIDDEN"), 403))).toMatchObject({ kind: "forbidden", message: MESSAGES.forbidden });
    expect(await call(respond(apiError("PASSWORD_CHANGE_REQUIRED"), 403))).toMatchObject({ kind: "forbidden", message: MESSAGES.passwordChange });
    expect(await call(respond(apiError("NOT_FOUND"), 404))).toMatchObject({ kind: "not-found", message: MESSAGES.notFound });
    expect(await call(respond(apiError("INTERNAL"), 500))).toMatchObject({ kind: "server", message: MESSAGES.server });
    expect(await call(vi.fn(async () => { throw new TypeError("fetch failed"); }))).toMatchObject({ kind: "network", message: MESSAGES.network });
  });

  it("429 cita o Retry-After, no singular e no plural", async () => {
    expect((await call(respond(apiError("RATE_LIMITED"), 429, { "Retry-After": "12" }))).ok === false && (await call(respond(apiError("RATE_LIMITED"), 429, { "Retry-After": "12" }))).message).toMatch(/Tente de novo em 12 segundos\./);
    const one = await call(respond(apiError("RATE_LIMITED"), 429, { "Retry-After": "1" }));
    expect(one.ok === false && one.message).toMatch(/em 1 segundo\./);
    const none = await call(respond(apiError("RATE_LIMITED"), 429));
    expect(none.ok === false && none.message).toBe(MESSAGES.rateLimited);
  });

  it("400 e 422 sem código conhecido viram 'não aceitou'", async () => {
    expect(await call(respond(apiError("VALIDATION_ERROR"), 422))).toMatchObject({ kind: "rejected", message: MESSAGES.rejected });
    expect(await call(respond(apiError("VALIDATION_ERROR"), 400))).toMatchObject({ kind: "rejected" });
  });

  it("um corpo que não é JSON não derruba a interpretação", async () => {
    const impl = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await call(impl)).toMatchObject({ kind: "server" });
  });

  it("nunca repassa o texto do erro do servidor (só as mensagens próprias)", async () => {
    const impl = respond({ error: { code: "NOT_FOUND", message: "<script>alert(1)</script>", details: [] } }, 404);
    const result = await call(impl);
    expect(result.ok === false && result.message).not.toMatch(/script/);
  });
});

describe("renameContent (P-028)", () => {
  it("envia PATCH só com os campos que mudaram, o título aparado e NUNCA version", async () => {
    const fetchImpl = respond({ data: NODE });
    expect(await renameContent("a b", { title: "  AEDS II  ", slug: "aeds-ii" }, fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/contents/a%20b");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ title: "AEDS II", slug: "aeds-ii" });
    await renameContent("a", { title: "Só título" }, fetchImpl);
    await renameContent("a", { slug: "so-slug" }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ title: "Só título" });
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ slug: "so-slug" });
    for (const [, call] of fetchImpl.mock.calls) expect(call.body).not.toMatch(/version/);
  });

  it("409 SLUG_CONFLICT traz a sugestão do servidor; os demais erros viram mensagens em português", async () => {
    expect(await renameContent("a", { slug: "x" }, respond(apiError("SLUG_CONFLICT", [{ field: "slug", suggestion: "x-2" }]), 409))).toMatchObject({
      ok: false,
      kind: "slug-conflict",
      suggestion: "x-2",
      message: MESSAGES.slugConflict,
    });
    expect(await renameContent("a", { title: "x" }, respond(apiError("NOT_FOUND"), 404))).toMatchObject({ kind: "not-found" });
    expect(await renameContent("a", { title: "x" }, respond(apiError("FORBIDDEN"), 403))).toMatchObject({ kind: "forbidden" });
    expect(await renameContent("a", { title: "x" }, respond(apiError("VALIDATION_ERROR"), 422))).toMatchObject({ kind: "rejected", message: MESSAGES.rejected });
    expect(await renameContent("a", { title: "x" }, respond(apiError("RATE_LIMITED"), 429))).toMatchObject({ kind: "rate-limited" });
    expect(await renameContent("a", { title: "x" }, vi.fn(() => Promise.reject(new TypeError("x"))))).toMatchObject({ kind: "network", message: MESSAGES.network });
  });
});
