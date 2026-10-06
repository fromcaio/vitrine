// O worker valida o pipeline COMPLETO do renderizador (A-022, item 5; ADR-033): as mutações do Arquiteto que
// tiravam do worker os plugins do remark ou do rehype não derrubavam nenhum teste, porque as entradas hostis
// eram caras "em qualquer pipeline" e a recusa dependia da máquina. Aqui a prova não depende dela:
//  1. ESTRUTURA: o processador do worker (`createProcessor`) é, junta por junta, o `remark-parse`, os plugins do
//     remark, o `remark-rehype` COM as opções e os plugins do rehype de `markdown-pipeline.js` (a fonte única);
//  2. COMPORTAMENTO: com um orçamento CURTO (300 ms), no worker REAL, entradas que só são caras COM o plugin
//     (`remark-math`, KaTeX, realce) são recusadas, enquanto o mesmo texto, sem o plugin, passa em dezenas de ms
//     (a diferença medida é de 10 a 250 vezes: nenhuma máquina razoável inverte o resultado).
import { afterAll, describe, expect, it } from "vitest";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  HIGHLIGHT_LANGUAGES,
  KATEX_OPTIONS,
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  REMARK_REHYPE_OPTIONS,
  rehypeMathErrors,
} from "@/components/markdown/markdown-pipeline";
import { checkRenderable, shutdownRenderWorker } from "@/lib/render-budget";
import { createProcessor } from "../../src/lib/render-processor.mjs";

afterAll(async () => {
  await shutdownRenderWorker();
});

/** Orçamento curto: as entradas abaixo levam de 0,6 a 3 s COM o plugin e menos de 0,1 s SEM ele. */
const SHORT_BUDGET_MS = 300;

/** Cada entrada de uma lista de plugins do unified vira `[função, ...parâmetros]`. */
const asAttacher = (entry) => (Array.isArray(entry) ? entry : [entry]);

describe("a estrutura: o processador do worker é o pipeline do MarkdownRenderer, junta por junta", () => {
  it("remark-parse, os plugins do remark, remark-rehype com as opções e os plugins do rehype, nesta ordem", () => {
    const expected = [
      [remarkParse],
      ...REMARK_PLUGINS.map(asAttacher),
      [remarkRehype, REMARK_REHYPE_OPTIONS],
      ...REHYPE_PLUGINS.map(asAttacher),
    ];

    expect(createProcessor().attachers).toEqual(expected);
  });

  it("cada grupo está presente: GFM e matemática; as opções do remark-rehype; KaTeX, erros de fórmula e realce", () => {
    const attachers = createProcessor().attachers;
    const names = attachers.map(([plugin]) => plugin.name);

    expect(names).toEqual(["remarkParse", "remarkGfm", "remarkMath", "remarkRehype", "rehypeKatex", "rehypeMathErrors", "rehypeHighlight"]);
    // As opções são as MESMAS (por identidade) das listas: nada copiado.
    expect(attachers.find(([plugin]) => plugin === remarkRehype)?.[1]).toBe(REMARK_REHYPE_OPTIONS);
    expect(attachers.find(([plugin]) => plugin.name === "rehypeKatex")?.[1]).toBe(KATEX_OPTIONS);
    expect(attachers.find(([plugin]) => plugin === rehypeMathErrors)).toBeDefined();
    expect(attachers.find(([plugin]) => plugin.name === "rehypeHighlight")?.[1]).toEqual({ languages: HIGHLIGHT_LANGUAGES });
  });

  it("os textos em português das notas de rodapé vêm das opções: o processador as aplica", async () => {
    const processor = createProcessor();
    const tree = await processor.run(processor.parse("Texto[^1].\n\n[^1]: A nota."));
    const html = JSON.stringify(tree);

    expect(html).toContain("Notas de rodapé");
    expect(html).toContain("Voltar à referência 1");
  });

  it("o processador renderiza matemática, GFM e código realçado (os plugins estão ativos)", async () => {
    const processor = createProcessor();
    const tree = JSON.stringify(
      await processor.run(processor.parse("~~a~~ e $x^2$\n\n| a |\n|---|\n| 1 |\n\n```js\nconst x = 1;\n```\n")),
    );

    expect(tree).toContain('"tagName":"del"'); // GFM: tachado
    expect(tree).toContain('"tagName":"table"'); // GFM: tabela
    expect(tree).toContain("katex"); // KaTeX
    expect(tree).toContain("hljs"); // realce
  });
});

describe("o comportamento: com um orçamento curto, a recusa DEPENDE do plugin (no worker real)", () => {
  /** Uma validação no worker real, com o orçamento curto, e o mesmo texto SEM o plugin, em processo. */
  async function bare(text, ...plugins) {
    const processor = unified().use(remarkParse).use(plugins.length > 0 ? plugins : []).use(remarkRehype);
    const start = performance.now();
    await processor.run(processor.parse(text));
    return performance.now() - start;
  }

  it("remark-math: `$a ` repetido é recusado COM o plugin (2,8 s medidos) e passa sem ele (11 ms)", async () => {
    const text = "$a ".repeat(Math.floor((64 * 1024) / 3));
    await checkRenderable("# aquece");

    const check = await checkRenderable(text, { budgetMs: SHORT_BUDGET_MS });

    expect(check).toMatchObject({ renderable: false, reason: "timeout" });
    expect(await bare(text)).toBeLessThan(SHORT_BUDGET_MS / 2); // sem o plugin, o mesmo texto é barato
  }, 30_000);

  it("KaTeX (e o resto do rehype): 2500 fórmulas são recusadas COM o plugin (2,4 s) e passam sem ele (66 ms)", async () => {
    const text = "$\\frac{a}{b}+\\sqrt{c}$ ".repeat(2500);
    await checkRenderable("# aquece");

    const check = await checkRenderable(text, { budgetMs: SHORT_BUDGET_MS });

    expect(check).toMatchObject({ renderable: false, reason: "timeout" });
    // Só o remark (a matemática reconhecida, sem o KaTeX): barato.
    expect(await bare(text, ...REMARK_PLUGINS)).toBeLessThan(SHORT_BUDGET_MS);
  }, 30_000);

  it("realce de código: um bloco enorme com a linguagem declarada é recusado COM o realce (cerca de 1,4 s)", async () => {
    const text = `\`\`\`python\n${"def f(x):\n    return [i * x for i in range(10) if i % 2 == 0]\n".repeat(8800)}\`\`\`\n`;
    await checkRenderable("# aquece");

    const check = await checkRenderable(text, { budgetMs: SHORT_BUDGET_MS });

    expect(check).toMatchObject({ renderable: false, reason: "timeout" });
  }, 30_000);

  it("o mesmo orçamento curto ACEITA texto comum: a recusa é do plugin sobre entrada hostil, não do orçamento", async () => {
    const check = await checkRenderable("# Título\n\nUm parágrafo com $x^2$, **negrito** e uma lista:\n\n- um\n- dois\n", {
      budgetMs: SHORT_BUDGET_MS,
    });

    expect(check.renderable).toBe(true);
  });
});
