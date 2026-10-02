// O Zod 4 sonda `new Function("")` ao criar esquemas de objeto (compilação JIT). Sob a CSP do site
// (ADR-022: sem 'unsafe-eval'), o navegador registra isso como violação, mesmo com o erro
// capturado. O editor configura o Zod com `jitless` antes de qualquer esquema existir
// (zod-config.js): este teste prova que a sonda não acontece. Foi achado na verificação do M09,
// sobre o build de produção, que a CSP só existe ali.
//
// Fica em um arquivo só dele de propósito: o Zod é um pacote externo, carregado uma vez por
// processo, e a sonda é guardada em cache; cada arquivo de teste roda em um processo novo, de modo
// que aqui o schema.js é o primeiro a carregar o Zod.
import { describe, expect, it } from "vitest";

/** @type {string[][]} */
const constructed = [];
const OriginalFunction = globalThis.Function;
// Registra toda construção de função a partir de texto (`new Function(...)`, `Function(...)`).
globalThis.Function = new Proxy(OriginalFunction, {
  construct(target, args, newTarget) {
    constructed.push(args.map(String));
    return Reflect.construct(target, args, newTarget);
  },
  apply(target, thisArg, args) {
    constructed.push(args.map(String));
    return Reflect.apply(target, thisArg, args);
  },
});

/** Importa o esquema do editor (e, com ele, o Zod) e usa o resolvedor, com entradas válidas e inválidas. */
async function loadAndUseEditorSchema() {
  const { editorResolver, editorSchema } = await import("@/components/editor/schema");
  await editorResolver({ title: "Aula", slug: "aula", body: "x", status: "DRAFT" });
  await editorResolver({ title: "", slug: "Ruim!", body: /** @type {any} */ (1), status: /** @type {any} */ ("X") });
  return editorSchema;
}

describe("Zod sem JIT (CSP: sem eval)", () => {
  it("o instrumento enxerga uma construção de função a partir de texto", () => {
    const before = constructed.length;
    new Function("return 1");
    expect(constructed.length).toBe(before + 1);
    expect(constructed.at(-1)).toEqual(["return 1"]);
  });

  it("carregar e usar o esquema do editor não sonda new Function(\"\")", async () => {
    try {
      await loadAndUseEditorSchema();
    } finally {
      globalThis.Function = OriginalFunction;
    }
    // A sonda do Zod é `new F("")`: um construtor com o corpo vazio.
    expect(constructed.filter((args) => args.length === 1 && args[0] === "")).toEqual([]);
  });

  it("a configuração jitless do Zod está ligada, e o esquema funciona sem o atalho compilado", async () => {
    const z = await import("zod");
    expect(z.config().jitless).toBe(true);
    const schema = await loadAndUseEditorSchema();
    expect(schema.safeParse({ title: "Aula", slug: "aula", body: "", status: "PUBLISHED" }).success).toBe(true);
    expect(schema.safeParse({ title: "", slug: "aula", body: "", status: "PUBLISHED" }).success).toBe(false);
  });
});
