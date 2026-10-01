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
  isSameOrigin,
  mapDataError,
  noContent,
  ok,
  parse,
  readJson,
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
  ])("%s → %i %s", async (dataCode, status, apiCode) => {
    const error = new DataError(/** @type {any} */ (dataCode), "Mensagem da regra de negócio.");

    expect(mapDataError(error)).toMatchObject({ status, code: apiCode, message: "Mensagem da regra de negócio." });

    const response = toErrorResponse(error);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(apiCode);
  });

  it("cobre todos os códigos que db.js pode lançar", () => {
    expect(Object.keys(DATA_ERROR_MAP).sort()).toEqual(
      [
        "AUTHOR_NOT_FOUND",
        "CYCLE",
        "INVALID_INPUT",
        "NOT_FOUND",
        "PARENT_NOT_COLLECTION",
        "PARENT_NOT_FOUND",
        "SLUG_CONFLICT",
        "TYPE_HAS_CHILDREN",
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
