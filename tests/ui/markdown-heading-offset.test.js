// P-032 (M26; RN35): `headingOffset` do MarkdownRenderer (os títulos do texto da página inicial começam em h2) e a
// folha do KaTeX carregada só quando o texto tem fórmula. O deslocamento é só da renderização: o pipeline não muda.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer, hasMath } from "@/components/markdown/MarkdownRenderer";

const ALL = "# um\n\n## dois\n\n### três\n\n#### quatro\n\n##### cinco\n\n###### seis";

/** @param {string} markdown @param {number} [headingOffset] */
const headings = (markdown, headingOffset) =>
  [...renderToStaticMarkup(<MarkdownRenderer markdown={markdown} headingOffset={headingOffset} />).matchAll(/<(h[1-6])[^>]*>([^<]*)<\/h[1-6]>/g)].map(([, tag, text]) => `${tag}:${text}`);

describe("headingOffset", () => {
  it("o padrão (0, ou omitido) não desloca: # é h1", () => {
    const expected = ["h1:um", "h2:dois", "h3:três", "h4:quatro", "h5:cinco", "h6:seis"];
    expect(headings(ALL)).toEqual(expected);
    expect(headings(ALL, 0)).toEqual(expected);
  });

  it("com 1: h1 vira h2 ... h5 vira h6, e h6 fica h6", () => {
    expect(headings(ALL, 1)).toEqual(["h2:um", "h3:dois", "h4:três", "h5:quatro", "h6:cinco", "h6:seis"]);
  });

  it("nenhum h1 sai com deslocamento 1 (o nome do espaço é o h1 da página)", () => {
    expect(renderToStaticMarkup(<MarkdownRenderer markdown={"# Só um título"} headingOffset={1} />)).not.toContain("<h1");
  });

  it("um valor fora da faixa ou não inteiro é limitado (nunca gera uma tag inexistente)", () => {
    expect(headings("# x", 9)).toEqual(["h6:x"]);
    expect(headings("# x", -3)).toEqual(["h1:x"]);
    expect(headings("# x", 1.5)).toEqual(["h1:x"]);
    expect(headings("# x", /** @type {any} */ ("2"))).toEqual(["h1:x"]);
  });

  it("mantém o conteúdo do título (link) e o resto do componente (tabelas) intactos", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer markdown={"# [a](https://exemplo.test)\n\n| a |\n|---|\n| b |"} headingOffset={1} />);
    expect(html).toMatch(/<h2><a href="https:\/\/exemplo\.test">a<\/a><\/h2>/);
    expect(html).toContain('class="vitrine-markdown-table"');
  });

  it("o texto de um título é escapado, também deslocado", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer markdown={"# <img src=x onerror=alert(1)>"} headingOffset={1} />);
    expect(html).toContain("<h2>&lt;img src=x onerror=alert(1)&gt;</h2>");
  });
});

describe("hasMath: a folha do KaTeX só com fórmula", () => {
  it("$ (em linha ou em bloco) e o bloco math contam", () => {
    expect(hasMath("A fórmula $x^2$.")).toBe(true);
    expect(hasMath("$$\nx\n$$")).toBe(true);
    expect(hasMath("```math\nx\n```")).toBe(true);
    expect(hasMath("~~~ math\nx\n~~~")).toBe(true);
  });

  it("um texto simples não conta", () => {
    expect(hasMath("")).toBe(false);
    expect(hasMath("# Título\n\nTexto **simples** com `código` e [link](https://exemplo.test).")).toBe(false);
    expect(hasMath("```js\nconst a = 1;\n```")).toBe(false);
    expect(hasMath("matemática sem fórmulas")).toBe(false);
  });
});
