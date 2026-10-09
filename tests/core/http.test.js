// Convenções HTTP da API: formato único de erro e tradução de DataError (Cap. 5 §5.10,
// Tabela `tab:dataerror`). Não usa a rede nem o Next.js: os utilitários recebem Request e
// devolvem Response padrão.
import "./env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataError } from "@/lib/db";
import { slugSchema } from "@/lib/validators";
import {
  ApiError,
  DATA_ERROR_MAP,
  DEFAULT_JSON_MAX_BYTES,
  contentJsonMaxBytes,
  imageBusy,
  isSameOrigin,
  mapDataError,
  noContent,
  ok,
  parse,
  readJson,
  renderBusy,
  toErrorResponse,
} from "@/app/api/_lib/http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapeamento de DataError para HTTP (tab:dataerror)", () => {
  // Uma linha por código de src/lib/db.js, como na tabela da documentação.
  it.each([
    ["NOT_FOUND", 404, "NOT_FOUND"],
    ["SLUG_CONFLICT", 409, "SLUG_CONFLICT"],
    ["PARENT_NOT_FOUND", 422, "INVALID_PARENT"],
    ["PARENT_NOT_COLLECTION", 422, "INVALID_PARENT"],
    ["CYCLE", 422, "CYCLE_DETECTED"],
    ["TYPE_HAS_CHILDREN", 422, "VALIDATION_ERROR"],
    ["AUTHOR_NOT_FOUND", 422, "VALIDATION_ERROR"],
    ["INVALID_INPUT", 422, "VALIDATION_ERROR"],
    ["OWNER_MISMATCH", 422, "INVALID_PARENT"],
    ["QUOTA_EXCEEDED", 422, "QUOTA_EXCEEDED"],
    ["VERSION_CONFLICT", 409, "VERSION_CONFLICT"],
    ["USER_HAS_CONTENT", 409, "USER_HAS_CONTENT"],
    ["USER_CONFLICT", 409, "USER_CONFLICT"],
    ["LAST_ADMIN", 409, "LAST_ADMIN"],
    ["BUSY", 503, "BUSY"],
  ])("%s → %i %s", async (dataCode, status, apiCode) => {
    const error = new DataError(/** @type {any} */ (dataCode), "Mensagem da regra de negócio.");

    const mapped = mapDataError(error);
    expect(mapped).toMatchObject({ status, code: apiCode });
    // OWNER_MISMATCH troca o texto: o pai de outro dono é indistinguível do pai inexistente (RN19).
    if (dataCode !== "OWNER_MISMATCH") expect(mapped.message).toBe("Mensagem da regra de negócio.");

    const response = toErrorResponse(error);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(apiCode);
  });

  it("cobre todos os códigos que db.js pode lançar", () => {
    expect(Object.keys(DATA_ERROR_MAP).sort()).toEqual(
      [
        "AUTHOR_NOT_FOUND",
        "BUSY",
        "CYCLE",
        "INVALID_INPUT",
        "LAST_ADMIN",
        "NOT_FOUND",
        "OWNER_MISMATCH",
        "PARENT_NOT_COLLECTION",
        "PARENT_NOT_FOUND",
        "QUOTA_EXCEEDED",
        "SLUG_CONFLICT",
        "TYPE_HAS_CHILDREN",
        "USER_CONFLICT",
        "USER_HAS_CONTENT",
        "VERSION_CONFLICT",
      ].sort(),
    );
  });

  it("monta `details` com o campo e o valor recusado", () => {
    expect(mapDataError(new DataError("NOT_FOUND", "x", { id: "abc" })).details).toEqual([{ field: "id", value: "abc" }]);
    expect(mapDataError(new DataError("PARENT_NOT_COLLECTION", "x", { parentId: "doc-1" })).details).toEqual([
      { field: "parentId", value: "doc-1" },
    ]);
    expect(mapDataError(new DataError("CYCLE", "x", { id: "a", parentId: "b" })).details).toEqual([
      { field: "parentId", value: "b", id: "a" },
    ]);
    expect(mapDataError(new DataError("SLUG_CONFLICT", "x")).details).toEqual([{ field: "slug" }]);
    expect(mapDataError(new DataError("INVALID_INPUT", "x", { field: "order" })).details).toEqual([{ field: "order" }]);
    expect(mapDataError(new DataError("INVALID_INPUT", "x")).details).toEqual([]);
  });

  it("TYPE_HAS_CHILDREN aponta o campo type", () => {
    expect(mapDataError(new DataError("TYPE_HAS_CHILDREN", "x", { id: "col-1" })).details).toEqual([
      { field: "type", id: "col-1" },
    ]);
  });

  it("reconhece um DataError pelo nome (módulo recarregado em desenvolvimento)", async () => {
    const lookalike = Object.assign(new Error("Conteúdo não encontrado."), { name: "DataError", code: "NOT_FOUND", details: {} });
    const response = toErrorResponse(lookalike);
    expect(response.status).toBe(404);
  });

  it("código de DataError desconhecido vira erro interno", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(new DataError(/** @type {any} */ ("NOVO_CODIGO"), "detalhe interno"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: [] },
    });
  });
});

describe("formato único de erro", () => {
  it("segue { error: { code, message, details } }", async () => {
    const response = toErrorResponse(
      new ApiError(409, "SLUG_CONFLICT", "Já existe um conteúdo com este slug no mesmo nível.", [
        { field: "slug", value: "introducao" },
      ]),
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "SLUG_CONFLICT",
        message: "Já existe um conteúdo com este slug no mesmo nível.",
        details: [{ field: "slug", value: "introducao" }],
      },
    });
  });

  it("erro não previsto: 500 com mensagem genérica, sem vazar detalhes, e registro no servidor", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = new Error("SQLITE_CANTOPEN: unable to open database file /data/vitrine.db");

    const response = toErrorResponse(internal);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: [] },
    });
    expect(text).not.toContain("SQLITE");
    expect(text).not.toContain("vitrine.db");
    expect(log).toHaveBeenCalledWith(expect.any(String), internal);
  });

  it.each([null, undefined, "texto", 42, { code: "NOT_FOUND" }])("valor lançado que não é erro (%s): 500", (thrown) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toErrorResponse(thrown).status).toBe(500);
  });

  it("erros 4xx não são registrados como falha do servidor", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    toErrorResponse(new DataError("NOT_FOUND", "x"));
    toErrorResponse(new ApiError(401, "UNAUTHENTICATED", "x"));
    expect(log).not.toHaveBeenCalled();
  });
});

describe("o registro do 503 BUSY (A-024): esperado sob carga, não é erro", () => {
  // As três origens do `BUSY`: a fila de validações de texto, as vagas de imagem e o DataError do Dados.
  const busyErrors = /** @type {const} */ ([
    ["fila de texto (renderBusy)", () => renderBusy(3)],
    ["vagas de imagem (imageBusy)", () => imageBusy(2)],
    ["DataError BUSY", () => new DataError("BUSY", "ocupado")],
  ]);

  it.each(busyErrors)("%s: 503 BUSY; uma linha em nível baixo, sem a pilha e sem console.error", async (_name, make) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = make();

    const response = toErrorResponse(error);

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("BUSY");
    expect(errorLog).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledTimes(1);
    const args = infoLog.mock.calls[0];
    expect(args).toHaveLength(1); // só o texto: o erro (com a pilha) não vai junto
    expect(String(args[0])).toContain("BUSY");
    // nem uma pilha dentro do texto: uma só linha, sem posição de arquivo
    expect(String(args[0])).not.toContain(String.fromCharCode(10));
    expect(String(args[0])).not.toContain(".js:");
  });

  it("o Retry-After do BUSY continua na resposta", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(toErrorResponse(renderBusy(3)).headers.get("retry-after")).toBe("3");
    expect(toErrorResponse(imageBusy(2)).headers.get("retry-after")).toBe("2");
  });

  it("os demais 5xx seguem em console.error com o erro (e a pilha): 500 interno, 503 de outro código, DataError desconhecido", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});
    const internal = new Error("falha interna");
    const unavailable = new ApiError(503, "INTERNAL_ERROR", "fora do ar");
    const unknown = new DataError("CODIGO_NOVO", "não mapeado");

    expect(toErrorResponse(internal).status).toBe(500);
    expect(toErrorResponse(unavailable).status).toBe(503);
    expect(toErrorResponse(unknown).status).toBe(500);

    expect(errorLog.mock.calls).toEqual([
      [expect.any(String), internal],
      [expect.any(String), unavailable],
      [expect.any(String), unknown],
    ]);
    expect(infoLog).not.toHaveBeenCalled();
  });
});

describe("respostas de sucesso", () => {
  it("envelope { data } sem cache", async () => {
    const response = ok({ id: "1" }, { status: 201, headers: { Location: "/api/contents/1" } });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBe("/api/contents/1");
    expect(await response.json()).toEqual({ data: { id: "1" } });
  });

  it("204 sem corpo", async () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

describe("leitura e validação da entrada", () => {
  const post = (body, contentType = "application/json") =>
    new Request("http://localhost:3000/api/contents", {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : {},
      body,
    });

  it("lê JSON válido", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(post('{"a":1}', "application/json; charset=utf-8"))).toEqual({ a: 1 });
  });

  it.each([
    ["JSON malformado", "{ title: ", "application/json"],
    ["corpo vazio", "", "application/json"],
    ["formulário", "title=x", "application/x-www-form-urlencoded"],
    ["texto puro", '{"a":1}', "text/plain"],
  ])("%s: 400", async (_label, body, contentType) => {
    await expect(readJson(post(body, contentType))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("entrada inválida: 422 VALIDATION_ERROR com o campo em details", () => {
    expect(() => parse(slugSchema, "Não é Slug")).toThrowError(
      expect.objectContaining({
        status: 422,
        code: "VALIDATION_ERROR",
        details: [{ field: "", message: "O slug deve conter apenas letras minúsculas, dígitos e hífens." }],
      }),
    );
    expect(parse(slugSchema, "e-slug")).toBe("e-slug");
  });
});

describe("verificação de origem das mutações (CSRF)", () => {
  const request = (headers) => new Request("http://localhost:3000/api/contents", { method: "POST", headers });

  it("aceita a origem do próprio site (host da requisição)", () => {
    expect(isSameOrigin(request({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "https://site.exemplo", "x-forwarded-host": "site.exemplo", host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("aceita a origem de BETTER_AUTH_URL mesmo atrás de proxy que troca o Host", () => {
    expect(isSameOrigin(request({ origin: process.env.BETTER_AUTH_URL, host: "vitrine:3000" }))).toBe(true);
  });

  it("recusa outra origem, origem opaca e requisição marcada como cross-site", () => {
    expect(isSameOrigin(request({ origin: "https://malicioso.test", host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "null", host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(request({ "sec-fetch-site": "cross-site", host: "localhost:3000" }))).toBe(false);
  });

  it("aceita cliente que não é navegador (sem Origin nem Sec-Fetch-Site)", () => {
    expect(isSameOrigin(request({ host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(request({ "sec-fetch-site": "same-origin", host: "localhost:3000" }))).toBe(true);
  });
});

describe("detalhes dos DataError do M15 e do M16 (ADR-029; RN18, RN19, RN25)", () => {
  it("VERSION_CONFLICT devolve a versão atual em details[0].value (RN18)", () => {
    const error = new DataError("VERSION_CONFLICT", "mudou", { id: "c1", currentVersion: "2026-10-04T12:00:00.000Z" });
    expect(mapDataError(error)).toEqual({
      status: 409,
      code: "VERSION_CONFLICT",
      message: "mudou",
      details: [{ field: "version", value: "2026-10-04T12:00:00.000Z" }],
    });
  });

  it("QUOTA_EXCEEDED aponta a cota estourada (body ou contents) e os números", () => {
    expect(mapDataError(new DataError("QUOTA_EXCEEDED", "x", { quota: "body", bytes: 300, max: 256 })).details).toEqual([
      { field: "body", bytes: 300, max: 256 },
    ]);
    expect(mapDataError(new DataError("QUOTA_EXCEEDED", "x", { quota: "contents", total: 500, max: 500 })).details).toEqual([
      { field: "contents", total: 500, max: 500 },
    ]);
  });

  it("USER_CONFLICT aponta email ou handle", () => {
    expect(mapDataError(new DataError("USER_CONFLICT", "x", { field: "handle" })).details).toEqual([{ field: "handle" }]);
    expect(mapDataError(new DataError("USER_CONFLICT", "x", { field: "email" })).details).toEqual([{ field: "email" }]);
  });

  it("OWNER_MISMATCH é indistinguível do pai inexistente: mesmo código, mesma mensagem e mesmo campo (RN19)", () => {
    const foreign = mapDataError(new DataError("OWNER_MISMATCH", "O pai pertence a outro dono.", { parentId: "p1" }));
    const missing = mapDataError(new DataError("PARENT_NOT_FOUND", "O conteúdo pai não existe.", { parentId: "p1" }));
    expect(foreign).toEqual(missing);
    expect(JSON.stringify(foreign)).not.toContain("outro dono");
  });

  it("LAST_ADMIN, USER_HAS_CONTENT e BUSY respondem 409, 409 e 503", () => {
    expect(mapDataError(new DataError("LAST_ADMIN", "x", { userId: "u1" })).status).toBe(409);
    expect(mapDataError(new DataError("USER_HAS_CONTENT", "x", { owned: 3 }))).toMatchObject({ status: 409, details: [{ owned: 3 }] });
    expect(mapDataError(new DataError("BUSY", "x"))).toMatchObject({ status: 503, code: "BUSY", details: [] });
  });

  it("ApiError leva cabeçalhos próprios à resposta (Retry-After do 429)", async () => {
    const response = toErrorResponse(new ApiError(429, "RATE_LIMITED", "Muitas requisições.", [], { "Retry-After": "12" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("RATE_LIMITED");
  });
});

describe("leitura do corpo com limite (RN25; 413 antes de ler)", () => {
  /** @param {BodyInit | null} body @param {Record<string, string>} [headers] */
  const post = (body, headers = {}) =>
    new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      // @ts-expect-error necessário no Node para corpo em fluxo
      duplex: "half",
    });

  it("o limite do conteúdo é duas vezes a cota mais 64 KiB (ADR-029, item 9)", () => {
    expect(contentJsonMaxBytes({ maxBodyBytes: 262_144 })).toBe(2 * 262_144 + 65_536);
    expect(DEFAULT_JSON_MAX_BYTES).toBe(65_536);
  });

  it("aceita um corpo dentro do limite", async () => {
    expect(await readJson(post(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });

  it("recusa com 413 quando o Content-Length declara mais que o limite, sem ler o corpo", async () => {
    const request = post("x".repeat(100), { "content-length": "100" });
    const error = await readJson(request, { maxBytes: 50 }).catch((e) => e);
    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(error.details).toEqual([{ field: "body", max: 50 }]);
  });

  it("com o Content-Length acima do limite, nenhum pedaço do fluxo é puxado (recusa ANTES de ler)", async () => {
    let pulled = 0;
    // highWaterMark 0: o fluxo só é puxado por quem lê
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(new TextEncoder().encode("x".repeat(40)));
        },
      },
      { highWaterMark: 0 },
    );
    const error = await readJson(post(stream, { "content-length": "999999" }), { maxBytes: 100 }).catch((e) => e);

    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(pulled).toBe(0);
  });

  it("sem o Content-Length, o fluxo é puxado até passar do limite e para (não lê o resto)", async () => {
    let pulled = 0;
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(new TextEncoder().encode("x".repeat(40)));
        },
      },
      { highWaterMark: 0 },
    );
    const error = await readJson(post(stream), { maxBytes: 100 }).catch((e) => e);

    expect(error).toMatchObject({ status: 413 });
    expect(pulled).toBeGreaterThanOrEqual(3); // 40 + 40 + 40 > 100
    expect(pulled).toBeLessThan(6);
  });

  it("recusa com 413 o corpo em fluxo sem Content-Length que passa do limite, cortando a leitura", async () => {
    let pulled = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode("x".repeat(40)));
        if (pulled > 1000) controller.close();
      },
    });
    const error = await readJson(post(stream), { maxBytes: 100 }).catch((e) => e);
    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    // parou perto do limite: não puxou o fluxo inteiro
    expect(pulled).toBeLessThan(10);
  });

  it("mede em bytes UTF-8, e não em caracteres", async () => {
    const accented = JSON.stringify({ t: "ç".repeat(40) }); // ~ 100 bytes, 51 caracteres
    const error = await readJson(post(accented), { maxBytes: 60 }).catch((e) => e);
    expect(error).toMatchObject({ status: 413 });
  });

  it("o tipo de conteúdo continua sendo conferido antes: 400, não 413", async () => {
    const request = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x".repeat(500),
    });
    expect(await readJson(request, { maxBytes: 10 }).catch((e) => e)).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("corpo vazio ou JSON malformado respondem 400", async () => {
    expect(await readJson(post(null)).catch((e) => e)).toMatchObject({ status: 400 });
    expect(await readJson(post("{ a: ")).catch((e) => e)).toMatchObject({ status: 400 });
  });
});
