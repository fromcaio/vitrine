// Cliente da API de conteúdo do editor (M09; Cap. 5 §5.10, ADR-018) e resolvedor do formulário.
// Roda sem navegador: as respostas HTTP são objetos Response de verdade, em um fetch simulado.
import { describe, expect, it, vi } from "vitest";
import { interpretResponse, saveContent } from "@/components/editor/content-client";
import { clearAllDrafts, readDraft, writeDraft } from "@/components/editor/draft";
import { EDITOR_FIELDS, editorResolver, editorSchema, valuesEqual } from "@/components/editor/schema";

const VALUES = { title: "Cálculo I", slug: "calculo-1", body: "texto", status: /** @type {const} */ ("PUBLISHED") };

/** @param {number} status @param {unknown} body */
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** @param {number} status @param {string} text */
const text = (status, body) => new Response(body, { status, headers: { "Content-Type": "text/html" } });

describe("interpretResponse", () => {
  it("sucesso: devolve o id e a versão (updatedAt)", async () => {
    const result = await interpretResponse(json(201, { data: { id: "c1", updatedAt: "2026-10-02T12:00:00.000Z" } }));
    expect(result).toEqual({ ok: true, id: "c1", version: "2026-10-02T12:00:00.000Z" });
  });

  it("sucesso sem updatedAt: versão nula", async () => {
    expect(await interpretResponse(json(200, { data: { id: "c1" } }))).toEqual({ ok: true, id: "c1", version: null });
  });

  it.each([
    ["sem data", json(200, {})],
    ["sem id", json(200, { data: {} })],
    ["corpo que não é JSON", text(200, "<html>ok</html>")],
    ["corpo vazio", new Response(null, { status: 200 })],
  ])("sucesso mal formado (%s) vira erro do servidor, sem lançar", async (_name, response) => {
    expect(await interpretResponse(response)).toMatchObject({ ok: false, kind: "server" });
  });

  it("401: sessão ausente ou expirada", async () => {
    const result = await interpretResponse(json(401, { error: { code: "UNAUTHENTICATED", message: "Autenticação necessária.", details: [] } }));
    expect(result).toMatchObject({ ok: false, kind: "unauthenticated", fieldErrors: [] });
    expect(/** @type {any} */ (result).message).toMatch(/sessão expirou/i);
  });

  it("403: sem permissão para o conteúdo (ADR-023), com a mensagem do servidor quando ela vem", async () => {
    const withMessage = await interpretResponse(json(403, { error: { code: "FORBIDDEN", message: "Você só pode alterar o seu próprio conteúdo.", details: [] } }));
    expect(withMessage).toEqual({ ok: false, kind: "forbidden", message: "Você só pode alterar o seu próprio conteúdo.", fieldErrors: [] });
    const without = await interpretResponse(json(403, {}));
    expect(without).toMatchObject({ ok: false, kind: "forbidden", message: "Você não tem permissão para alterar este conteúdo." });
    // Um 403 de outro motivo (senha provisória) também mostra o texto do servidor.
    const password = await interpretResponse(json(403, { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Troque a senha provisória para continuar.", details: [] } }));
    expect(password).toMatchObject({ kind: "forbidden", message: "Troque a senha provisória para continuar." });
  });

  it("422 QUOTA_EXCEEDED e 413: o limite de conteúdos ou de tamanho, não um erro de campo", async () => {
    const quota = await interpretResponse(json(422, { error: { code: "QUOTA_EXCEEDED", message: "O texto passa de 256 KiB.", details: [{ field: "body", message: "Texto grande demais." }] } }));
    expect(quota).toMatchObject({ ok: false, kind: "quota", message: "O texto passa de 256 KiB." });
    expect(await interpretResponse(json(422, { error: { code: "QUOTA_EXCEEDED", details: [] } }))).toMatchObject({ kind: "quota", message: "O limite de conteúdos ou o tamanho máximo do texto foi atingido." });
    expect(await interpretResponse(json(413, { error: { code: "PAYLOAD_TOO_LARGE", message: "Corpo grande demais.", details: [] } }))).toMatchObject({ kind: "quota", message: "Corpo grande demais." });
    expect(await interpretResponse(text(413, "<html>Request Entity Too Large</html>"))).toMatchObject({ kind: "quota" });
    // Um 422 comum continua sendo validação.
    expect(await interpretResponse(json(422, { error: { code: "VALIDATION_ERROR", message: "x", details: [] } }))).toMatchObject({ kind: "validation" });
  });

  it("429: envios demais em pouco tempo", async () => {
    expect(await interpretResponse(json(429, { error: { code: "RATE_LIMITED", message: "Limite.", details: [] } }))).toMatchObject({ ok: false, kind: "rate-limited", message: "Muitos envios em pouco tempo. Aguarde um instante e tente de novo." });
  });

  it("404: o conteúdo não existe mais", async () => {
    const result = await interpretResponse(json(404, { error: { code: "NOT_FOUND", message: "Conteúdo não encontrado.", details: [{ field: "id", value: "c1" }] } }));
    expect(result).toMatchObject({ ok: false, kind: "not-found", fieldErrors: [] });
  });

  it("409: slug em conflito, com a sugestão da API junto do campo", async () => {
    const result = await interpretResponse(
      json(409, { error: { code: "SLUG_CONFLICT", message: "Já existe um conteúdo com este slug na mesma coleção.", details: [{ field: "slug", value: "introducao", suggestion: "introducao-2" }] } }),
    );
    expect(result).toEqual({
      ok: false,
      kind: "conflict",
      message: "Já existe um conteúdo com este slug na mesma coleção.",
      fieldErrors: [{ field: "slug", message: "Já existe um conteúdo com este slug na mesma coleção.", suggestion: "introducao-2" }],
    });
  });

  it("409 sem sugestão: o erro fica no slug, sem a chave suggestion", async () => {
    const result = await interpretResponse(json(409, { error: { code: "SLUG_CONFLICT", message: "Conflito.", details: [] } }));
    expect(/** @type {any} */ (result).fieldErrors).toEqual([{ field: "slug", message: "Conflito." }]);
  });

  it("422: um erro por campo, na mensagem do servidor", async () => {
    const result = await interpretResponse(
      json(422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
          details: [
            { field: "title", message: "O título é obrigatório." },
            { field: "slug", message: 'O slug "api" é reservado no nível raiz.' },
          ],
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, kind: "validation" });
    expect(/** @type {any} */ (result).fieldErrors).toEqual([
      { field: "title", message: "O título é obrigatório." },
      { field: "slug", message: 'O slug "api" é reservado no nível raiz.' },
    ]);
  });

  it("422 com valor recusado e sem mensagem: usa um texto padrão", async () => {
    const result = await interpretResponse(json(422, { error: { code: "INVALID_PARENT", message: "x", details: [{ field: "parentId", value: "zzz" }] } }));
    expect(/** @type {any} */ (result).fieldErrors).toEqual([{ field: "parentId", message: "Valor recusado." }]);
  });

  it("ignora itens de details sem campo ou que não são objetos", async () => {
    const result = await interpretResponse(json(422, { error: { details: [null, 7, "x", { message: "sem campo" }, { field: "", message: "vazio" }, { field: "body", message: "ok" }] } }));
    expect(/** @type {any} */ (result).fieldErrors).toEqual([{ field: "body", message: "ok" }]);
  });

  it("400: usa a mensagem do servidor (JSON malformado)", async () => {
    const result = await interpretResponse(json(400, { error: { code: "VALIDATION_ERROR", message: "JSON malformado no corpo da requisição.", details: [] } }));
    expect(result).toMatchObject({ ok: false, kind: "validation", message: "JSON malformado no corpo da requisição." });
  });

  it.each([500, 502, 503])("%i: erro do servidor, mesmo com uma página HTML de um proxy", async (status) => {
    expect(await interpretResponse(text(status, "<html>Bad gateway</html>"))).toMatchObject({ ok: false, kind: "server" });
    expect(await interpretResponse(json(status, { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: [] } }))).toMatchObject({ ok: false, kind: "server" });
  });

  it("outros códigos de erro viram erro do servidor", async () => {
    expect(await interpretResponse(text(418, "x"))).toMatchObject({ ok: false, kind: "server" });
  });

  it("nunca repassa detalhes internos: a mensagem de um 500 é a nossa", async () => {
    const result = await interpretResponse(json(500, { error: { code: "INTERNAL_ERROR", message: "SQLITE_ERROR: no such table", details: [] } }));
    expect(/** @type {any} */ (result).message).not.toMatch(/sqlite/i);
  });
});

describe("saveContent", () => {
  /** @param {Response} [response] */
  const fakeFetch = (response = json(201, { data: { id: "novo-id", updatedAt: "2026-10-02T12:00:00.000Z" } })) => vi.fn(async () => response);

  it("cria com POST /api/contents e o corpo do contrato", async () => {
    const fetchImpl = fakeFetch();
    const result = await saveContent({ id: null, parentId: "pai-1", values: VALUES, fetchImpl });

    expect(result).toEqual({ ok: true, id: "novo-id", version: "2026-10-02T12:00:00.000Z" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = /** @type {[string, RequestInit]} */ (fetchImpl.mock.calls[0]);
    expect(url).toBe("/api/contents");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(/** @type {string} */ (init.body))).toEqual({
      title: "Cálculo I",
      slug: "calculo-1",
      type: "DOCUMENT",
      parentId: "pai-1",
      body: "texto",
      status: "PUBLISHED",
    });
  });

  it("cria na raiz com parentId nulo", async () => {
    const fetchImpl = fakeFetch();
    await saveContent({ id: null, values: VALUES, fetchImpl });
    const init = /** @type {RequestInit} */ (fetchImpl.mock.calls[0][1]);
    expect(JSON.parse(/** @type {string} */ (init.body)).parentId).toBeNull();
  });

  it("atualiza com PATCH /api/contents/:id, sem tipo nem pai", async () => {
    const fetchImpl = fakeFetch(json(200, { data: { id: "abc", updatedAt: "2026-10-02T13:00:00.000Z" } }));
    const result = await saveContent({ id: "abc", parentId: "ignorado", values: VALUES, fetchImpl });

    expect(result).toEqual({ ok: true, id: "abc", version: "2026-10-02T13:00:00.000Z" });
    const [url, init] = /** @type {[string, RequestInit]} */ (fetchImpl.mock.calls[0]);
    expect(url).toBe("/api/contents/abc");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(/** @type {string} */ (init.body))).toEqual({ title: "Cálculo I", slug: "calculo-1", body: "texto", status: "PUBLISHED" });
  });

  it("codifica o identificador na URL", async () => {
    const fetchImpl = fakeFetch(json(200, { data: { id: "a/b c" } }));
    await saveContent({ id: "a/b c?x=1", values: VALUES, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/contents/a%2Fb%20c%3Fx%3D1");
  });

  it("não envia o autor (RN13), credenciais nem cabeçalho de autorização", async () => {
    const fetchImpl = fakeFetch();
    await saveContent({ id: null, values: { ...VALUES, authorId: "u9" }, fetchImpl });
    const init = /** @type {RequestInit} */ (fetchImpl.mock.calls[0][1]);
    expect(JSON.parse(/** @type {string} */ (init.body))).not.toHaveProperty("authorId");
    expect(init).not.toHaveProperty("credentials");
    expect(Object.keys(/** @type {object} */ (init.headers))).toEqual(["Content-Type"]);
  });

  it("falha de rede vira o resultado de rede, sem lançar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await saveContent({ id: "abc", values: VALUES, fetchImpl })).toMatchObject({ ok: false, kind: "network", fieldErrors: [] });
  });

  it("traduz um erro da API", async () => {
    const fetchImpl = fakeFetch(json(409, { error: { code: "SLUG_CONFLICT", message: "Conflito.", details: [{ field: "slug", value: "calculo-1", suggestion: "calculo-1-2" }] } }));
    const result = await saveContent({ id: null, values: VALUES, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: "conflict" });
    expect(/** @type {any} */ (result).fieldErrors[0].suggestion).toBe("calculo-1-2");
  });
});

describe("editorResolver (Zod com as regras do servidor)", () => {
  it("aceita valores válidos e devolve o título sem espaços nas pontas", async () => {
    const result = await editorResolver({ ...VALUES, title: "  Cálculo I  " });
    expect(result).toEqual({ values: { ...VALUES, title: "Cálculo I" }, errors: {} });
  });

  it("aceita um texto vazio (um rascunho pode não ter corpo ainda)", async () => {
    expect((await editorResolver({ ...VALUES, body: "" })).errors).toEqual({});
  });

  it("recusa o título vazio ou só de espaços, em português", async () => {
    for (const title of ["", "   ", "\t\n"]) {
      const { errors } = await editorResolver({ ...VALUES, title });
      expect(errors).toEqual({ title: { type: "validation", message: "O título é obrigatório." } });
    }
  });

  it.each([
    ["vazio", "", "O slug é obrigatório."],
    ["maiúsculas", "Calculo", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["espaço", "calculo 1", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["acento", "cálculo", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["hífen no início", "-calculo", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["hífen no fim", "calculo-", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["hífen repetido", "calculo--1", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
    ["barra", "a/b", "O slug deve conter apenas letras minúsculas, dígitos e hífens."],
  ])("recusa o slug %s (RN03)", async (_name, slug, message) => {
    const { errors } = await editorResolver({ ...VALUES, slug });
    expect(errors).toEqual({ slug: { type: "validation", message } });
  });

  it("recusa um slug com mais de 80 caracteres e aceita exatamente 80", async () => {
    expect((await editorResolver({ ...VALUES, slug: "a".repeat(81) })).errors.slug?.message).toMatch(/no máximo 80/);
    expect((await editorResolver({ ...VALUES, slug: "a".repeat(80) })).errors).toEqual({});
  });

  it("recusa um estado desconhecido", async () => {
    const { errors } = await editorResolver({ ...VALUES, status: /** @type {any} */ ("ARCHIVED") });
    expect(errors.status?.message).toBe("O estado deve ser Rascunho ou Publicado.");
  });

  it("recusa um corpo que não é texto", async () => {
    expect(Object.keys((await editorResolver({ ...VALUES, body: /** @type {any} */ (null) })).errors)).toEqual(["body"]);
  });

  it("junta os erros de vários campos, um por campo", async () => {
    const { values, errors } = await editorResolver({ title: "", slug: "Ruim Demais!", status: /** @type {any} */ ("X"), body: "ok" });
    expect(values).toEqual({});
    expect(Object.keys(errors).sort()).toEqual(["slug", "status", "title"]);
  });

  it("só valida os campos do formulário", () => {
    expect(Object.keys(editorSchema.shape).sort()).toEqual([...EDITOR_FIELDS].sort());
  });
});

describe("valuesEqual", () => {
  it("compara os quatro campos", () => {
    expect(valuesEqual(VALUES, { ...VALUES })).toBe(true);
    for (const change of [{ title: "x" }, { slug: "x" }, { body: "x" }, { status: /** @type {const} */ ("DRAFT") }]) {
      expect(valuesEqual(VALUES, { ...VALUES, ...change })).toBe(false);
    }
  });
});

describe("sem navegador (renderização no servidor)", () => {
  it("o rascunho local não lança e fica ausente", () => {
    expect(typeof window).toBe("undefined");
    const values = VALUES;
    expect(readDraft("vitrine:rascunho:u1:c1")).toBeNull();
    expect(writeDraft("vitrine:rascunho:u1:c1", { values, baseVersion: null })).toBeNull();
    expect(clearAllDrafts()).toBe(0);
  });
});
