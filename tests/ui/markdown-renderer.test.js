// Renderização no servidor do MarkdownRenderer (M08; RF09 a RF11, RN11, RNF03): CT15 (fórmulas),
// CT16 (HTML bruto e XSS, ampliado para autores não confiáveis, ADR-023), CT17 (GFM) e CT18
// (realce de código). O componente é renderizado de verdade, com react-dom/server.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { common } from "lowlight";
import { HIGHLIGHT_LANGUAGES, KATEX_OPTIONS, MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

const COMPONENT_DIR = path.resolve(import.meta.dirname, "../../src/components/markdown");

/** @param {unknown} markdown */
function render(markdown) {
  return renderToStaticMarkup(<MarkdownRenderer markdown={/** @type {any} */ (markdown)} />);
}

/**
 * Marcas de abertura do HTML renderizado. O serializador do React sempre põe os valores entre
 * aspas duplas e escapa <, > e " dentro deles, de modo que a expressão abaixo não se confunde
 * com texto: um `<script>` escrito pelo autor aparece como `&lt;script&gt;` e não casa.
 * @param {string} html
 * @returns {{ name: string, attributes: Record<string, string> }[]}
 */
function openingTags(html) {
  return [...html.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s"=<>/]+(?:="[^"]*")?)*)\s*\/?>/g)].map(([, name, rest]) => ({
    name: name.toLowerCase(),
    attributes: Object.fromEntries(
      [...rest.matchAll(/\s+([^\s"=<>/]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key.toLowerCase(), value ?? ""]),
    ),
  }));
}

/** Elementos que executam código, carregam recursos ativos ou enviam dados. */
const FORBIDDEN_ELEMENTS = ["script", "iframe", "object", "embed", "style", "link", "meta", "base", "form", "button", "textarea", "select", "svg:script", "frame", "frameset", "applet", "audio", "video", "source"];
const URL_ATTRIBUTES = ["href", "src", "srcset", "action", "formaction", "xlink:href", "poster", "cite", "data", "ping"];

/**
 * Afirma que o HTML não tem elemento proibido, manipulador de evento nem URL com esquema fora
 * de http, https e mailto.
 * @param {string} html
 */
function expectSafe(html) {
  for (const { name, attributes } of openingTags(html)) {
    expect(FORBIDDEN_ELEMENTS, `elemento <${name}>`).not.toContain(name);
    for (const [key, value] of Object.entries(attributes)) {
      expect(key.startsWith("on"), `atributo ${key} em <${name}>`).toBe(false);
      if (URL_ATTRIBUTES.includes(key)) {
        const scheme = /^[\s\u0000-\u001f]*([a-z][a-z0-9+.-]*)\s*:/i.exec(value.replaceAll(/&#x?[0-9a-f]+;|&[a-z]+;/gi, "?"))?.[1];
        expect(["http", "https", "mailto", undefined], `${key}="${value}" em <${name}>`).toContain(scheme?.toLowerCase());
      }
    }
    // A única entrada de formulário admitida é a caixa das listas de tarefas, só leitura.
    if (name === "input") expect(attributes).toMatchObject({ type: "checkbox", disabled: "" });
  }
}

// ------------------------------------------------------------------------------------------
describe("MarkdownRenderer: Markdown básico e contrato do componente", () => {
  it("renderiza títulos, ênfase, listas, citação e régua", () => {
    const html = render("# Título\n\n## Seção\n\nTexto com **negrito** e *itálico*.\n\n- um\n- dois\n\n1. primeiro\n\n> citação\n\n---");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<h2>Seção</h2>");
    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<em>itálico</em>");
    expect(html).toMatch(/<ul>\s*<li>um<\/li>\s*<li>dois<\/li>\s*<\/ul>/);
    expect(html).toMatch(/<ol>\s*<li>primeiro<\/li>\s*<\/ol>/);
    expect(html).toMatch(/<blockquote>\s*<p>citação<\/p>\s*<\/blockquote>/);
    expect(html).toContain("<hr/>");
  });

  it("envolve o conteúdo no contêiner de tipografia e aceita classes de leiaute", () => {
    expect(render("oi")).toBe('<div class="vitrine-markdown"><p>oi</p></div>');
    expect(renderToStaticMarkup(<MarkdownRenderer markdown="oi" className="max-w-3xl" />)).toBe(
      '<div class="vitrine-markdown max-w-3xl"><p>oi</p></div>',
    );
  });

  it.each([[""], [null], [undefined], [42], [{}], [["# x"]]])("rende um bloco vazio para %j, sem lançar", (value) => {
    expect(render(value)).toBe('<div class="vitrine-markdown"></div>');
  });

  it("mantém links http, https, mailto, relativos e âncoras", () => {
    const html = render("[a](https://exemplo.test/x?y=1#z) [b](http://exemplo.test) [c](mailto:ana@exemplo.test) [d](/ana/algebra) [e](../outro) [f](#secao) [g](//exemplo.test/x)");
    const hrefs = openingTags(html).filter((tag) => tag.name === "a").map((tag) => tag.attributes.href);
    expect(hrefs).toEqual([
      "https://exemplo.test/x?y=1#z",
      "http://exemplo.test",
      "mailto:ana@exemplo.test",
      "/ana/algebra",
      "../outro",
      "#secao",
      "//exemplo.test/x",
    ]);
  });

  it("carrega as imagens sob demanda, com texto alternativo e sem enviar o referenciador", () => {
    const html = render('![Gráfico da função](https://exemplo.test/grafico.png "Figura 1")');
    expect(openingTags(html).find((tag) => tag.name === "img")?.attributes).toEqual({
      src: "https://exemplo.test/grafico.png",
      alt: "Gráfico da função",
      title: "Figura 1",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
    });
  });

  it("é um componente compartilhado: sem \"use client\" e sem depender de banco, rota ou tema", () => {
    const source = fs.readFileSync(path.join(COMPONENT_DIR, "MarkdownRenderer.js"), "utf8");
    expect(source).not.toMatch(/^\s*["']use client["']/m);
    const imports = [...source.matchAll(/^import\s+(?:[^"']*\sfrom\s+)?["']([^"']+)["']/gm)].map(([, name]) => name);
    // O pipeline (plugins, KaTeX e realce) vem de markdown-pipeline.js, a fonte única (ADR-033): o
    // renderizador só importa o React, o módulo do pipeline e as folhas de estilo.
    expect(imports.sort()).toEqual(["./markdown-pipeline", "./markdown.css", "katex/dist/katex.min.css", "react-markdown"].sort());
  });

  it("importa a folha do KaTeX uma vez, do pacote instalado, e nunca de uma CDN", () => {
    const source = fs.readFileSync(path.join(COMPONENT_DIR, "MarkdownRenderer.js"), "utf8");
    expect(source.match(/katex[^"'\n]*\.css/g)).toEqual(["katex/dist/katex.min.css"]);
    expect(source).not.toMatch(/https?:\/\//);
    expect(fs.readFileSync(path.join(COMPONENT_DIR, "markdown.css"), "utf8")).not.toMatch(/@import|url\(/);
  });
});

// ------------------------------------------------------------------------------------------
describe("CT15: fórmulas em linha e em bloco são renderizadas pelo KaTeX (RF09)", () => {
  it("renderiza a fórmula em linha dentro do parágrafo", () => {
    const html = render("A identidade de Euler, $e^{i\\pi} + 1 = 0$, une cinco constantes.");
    expect(html).toMatch(/^<div class="vitrine-markdown"><p>A identidade de Euler, <span class="katex">/);
    expect(html).not.toContain("katex-display");
    expect(html).toContain('<annotation encoding="application/x-tex">e^{i\\pi} + 1 = 0</annotation>');
    expect(html).toContain("une cinco constantes.</p>");
    // O texto-fonte só aparece na anotação do MathML: os cifrões foram consumidos.
    expect(html).not.toContain("$");
  });

  it("renderiza a fórmula em bloco como bloco", () => {
    const html = render("Antes.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\nDepois.");
    expect(html).toContain('<span class="katex-display"><span class="katex">');
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain("<p>Antes.</p>");
    expect(html).toContain("<p>Depois.</p>");
    expect(html).toContain("mfrac");
  });

  it("aceita o bloco cercado ```math como fórmula em bloco", () => {
    const html = render("```math\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}\n```");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("<pre");
  });

  it("entrega MathML para leitores de tela e esconde deles a versão visual", () => {
    const html = render("$x^2$");
    expect(html).toContain('<span class="katex-mathml"><math');
    expect(html).toContain('<span class="katex-html" aria-hidden="true">');
  });

  it("mostra a fórmula inválida como texto, com rótulo visível, sem derrubar a página", () => {
    const html = render("Antes $\\frac{1}{$ depois.\n\nOutro parágrafo com $x$.");
    expect(html).toContain('class="katex-error"');
    expect(html).toContain('<span class="vitrine-math-error-label">Fórmula inválida: </span>\\frac{1}{</span>');
    expect(html).toMatch(/title="ParseError: KaTeX parse error: [^"]+"/);
    expect(html).toContain(" depois.</p>");
    // O restante do documento continua sendo renderizado.
    expect(html).toMatch(/<p>Outro parágrafo com <span class="katex">/);
  });

  it("usa um token de tema, e não uma cor fixa, no trecho recusado", () => {
    const html = render("$\\frac{1}{$ e $\\comandoinexistente$");
    expect(html).toContain('style="color:var(--vitrine-danger)"');
    expect(html).not.toMatch(/#cc0000/i);
  });

  it("não deixa as macros de uma fórmula vazarem para a seguinte", () => {
    const html = render("$\\gdef\\vitrine{42}\\vitrine$ e depois $\\vitrine$");
    const [first, second] = html.split(" e depois ");
    expect(first).toContain("<mn>42</mn>");
    // Na segunda fórmula o comando é desconhecido: aparece pelo nome, na cor de erro.
    expect(second).not.toContain("<mn>42</mn>");
    expect(second).toContain('<mstyle mathcolor="var(--vitrine-danger)"><mtext>\\vitrine</mtext></mstyle>');
  });

  it("mostra um comando desconhecido pelo nome, na cor de erro, e renderiza o resto da fórmula", () => {
    const html = render("$a + \\comandoinexistente + b$");
    expect(html).toContain('<span class="mord" style="color:var(--vitrine-danger)">\\comandoinexistente</span>');
    expect(html).toContain("<mi>a</mi>");
    expect(html).toContain("<mi>b</mi>");
  });
});

// ------------------------------------------------------------------------------------------
describe("CT15/CT16: o KaTeX roda sem confiança e com limites (ADR-023)", () => {
  it("tem trust desligado e limites de tamanho e de expansão", () => {
    expect(KATEX_OPTIONS).toMatchObject({ trust: false, maxSize: 30, maxExpand: 1000 });
    expect(Object.isFrozen(KATEX_OPTIONS)).toBe(true);
    // Opções que afrouxariam a segurança não podem aparecer.
    expect(KATEX_OPTIONS).not.toHaveProperty("macros");
    expect(KATEX_OPTIONS).not.toHaveProperty("globalGroup");
  });

  it.each([
    ["\\href", "$\\href{javascript:alert(1)}{clique aqui}$"],
    ["\\href com https", "$\\href{https://exemplo.test}{clique aqui}$"],
    ["\\url", "$\\url{javascript:alert(1)}$"],
    ["\\url com https", "$\\url{https://exemplo.test/rastro}$"],
  ])("%s não gera link", (_name, markdown) => {
    const html = render(markdown);
    const tags = openingTags(html);
    expect(tags.some((tag) => tag.name === "a")).toBe(false);
    expect(tags.some((tag) => "href" in tag.attributes)).toBe(false);
    expectSafe(html);
  });

  it("\\includegraphics não gera imagem nem requisição a outro site", () => {
    const html = render("$\\includegraphics[width=1em]{https://exemplo.test/rastro.png}$");
    const tags = openingTags(html);
    expect(tags.some((tag) => tag.name === "img")).toBe(false);
    expect(tags.some((tag) => "src" in tag.attributes)).toBe(false);
  });

  it("\\htmlId, \\htmlClass, \\htmlStyle e \\htmlData não chegam à marcação", () => {
    const html = render(
      "$\\htmlId{alvo-do-autor}{a}$ $\\htmlClass{classe-do-autor}{b}$ $\\htmlStyle{position:fixed;inset:0}{c}$ $\\htmlData{acao=apagar}{d}$",
    );
    for (const { attributes } of openingTags(html)) {
      expect(attributes.id).toBeUndefined();
      expect(attributes.class ?? "").not.toContain("classe-do-autor");
      expect(attributes.style ?? "").not.toMatch(/position|inset/);
      expect(Object.keys(attributes).some((key) => key.startsWith("data-"))).toBe(false);
    }
  });

  it("limita as medidas dadas pelo autor a 30 em", () => {
    const html = render("$\\rule{9999em}{9999em}$ $\\hspace{5000em}$ $\\kern 7000em$");
    expect(html).toContain("border-right-width:30em;border-top-width:30em");
    const sizes = [...html.matchAll(/style="([^"]*)"/g)].flatMap(([, style]) => [...style.matchAll(/(-?[\d.]+)em/g)].map(([, size]) => Number(size)));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(30);
  });

  it.each([
    ["laço direto", "$\\def\\a{\\a}\\a$"],
    ["laço mútuo", "$\\def\\a{\\b}\\def\\b{\\a}\\a$"],
    ["crescimento exponencial", "$\\def\\a{\\b\\b}\\def\\b{\\c\\c}\\def\\c{\\d\\d}\\def\\d{\\e\\e}\\def\\e{\\f\\f}\\def\\f{\\g\\g}\\def\\g{\\h\\h}\\def\\h{\\i\\i}\\def\\i{\\j\\j}\\def\\j{\\k\\k}\\def\\k{xxxxxxxxxx}\\a$"],
    ["\\newcommand recursivo", "$\\newcommand{\\bomba}{\\bomba\\bomba}\\bomba$"],
    ["\\edef em cadeia", "$\\def\\a{aaaaaaaaaa}\\edef\\b{\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a}\\edef\\c{\\b\\b\\b\\b\\b\\b\\b\\b\\b\\b}\\edef\\d{\\c\\c\\c\\c\\c\\c\\c\\c\\c\\c}\\edef\\e{\\d\\d\\d\\d\\d\\d\\d\\d\\d\\d}\\e$"],
  ])("interrompe a expansão recursiva (%s) e segue renderizando", (_name, formula) => {
    const started = performance.now();
    const html = render(`Antes.\n\n${formula}\n\nDepois.`);
    const elapsed = performance.now() - started;

    expect(html).toContain('class="katex-error"');
    expect(html).toContain("Too many expansions");
    expect(html).toContain("<p>Antes.</p>");
    expect(html).toContain("<p>Depois.</p>");
    expect(elapsed).toBeLessThan(2000);
    // A saída não cresce com a expansão: fica o texto-fonte, uma vez.
    expect(html.length).toBeLessThan(formula.length * 3 + 600);
  });
});

// ------------------------------------------------------------------------------------------
describe("CT16: HTML bruto é exibido como texto e nada é executado (RN11, RNF03)", () => {
  it.each([
    ["script em bloco", "<script>alert(1)</script>"],
    ["script em linha", "texto <script>alert(1)</script> texto"],
    ["imagem com onerror", "<img src=x onerror=alert(1)>"],
    ["svg com onload", '<svg onload="alert(1)"><circle r="1"/></svg>'],
    ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
    ["link com javascript:", '<a href="javascript:alert(1)">clique</a>'],
    ["folha de estilo", "<style>body{display:none}</style>"],
    ["formulário", '<form action="https://exemplo.test"><input name="senha"><button>ok</button></form>'],
    ["base", '<base href="https://exemplo.test/">'],
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://exemplo.test">'],
    ["object e embed", '<object data="x.swf"></object><embed src="x.swf">'],
    ["negrito simples", "<b>negrito</b> e <i>itálico</i>"],
    ["comentário", "<!-- comentário --> depois"],
    ["bloco details", "<details open ontoggle=alert(1)><summary>x</summary></details>"],
    ["marcação dentro de ênfase", "**<img src=x onerror=alert(1)>**"],
    ["marcação em título", "# <script>alert(1)</script>"],
    ["marcação em célula de tabela", "| a |\n|---|\n| <script>alert(1)</script> |"],
    ["entidades", "&lt;script&gt;alert(1)&lt;/script&gt;"],
  ])("%s", (_name, markdown) => {
    const html = render(markdown);
    expectSafe(html);
    // Só existem os elementos que o Markdown gera; nenhum veio do HTML do autor.
    const names = new Set(openingTags(html).map((tag) => tag.name));
    for (const name of names) {
      expect(["div", "p", "strong", "h1", "table", "thead", "tbody", "tr", "th", "td"]).toContain(name);
    }
  });

  it("mostra o HTML do autor como texto legível", () => {
    const html = render("<script>alert(1)</script>\n\ntexto <b>negrito</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<p>texto &lt;b&gt;negrito&lt;/b&gt;</p>");
  });

  it("escapa o HTML dentro de código em linha e em bloco, com ou sem realce", () => {
    const html = render("`<script>alert(1)</script>`\n\n```html\n<script>alert(1)</script>\n```\n\n```\n</code></pre><script>alert(2)</script>\n```");
    expectSafe(html);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>");
    expect(html).toContain("&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;alert(2)&lt;/script&gt;");
  });

  it.each([
    ["javascript:", "[clique](javascript:alert(1))"],
    ["maiúsculas e minúsculas", "[clique](JaVaScRiPt:alert(1))"],
    ["entidade no esquema", "[clique](&#106;avascript:alert(1))"],
    ["entidade nos dois-pontos", "[clique](javascript&colon;alert(1))"],
    ["espaço antes do esquema", "[clique](<  javascript:alert(1)>)"],
    ["tabulação no esquema", "[clique](<java\tscript:alert(1)>)"],
    ["caractere de controle", "[clique](\u0001javascript:alert(1))"],
    ["vbscript:", "[clique](vbscript:msgbox(1))"],
    ["data:", "[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["file:", "[clique](file:///etc/passwd)"],
    ["link de referência", "[clique][ref]\n\n[ref]: javascript:alert(1)"],
    ["autolink", "<javascript:alert(1)>"],
    ["link em imagem", "[![alt](https://exemplo.test/a.png)](javascript:alert(1))"],
  ])("descarta a URL perigosa de um link (%s) e mantém o texto", (_name, markdown) => {
    const html = render(markdown);
    expectSafe(html);
    const anchors = openingTags(html).filter((tag) => tag.name === "a");
    // Sem URL utilizável não há link: fica só o texto (ou a imagem) que ele envolvia.
    expect(anchors).toEqual([]);
    expect(html).toMatch(/clique|javascript:alert\(1\)<|<img /);
  });

  it.each([
    ["javascript:", "![texto alternativo](javascript:alert(1))"],
    ["data:", "![texto alternativo](data:image/svg+xml,<svg onload=alert(1)>)"],
    ["vbscript:", "![texto alternativo](vbscript:x)"],
    ["imagem de referência", "![texto alternativo][img]\n\n[img]: javascript:alert(1)"],
  ])("descarta a URL perigosa de uma imagem (%s) e mostra o texto alternativo", (_name, markdown) => {
    const html = render(markdown);
    expectSafe(html);
    expect(openingTags(html).some((tag) => tag.name === "img")).toBe(false);
    expect(html).toContain("texto alternativo");
  });

  it("não deixa o título nem o texto alternativo fecharem o atributo", () => {
    const html = render(
      '[x](https://exemplo.test "a\\" onmouseover=\\"alert(1)") ![b" onerror="alert(2)](https://exemplo.test/a.png "c\\" onload=\\"alert(3)")',
    );
    expectSafe(html);
    const tags = openingTags(html);
    expect(Object.keys(tags.find((tag) => tag.name === "a").attributes).sort()).toEqual(["href", "title"]);
    expect(Object.keys(tags.find((tag) => tag.name === "img").attributes).sort()).toEqual(
      ["alt", "decoding", "loading", "referrerpolicy", "src", "title"].sort(),
    );
  });

  it("passa por um documento com todos os ataques juntos sem gerar nada executável", () => {
    const html = render(
      [
        "# Aula <script>alert(1)</script>",
        "[a](javascript:alert(1)) ![b](javascript:alert(2)) <javascript:alert(3)>",
        '<img src=x onerror=alert(4)> <iframe src="javascript:alert(5)"></iframe>',
        "$\\href{javascript:alert(6)}{x}$ $\\url{javascript:alert(7)}$ $\\includegraphics{javascript:alert(8)}$",
        "$\\htmlData{onclick=alert(9)}{x}$ $\\def\\a{\\a}\\a$",
        "```html\n<script>alert(10)</script>\n```",
        "| t |\n|---|\n| <svg onload=alert(11)> |",
        "- [x] <button onclick=alert(12)>ok</button>",
        "Nota[^n].\n\n[^n]: <script>alert(13)</script> [z](javascript:alert(14))",
      ].join("\n\n"),
    );
    expectSafe(html);
    expect(html).not.toMatch(/<script|<iframe|<svg|<button/i);
    // Os únicos links são os internos das notas de rodapé.
    const hrefs = openingTags(html).flatMap((tag) => (tag.name === "a" ? [tag.attributes.href] : []));
    expect(hrefs.every((href) => href.startsWith("#user-content-fn"))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------
describe("CT17: tabelas, tachado e listas de tarefas do GFM são renderizados (RF11)", () => {
  it("renderiza a tabela com cabeçalho, corpo e alinhamento", () => {
    const html = render("| Nome | Idade | Cidade |\n|:-----|------:|:------:|\n| Ana | 25 | Lavras |\n| Bia | 30 | Viçosa |");
    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain('<th style="text-align:left">Nome</th>');
    expect(html).toContain('<th style="text-align:right">Idade</th>');
    expect(html).toContain('<th style="text-align:center">Cidade</th>');
    expect(html).toContain('<td style="text-align:right">30</td>');
    expect(html.match(/<tr>/g)).toHaveLength(3);
  });

  it("põe a tabela em uma região rolável e alcançável pelo teclado", () => {
    const html = render("| a |\n|---|\n| b |");
    expect(html).toContain('<div class="vitrine-markdown-table" role="region" aria-label="Tabela" tabindex="0"><table>');
  });

  it("renderiza o texto tachado", () => {
    expect(render("Preço ~~antigo~~ novo.")).toContain("<p>Preço <del>antigo</del> novo.</p>");
  });

  it("renderiza a lista de tarefas com caixas só de leitura e estado por extenso", () => {
    const html = render("- [x] Ler o capítulo\n- [ ] Resolver a lista");
    expect(html).toContain('<ul class="contains-task-list">');
    const boxes = openingTags(html).filter((tag) => tag.name === "input").map((tag) => tag.attributes);
    expect(boxes).toEqual([
      { type: "checkbox", disabled: "", "aria-label": "Tarefa concluída", checked: "" },
      { type: "checkbox", disabled: "", "aria-label": "Tarefa pendente" },
    ]);
    expect(html).toContain("Ler o capítulo</li>");
    expect(html).toContain("Resolver a lista</li>");
  });

  it("transforma endereços soltos em links", () => {
    const html = render("Veja https://exemplo.test/aula e www.exemplo.test.");
    expect(html).toContain('<a href="https://exemplo.test/aula">https://exemplo.test/aula</a>');
    expect(html).toContain('<a href="http://www.exemplo.test">www.exemplo.test</a>');
  });

  it("renderiza as notas de rodapé com os textos em português", () => {
    const html = render("Afirmação[^1].\n\n[^1]: Fonte da afirmação.");
    expect(html).toContain('<h2 class="vitrine-sr-only" id="footnote-label">Notas de rodapé</h2>');
    expect(html).toContain('aria-label="Voltar à referência 1"');
    expect(html).toContain("Fonte da afirmação.");
    expect(html).not.toMatch(/Footnotes|Back to/);
  });
});

// ------------------------------------------------------------------------------------------
describe("CT18: blocos de código recebem realce conforme a linguagem (RF10)", () => {
  it("realça JavaScript", () => {
    const html = render("```js\nconst total = soma(1, 2); // comentário\n```");
    expect(html).toContain('<pre tabindex="0"><code class="hljs language-js">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">1</span>');
    expect(html).toContain('<span class="hljs-comment">// comentário</span>');
  });

  it("realça Python", () => {
    const html = render("```python\ndef dobro(x):\n    return 2 * x  # comentário\n```");
    expect(html).toContain('<code class="hljs language-python">');
    expect(html).toContain('<span class="hljs-keyword">def</span>');
    expect(html).toContain('<span class="hljs-title function_">dobro</span>');
    expect(html).toContain('<span class="hljs-comment"># comentário</span>');
  });

  it("realça o mesmo texto de modo diferente conforme a linguagem declarada", () => {
    const source = "def x # y\n";
    const python = render(`\`\`\`python\n${source}\`\`\``);
    const javascript = render(`\`\`\`js\n${source}\`\`\``);
    expect(python).toContain('<span class="hljs-keyword">def</span>');
    expect(python).toContain('<span class="hljs-comment"># y</span>');
    expect(javascript).not.toContain('<span class="hljs-keyword">def</span>');
    expect(javascript).not.toContain("hljs-comment");
  });

  it.each([["c"], ["cpp"], ["java"], ["bash"], ["sql"], ["json"], ["css"], ["html"], ["typescript"], ["r"], ["rust"], ["yaml"]])(
    "conhece a linguagem %s",
    (language) => {
      const html = render(`\`\`\`${language}\nint x = 1; "texto" /* c */ <a href="b">c</a> { "k": 1 } % d\n\`\`\``);
      expect(html).toContain(`class="hljs language-${language}"`);
      expect(html).toContain('<span class="hljs-');
      expectSafe(html);
    },
  );

  // O conjunto registrado é o "common" do lowlight (37 linguagens) mais as cinco da R-002; COBOL,
  // por exemplo, não está (outras entram sob pedido).
  it.each([["linguagem-inexistente"], ["cobol"], ["scala"]])(
    "mantém o texto de uma linguagem que não conhece (%s), sem realce e sem erro",
    (language) => {
      const html = render(`\`\`\`${language}\ndef x(): pass \\frac{1}{2}\n\`\`\``);
      expect(html).toContain("def x(): pass \\frac{1}{2}");
      expect(html).not.toContain("<span");
    },
  );

  // R-002: o produto garante o conjunto `common` mais LaTeX, MATLAB, Julia, Haskell e Fortran.
  describe("linguagens acrescentadas ao conjunto common (R-002)", () => {
    it("registra as 37 do common e as cinco novas, nada além", () => {
      expect(Object.keys(HIGHLIGHT_LANGUAGES)).toHaveLength(42);
      for (const language of Object.keys(common)) expect(HIGHLIGHT_LANGUAGES).toHaveProperty(language);
      for (const language of ["latex", "matlab", "julia", "haskell", "fortran"]) {
        expect(typeof HIGHLIGHT_LANGUAGES[language], language).toBe("function");
      }
      expect(Object.isFrozen(HIGHLIGHT_LANGUAGES)).toBe(true);
    });

    it("realça LaTeX", () => {
      const html = render("```latex\n\\documentclass{article}\n\\begin{document}\n% comentário\nOlá $x^2$\n\\end{document}\n```");
      expect(html).toContain('<code class="hljs language-latex">');
      expect(html).toContain('<span class="hljs-comment">% comentário</span>');
      expect(html).toContain('<span class="hljs-keyword">');
      expect(html).toContain("\\documentclass");
    });

    it("realça MATLAB", () => {
      const html = render("```matlab\nfunction y = f(x)\n  % comentário\n  y = x.^2 + 1;\nend\n```");
      expect(html).toContain('<code class="hljs language-matlab">');
      expect(html).toContain('<span class="hljs-keyword">function</span>');
      expect(html).toContain('<span class="hljs-comment">% comentário</span>');
      expect(html).toContain('<span class="hljs-number">2</span>');
    });

    it("realça Julia", () => {
      const html = render("```julia\nfunction f(x)\n  # comentário\n  return x^2 + 1\nend\n```");
      expect(html).toContain('<code class="hljs language-julia">');
      expect(html).toContain('<span class="hljs-keyword">function</span>');
      expect(html).toContain('<span class="hljs-comment"># comentário</span>');
      expect(html).toContain('<span class="hljs-number">2</span>');
    });

    it("realça Haskell", () => {
      const html = render('```haskell\nmodule Main where\n-- comentário\nmain :: IO ()\nmain = putStrLn "Olá"\n```');
      expect(html).toContain('<code class="hljs language-haskell">');
      expect(html).toContain('<span class="hljs-keyword">module</span>');
      expect(html).toContain('<span class="hljs-comment">-- comentário</span>');
      expect(html).toContain('<span class="hljs-type">IO</span>');
      expect(html).toContain('<span class="hljs-string">&quot;Olá&quot;</span>');
    });

    it("realça Fortran", () => {
      const html = render('```fortran\nprogram ola\n  ! comentário\n  print *, "Olá"\nend program ola\n```');
      expect(html).toContain('<code class="hljs language-fortran">');
      expect(html).toContain('<span class="hljs-keyword">program</span>');
      expect(html).toContain('<span class="hljs-comment">! comentário</span>');
      expect(html).toContain('<span class="hljs-string">&quot;Olá&quot;</span>');
    });

    it.each([
      ["tex", "% comentário", "hljs-comment"],
      ["hs", "-- comentário", "hljs-comment"],
      ["f90", "! comentário", "hljs-comment"],
      ["f95", "! comentário", "hljs-comment"],
    ])("reconhece o apelido %s", (alias, line, className) => {
      const html = render(`\`\`\`${alias}\n${line}\n\`\`\``);
      expect(html).toContain(`<span class="${className}">${line}</span>`);
    });

    it("mantém as linguagens do common funcionando depois do acréscimo", () => {
      expect(render("```python\n# c\n```")).toContain('<span class="hljs-comment"># c</span>');
      expect(render("```js\nconst x = 1;\n```")).toContain('<span class="hljs-keyword">const</span>');
    });
  });

  it("não adivinha a linguagem de um bloco que não a declara", () => {
    const html = render("```\nconst x = 1;\n```");
    expect(html).toContain('<pre tabindex="0"><code>const x = 1;\n</code></pre>');
  });

  it("não realça o código em linha", () => {
    expect(render("Use `const x = 1` aqui.")).toContain("<p>Use <code>const x = 1</code> aqui.</p>");
  });

  it("marca os trechos só com classes, sem cor embutida", () => {
    const html = render("```js\nconst x = 'a';\n```");
    expect(html).not.toContain("style=");
  });
});

// ------------------------------------------------------------------------------------------
describe("tema: só tokens, nenhuma cor fixa (RF19, ADR-025)", () => {
  const css = fs.readFileSync(path.join(COMPONENT_DIR, "markdown.css"), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const declarations = [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map(([, property, value]) => ({ property, value: value.trim() }));

  it("a folha do componente não tem cor literal", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/);
    expect(declarations.length).toBeGreaterThan(40);
  });

  it("toda cor da folha vem de um token --vitrine-*", () => {
    const colored = declarations.filter(({ property }) => /^(color|background|background-color|border|border-(top|left|right|bottom|color)|text-decoration-color|outline|fill|stroke)$/.test(property));
    expect(colored.length).toBeGreaterThan(15);
    for (const { property, value } of colored) {
      expect(value, `${property}: ${value}`).toMatch(/^(none|0|.*var\(--vitrine-[a-z-]+\))$/);
    }
  });

  it("o HTML de um documento completo não embute cor", () => {
    const html = render(
      "# T\n\nTexto com [link](https://exemplo.test), `código`, $x^2$ e ~~tachado~~.\n\n$$\\sum_{k=1}^n k$$\n\n```js\nconst x = 1;\n```\n\n| a |\n|---|\n| b |\n\n- [x] c\n\n> d\n\n$\\frac{1}{$",
    );
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map(([, style]) => style);
    expect(styles.length).toBeGreaterThan(5);
    for (const style of styles) {
      expect(style, style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(|\b(red|black|white|blue|green|gray|grey)\b/);
    }
    // A única cor em atributo style é o token do erro de fórmula.
    expect(styles.filter((style) => /(^|;)color:/.test(style))).toEqual(["color:var(--vitrine-danger)"]);
  });

  // WCAG 1.4.1: o link tem a cor do texto (--vitrine-link), e só o sublinhado o distingue. A
  // mutação que tirava o sublinhado de `.vitrine-markdown a` passou nos testes do M-009 (R-002).
  describe("links distinguíveis sem a cor (WCAG 1.4.1)", () => {
    /** Regras do CSS como [seletor, corpo]; o arquivo não tem blocos aninhados nem @media. */
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]);
    const ruleBody = (/** @type {string} */ selector) => rules.find(([found]) => found === selector)?.[1] ?? "";

    it("sublinha os links do conteúdo", () => {
      const body = ruleBody(".vitrine-markdown a");
      expect(body, "regra .vitrine-markdown a").not.toBe("");
      expect(body).toMatch(/text-decoration:\s*underline\s*;/);
      expect(body).not.toMatch(/text-decoration(-line)?:\s*(none|inherit|initial|unset|revert)/);
    });

    it("dá ao link a cor do texto, pelo token --vitrine-link, e não a da paleta", () => {
      expect(ruleBody(".vitrine-markdown a")).toMatch(/color:\s*var\(--vitrine-link\)\s*;/);
      const globals = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
      expect(globals).toContain("--vitrine-link: var(--vitrine-foreground);");
    });

    it("nenhuma regra da folha tira o sublinhado de um link, nem no hover e no foco", () => {
      const anchorRules = rules.filter(([selector]) => selector.split(",").some((part) => /(^|[\s>+~])a(?![\w-])/.test(part.trim())));
      expect(anchorRules.map(([selector]) => selector)).toEqual(expect.arrayContaining([".vitrine-markdown a", ".vitrine-markdown a:hover"]));
      for (const [selector, body] of anchorRules) {
        expect(body, selector).not.toMatch(/text-decoration(-line)?:\s*(none|inherit|initial|unset|revert)/);
      }
    });

    it("renderiza o link como <a href> puro, sem classe nem estilo que remova o sublinhado", () => {
      const html = render("Veja [a aula](https://exemplo.test/aula), [outra](/ana/algebra) e https://exemplo.test/x.");
      const anchors = openingTags(html).filter((tag) => tag.name === "a");
      expect(anchors).toHaveLength(3);
      for (const { attributes } of anchors) {
        expect(Object.keys(attributes)).toEqual(["href"]);
      }
    });

    it("não deixa um estilo global do arquivo da folha tirar o sublinhado", () => {
      const globals = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
      expect(globals).not.toMatch(/(^|[\s,}])a\s*(:[\w-]+)?\s*\{[^}]*text-decoration[^}]*none/);
    });
  });

  it("usa na folha todos os tokens do realce de código", () => {
    const globals = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
    const declared = new Set([...globals.matchAll(/(--vitrine-code-[a-z]+):/g)].map(([, name]) => name));
    expect(declared.size).toBe(10);
    for (const name of declared) expect(css, name).toContain(`var(${name})`);
    expect(css).toContain("var(--vitrine-link)");
  });
});
