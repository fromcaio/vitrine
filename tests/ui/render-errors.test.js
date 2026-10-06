// @vitest-environment jsdom
// As recusas novas da gravação de texto (ADR-033; A-021): 422 CONTENT_TOO_COMPLEX e 503 BUSY. A
// mensagem é exata, fica junto do campo do texto, e o texto digitado nunca se perde. A integração com
// o servidor real depende da A-021: aqui, `fetch` e resultados simulados, no formato do contrato.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretFailure } from "@/components/admin/appearance-model";
import { interpretResponse, saveContent } from "@/components/editor/content-client";
import { TOO_COMPLEX_MESSAGE, busyMessage } from "@/components/ui/render-errors";
import { RendererStub, body, renderEditor, send, type } from "./editor-helpers";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({ MarkdownRenderer: RendererStub }));

const KEY = "vitrine:rascunho:u1:c1";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** @param {number} status @param {string} code @param {unknown[]} [details] @param {Record<string, string>} [headers] */
const reply = (status, code, details = [], headers = {}) =>
  new Response(JSON.stringify({ error: { code, message: "mensagem do servidor", details } }), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("as mensagens", () => {
  it("a do CONTENT_TOO_COMPLEX é exatamente a do contrato", () => {
    expect(TOO_COMPLEX_MESSAGE).toBe("O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.");
  });

  it("a do BUSY cita o Retry-After, no singular e no plural, e tem uma versão sem o tempo", () => {
    expect(busyMessage("12")).toBe("O servidor está ocupado agora. Tente de novo em 12 segundos.");
    expect(busyMessage("1")).toBe("O servidor está ocupado agora. Tente de novo em 1 segundo.");
    expect(busyMessage(null)).toBe("O servidor está ocupado agora. Tente de novo em instantes.");
    expect(busyMessage("abc")).toBe("O servidor está ocupado agora. Tente de novo em instantes.");
    expect(busyMessage("0")).toBe("O servidor está ocupado agora. Tente de novo em instantes.");
  });
});

describe("cliente do editor (content-client)", () => {
  it("422 CONTENT_TOO_COMPLEX: o erro é do campo do texto, com a mensagem exata", async () => {
    const result = await interpretResponse(reply(422, "CONTENT_TOO_COMPLEX", [{ field: "body", message: "x" }]));
    expect(result).toMatchObject({ ok: false, kind: "too-complex", fieldErrors: [{ field: "body", message: TOO_COMPLEX_MESSAGE }] });
  });

  it("não repassa o texto do servidor (só a mensagem própria)", async () => {
    const result = await interpretResponse(reply(422, "CONTENT_TOO_COMPLEX", [{ field: "body", message: "<script>x</script>" }]));
    expect(JSON.stringify(result)).not.toMatch(/script/);
  });

  it("503 BUSY: a mensagem leva o Retry-After", async () => {
    const result = await interpretResponse(reply(503, "BUSY", [], { "Retry-After": "7" }));
    expect(result).toMatchObject({ ok: false, kind: "busy", message: "O servidor está ocupado agora. Tente de novo em 7 segundos." });
  });

  it("503 BUSY sem o cabeçalho: sem inventar o tempo", async () => {
    const result = await interpretResponse(reply(503, "BUSY"));
    expect(result).toMatchObject({ kind: "busy", message: "O servidor está ocupado agora. Tente de novo em instantes." });
  });

  it("um 503 de outro tipo continua sendo erro do servidor", async () => {
    expect(await interpretResponse(reply(503, "OUTRO"))).toMatchObject({ kind: "server" });
  });

  it("saveContent repassa o resultado do 422", async () => {
    const result = await saveContent({ id: "c1", values: { title: "t", slug: "t", body: "x", status: "PUBLISHED" }, version: "v1", fetchImpl: vi.fn(async () => reply(422, "CONTENT_TOO_COMPLEX", [{ field: "body" }])) });
    expect(result).toMatchObject({ ok: false, kind: "too-complex" });
  });
});

describe("Editor: o texto não se perde", () => {
  const BIG = "texto que o servidor recusou por ser complexo demais";
  const tooComplex = () => ({ ok: /** @type {const} */ (false), kind: "too-complex", message: "O texto não foi enviado.", fieldErrors: [{ field: "body", message: TOO_COMPLEX_MESSAGE }] });

  it("mostra a mensagem junto do campo do texto e mantém o que foi digitado", async () => {
    renderEditor({ onSubmit: vi.fn(async () => tooComplex()) });
    type(body(), BIG);
    fireEvent.click(send());
    await screen.findByText(TOO_COMPLEX_MESSAGE);
    expect(body().value).toBe(BIG);
    expect(body().getAttribute("aria-invalid")).toBe("true");
    expect(body().getAttribute("aria-describedby")).toMatch(/texto-error/);
  });

  it("guarda o texto no navegador (rascunho local), para sobreviver a um recarregamento", async () => {
    renderEditor({ onSubmit: vi.fn(async () => tooComplex()) });
    type(body(), BIG);
    fireEvent.click(send());
    await screen.findByText(TOO_COMPLEX_MESSAGE);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY) ?? "null")?.values.body).toBe(BIG));
    expect(screen.getByText(/O texto foi salvo neste navegador/)).toBeTruthy();
  });

  it("depois de simplificar o texto, o envio seguinte dá certo e apaga a cópia local", async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce(tooComplex()).mockResolvedValueOnce({ ok: true, id: "c1", version: "v2" });
    renderEditor({ onSubmit });
    type(body(), BIG);
    fireEvent.click(send());
    await screen.findByText(TOO_COMPLEX_MESSAGE);
    type(body(), "texto simples");
    fireEvent.click(send());
    await screen.findByText(/Nova versão enviada/);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(TOO_COMPLEX_MESSAGE)).toBeNull();
  });

  it("503 BUSY: a mensagem com o tempo aparece e o texto fica guardado", async () => {
    renderEditor({ onSubmit: vi.fn(async () => ({ ok: false, kind: "busy", message: busyMessage("5"), fieldErrors: [] })) });
    type(body(), BIG);
    fireEvent.click(send());
    await screen.findByText(/O servidor está ocupado agora\. Tente de novo em 5 segundos\./);
    expect(body().value).toBe(BIG);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")?.values.body).toBe(BIG);
  });
});

describe("formulário do portal (appearance-model)", () => {
  it("422 CONTENT_TOO_COMPLEX: a mensagem exata vai para o campo homeBody", async () => {
    const failure = await interpretFailure(reply(422, "CONTENT_TOO_COMPLEX", [{ field: "homeBody", message: "x" }]), "configuration");
    expect(failure).toEqual({ fields: { homeBody: TOO_COMPLEX_MESSAGE }, general: "" });
  });

  it("503 BUSY: a mensagem geral com o Retry-After", async () => {
    const failure = await interpretFailure(reply(503, "BUSY", [], { "Retry-After": "3" }), "configuration");
    expect(failure).toEqual({ fields: {}, general: "O servidor está ocupado agora. Tente de novo em 3 segundos." });
  });
});
