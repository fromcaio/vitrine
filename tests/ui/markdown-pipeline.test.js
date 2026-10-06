// O módulo do pipeline do Markdown, em ambiente `node` (sem jsdom, sem React, sem CSS): é o que o
// Core carrega em um `worker_threads` para validar, na gravação, que o texto renderiza dentro do
// orçamento de tempo (ADR-033; A-021). A fonte é única: o MarkdownRenderer importa daqui.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../src/components/markdown");
const read = (/** @type {string} */ name) => fs.readFileSync(path.join(DIR, name), "utf8");
const importsOf = (/** @type {string} */ source) => [...source.matchAll(/^import\s+(?:[^"']*\sfrom\s+)?["']([^"']+)["']/gm)].map(([, name]) => name);

describe("markdown-pipeline.js", () => {
  it("roda em ambiente node, sem DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("carrega em ambiente node e traz os cinco itens do pipeline", async () => {
    const pipeline = await import("@/components/markdown/markdown-pipeline");
    expect(pipeline.REMARK_PLUGINS).toHaveLength(2);
    expect(pipeline.REHYPE_PLUGINS).toHaveLength(3);
    expect(pipeline.KATEX_OPTIONS).toMatchObject({ trust: false, maxSize: 30, maxExpand: 1000, strict: "ignore" });
    expect(Object.keys(pipeline.HIGHLIGHT_LANGUAGES)).toEqual(expect.arrayContaining(["latex", "matlab", "julia", "haskell", "fortran", "javascript", "python"]));
    expect(pipeline.REMARK_REHYPE_OPTIONS.footnoteLabel).toBe("Notas de rodapé");
    expect(pipeline.rehypeMathErrors).toBeTypeOf("function");
  });

  it("os plugins são os da especificação, na ordem: GFM e matemática; KaTeX, rótulo de erro e realce", async () => {
    const { default: remarkGfm } = await import("remark-gfm");
    const { default: remarkMath } = await import("remark-math");
    const { default: rehypeKatex } = await import("rehype-katex");
    const { default: rehypeHighlight } = await import("rehype-highlight");
    const pipeline = await import("@/components/markdown/markdown-pipeline");
    expect(pipeline.REMARK_PLUGINS).toEqual([remarkGfm, remarkMath]);
    const [katex, errors, highlight] = pipeline.REHYPE_PLUGINS;
    expect(katex).toEqual([rehypeKatex, pipeline.KATEX_OPTIONS]);
    expect(errors).toBe(pipeline.rehypeMathErrors);
    expect(highlight[0]).toBe(rehypeHighlight);
    expect(highlight[1].languages).toBe(pipeline.HIGHLIGHT_LANGUAGES);
  });

  it("as opções são imutáveis (a configuração de segurança do KaTeX e as linguagens)", async () => {
    const pipeline = await import("@/components/markdown/markdown-pipeline");
    expect(Object.isFrozen(pipeline.KATEX_OPTIONS)).toBe(true);
    expect(Object.isFrozen(pipeline.HIGHLIGHT_LANGUAGES)).toBe(true);
  });

  it("não importa React nem CSS (carrega em um worker_threads do Node)", () => {
    const imports = importsOf(read("markdown-pipeline.js"));
    expect(imports.sort()).toEqual(
      [
        "highlight.js/lib/languages/fortran",
        "highlight.js/lib/languages/haskell",
        "highlight.js/lib/languages/julia",
        "highlight.js/lib/languages/latex",
        "highlight.js/lib/languages/matlab",
        "lowlight",
        "rehype-highlight",
        "rehype-katex",
        "remark-gfm",
        "remark-math",
      ].sort(),
    );
    expect(imports.some((name) => /react|\.css$/.test(name))).toBe(false);
    expect(read("markdown-pipeline.js")).not.toMatch(/["']use client["']|return\s*\(?\s*<[A-Za-z]|createElement/);
  });

  it("o MarkdownRenderer importa o pipeline dali, sem repetir os plugins (fonte única)", () => {
    const renderer = read("MarkdownRenderer.js");
    expect(importsOf(renderer)).toContain("./markdown-pipeline");
    for (const library of ["remark-gfm", "remark-math", "rehype-katex", "rehype-highlight", "lowlight"]) {
      expect(importsOf(renderer), library).not.toContain(library);
    }
    expect(renderer).not.toMatch(/function rehypeMathErrors|const KATEX_OPTIONS|const REMARK_PLUGINS|const REHYPE_PLUGINS/);
  });

  it("o MarkdownRenderer continua reexportando KATEX_OPTIONS e HIGHLIGHT_LANGUAGES", () => {
    const renderer = read("MarkdownRenderer.js");
    expect(renderer).toMatch(/export \{ HIGHLIGHT_LANGUAGES, KATEX_OPTIONS \};/);
  });
});
