// Auxiliares puros de SEO (A-014 Parte 3c, item 3; RF25, RNF07; CT25): a descrição sem marcação, a URL
// pública e o XML dos mapas. Sem banco nem Next.js.
import { describe, expect, it } from "vitest";
import { documentEntries, spaceSitemapXml, sitemapIndexXml, xmlEscape } from "@/app/_lib/sitemap";
import { DESCRIPTION_LENGTH, plainDescription, publicBaseUrl, stripMarkdown } from "@/lib/seo";

describe("stripMarkdown: sem a marcação", () => {
  it.each([
    ["títulos", "# Título\n\n## Subtítulo\nTexto.", "Título Subtítulo Texto."],
    ["título com marcas de fechamento", "## Título ##\nTexto", "Título Texto"],
    ["títulos sublinhados (setext)", "Título\n======\n\nSubtítulo\n---------\n\nTexto", "Título Subtítulo Texto"],
    ["negrito, itálico e tachado", "Um **forte**, um *itálico*, um __negrito__, um _itálico_ e um ~~tachado~~.", "Um forte, um itálico, um negrito, um itálico e um tachado."],
    ["links: fica o texto", "Veja [a página](https://exemplo.test/a?x=1&y=2) agora.", "Veja a página agora."],
    ["link por referência", "Veja [a página][ref] e [outra][].\n\n[ref]: https://exemplo.test", "Veja a página e outra."],
    ["imagens somem", "Antes ![uma figura](https://exemplo.test/a.png) depois.", "Antes depois."],
    ["autolink e HTML", "Antes <https://exemplo.test> e <b>negrito</b> e <!-- comentário --> depois.", "Antes e negrito e depois."],
    ["código em linha: fica o conteúdo", "Rode `npm install` e `npm test`.", "Rode npm install e npm test."],
    ["bloco de código some", "Antes\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nDepois", "Antes Depois"],
    ["bloco de código com til", "Antes\n\n~~~\ncódigo\n~~~\n\nDepois", "Antes Depois"],
    ["bloco de código sem fechamento some até o fim", "Antes\n\n```\ncódigo sem fim", "Antes"],
    ["matemática em linha some", "A energia é $E = mc^2$ no vácuo.", "A energia é no vácuo."],
    ["matemática em bloco some", "Antes\n\n$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n\nDepois", "Antes Depois"],
    ["o cifrão de preço não é matemática", "O livro custa $10 e o outro $20.", "O livro custa $10 e o outro $20."],
    ["citação", "> Uma citação\n> em duas linhas\n\nTexto", "Uma citação em duas linhas Texto"],
    ["listas e tarefas", "- um\n- dois\n\n1. três\n2) quatro\n\n- [x] feito\n- [ ] a fazer", "um dois três quatro feito a fazer"],
    ["tabela", "| A | B |\n|---|:-:|\n| 1 | 2 |", "A B 1 2"],
    ["régua", "Antes\n\n---\n\nDepois", "Antes Depois"],
    ["notas de rodapé: a chamada e a definição somem", "Texto[^1] aqui.\n\n[^1]: A nota.", "Texto aqui."],
    ["escapes", String.raw`Um \*asterisco\* literal e um \# jogo.`, "Um *asterisco* literal e um # jogo."],
    ["snake_case não é ênfase", "Use a variável meu_nome_completo no código.", "Use a variável meu_nome_completo no código."],
    ["quebras e espaços colapsam", "  linha   um\r\n\r\n\r\nlinha\tdois  ", "linha um linha dois"],
  ])("%s", (_label, input, expected) => {
    expect(stripMarkdown(input)).toBe(expected);
  });

  it("nada de marcação sobrevive em um documento realista", () => {
    const text = stripMarkdown("# Limites\n\nO **limite** de $f(x)$ quando $x \\to 0$ é [definido](/ana/definicao) por\n\n$$\\lim_{x\\to 0} f(x)$$\n\n```py\nprint(1)\n```\n\n- primeiro\n- segundo");

    expect(text).toBe("Limites O limite de quando é definido por primeiro segundo");
    expect(text).not.toMatch(/[*`$#\[\]<>|]/);
  });
});

describe("plainDescription: o começo do texto, ~160 caracteres, em palavra inteira", () => {
  it("texto curto: inteiro e sem reticências", () => {
    expect(plainDescription("# Olá\n\nUm **texto** curto.")).toBe("Olá Um texto curto.");
  });

  it("texto longo: corta em palavra inteira, com reticências, em no máximo 160 caracteres", () => {
    const long = "Palavra ".repeat(60).trim();

    const description = plainDescription(long);

    expect(Array.from(description).length).toBeLessThanOrEqual(DESCRIPTION_LENGTH);
    expect(description.endsWith("…")).toBe(true);
    expect(description.slice(0, -1).split(" ").every((word) => word === "Palavra")).toBe(true); // nenhuma palavra cortada ao meio
  });

  it("exatamente 160 caracteres cabem; 161 são cortados", () => {
    expect(plainDescription("a".repeat(160))).toBe("a".repeat(160));
    const cut = plainDescription(`${"palavra ".repeat(20)}${"b".repeat(10)}`);
    expect(Array.from(cut).length).toBeLessThanOrEqual(160);
  });

  it("uma palavra enorme, sem espaços, é cortada no limite", () => {
    const description = plainDescription("x".repeat(500));

    expect(Array.from(description)).toHaveLength(160);
    expect(description.endsWith("…")).toBe(true);
  });

  it("não parte um caractere de dois códigos (emoji) ao cortar", () => {
    const description = plainDescription("😀".repeat(300));

    expect(Array.from(description).every((char) => char === "😀" || char === "…")).toBe(true);
    expect(description).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // nenhum surrogate solto
  });

  it("a pontuação pendurada antes das reticências sai", () => {
    const description = plainDescription(`${"palavra ".repeat(19)}final, e continua para além do limite do corte`);

    expect(description).not.toMatch(/[,;:]…$/);
  });

  it("o texto só de marcação, vazio, nulo ou de outro tipo: null", () => {
    for (const value of ["", "   ", "\n\n", "---", "```js\ncódigo\n```", "$$x$$", "![só](a.png)", "<br>", null, undefined, 42]) {
      expect(plainDescription(/** @type {any} */ (value)), String(value)).toBeNull();
    }
  });

  it("o limite é configurável", () => {
    expect(Array.from(plainDescription("palavra ".repeat(20), 30)).length).toBeLessThanOrEqual(30);
  });

  it("o resultado nunca leva marcação nem HTML, mesmo com HTML hostil", () => {
    const description = plainDescription('<script>alert(1)</script> Texto <img src=x onerror=alert(1)> **seguro**');

    expect(description).not.toMatch(/[<>]/);
    expect(description).toBe("alert(1) Texto seguro");
  });
});

describe("publicBaseUrl: a URL pública", () => {
  it.each([
    ["https://vitrine.exemplo.test", "https://vitrine.exemplo.test"],
    ["https://vitrine.exemplo.test/", "https://vitrine.exemplo.test"],
    ["http://localhost:3000///", "http://localhost:3000"],
    ["  https://vitrine.exemplo.test  ", "https://vitrine.exemplo.test"],
    ["https://exemplo.test/vitrine/", "https://exemplo.test/vitrine"],
  ])("%j → %j (sem barra final)", (value, expected) => expect(publicBaseUrl(value)).toBe(expected));

  it.each([[undefined], [null], [""], ["   "], ["texto"], ["javascript:alert(1)"], ["ftp://exemplo.test"], ["//exemplo.test"], [42]])(
    "%j → null (sem URL, valem caminhos relativos)",
    (value) => expect(publicBaseUrl(/** @type {any} */ (value))).toBeNull(),
  );

  it("o padrão é BETTER_AUTH_URL", () => {
    const previous = process.env.BETTER_AUTH_URL;
    try {
      process.env.BETTER_AUTH_URL = "https://do-ambiente.test/";
      expect(publicBaseUrl()).toBe("https://do-ambiente.test");
      delete process.env.BETTER_AUTH_URL;
      expect(publicBaseUrl()).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previous;
    }
  });
});

describe("o XML dos mapas (sitemaps.org)", () => {
  const node = (slug, type, children = [], updatedAt = null) => ({ id: slug, slug, title: slug, type, children, updatedAt });
  const roots = [
    node("calculo", "COLLECTION", [
      node("limites", "DOCUMENT", [], new Date("2026-10-01T10:00:00Z")),
      node("avancado", "COLLECTION", [node("series", "DOCUMENT", [], new Date("2026-10-03T10:00:00Z"))]),
    ]),
    node("sobre", "DOCUMENT", [], new Date("2026-10-02T10:00:00Z")),
  ];

  it("documentEntries: só documentos, na ordem da árvore, com a data; coleções ficam de fora", () => {
    expect(documentEntries(roots, "/ana").map(({ path }) => path)).toEqual(["/ana/calculo/limites", "/ana/calculo/avancado/series", "/ana/sobre"]);
    expect(documentEntries(roots, "/ana")[0].lastModified).toEqual(new Date("2026-10-01T10:00:00Z"));
  });

  it("spaceSitemapXml: o início (com a data mais recente) e cada documento, em URLs absolutas", () => {
    const xml = spaceSitemapXml({ base: "https://vitrine.test", basePath: "/ana", roots });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    expect(xml).toContain("<url><loc>https://vitrine.test/ana</loc><lastmod>2026-10-03T10:00:00.000Z</lastmod></url>");
    expect(xml).toContain("<url><loc>https://vitrine.test/ana/calculo/limites</loc><lastmod>2026-10-01T10:00:00.000Z</lastmod></url>");
    expect(xml).toContain("<loc>https://vitrine.test/ana/sobre</loc>");
    expect(xml).not.toContain("<loc>https://vitrine.test/ana/calculo</loc>"); // a coleção redireciona
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("sem URL pública, o mapa traz só caminhos", () => {
    const xml = spaceSitemapXml({ base: null, basePath: "/ana", roots });

    expect(xml).toContain("<loc>/ana/sobre</loc>");
    expect(xml).not.toContain("http://localhost");
  });

  it("espaço sem conteúdo: só o início, sem data", () => {
    const xml = spaceSitemapXml({ base: "https://vitrine.test", basePath: "/ana", roots: [] });

    expect(xml).toContain("<url><loc>https://vitrine.test/ana</loc></url>");
    expect(xml).not.toContain("lastmod");
  });

  it("sitemapIndexXml: o mapa de cada espaço; sem espaços, o índice vazio", () => {
    expect(sitemapIndexXml({ base: "https://vitrine.test", handles: ["ana", "beto"] })).toContain(
      "<sitemap><loc>https://vitrine.test/ana/sitemap.xml</loc></sitemap><sitemap><loc>https://vitrine.test/beto/sitemap.xml</loc></sitemap>",
    );
    expect(sitemapIndexXml({ base: null, handles: [] })).toContain("<sitemapindex xmlns=");
    expect(sitemapIndexXml({ base: null, handles: ["ana"] })).toContain("<loc>/ana/sitemap.xml</loc>");
  });

  it("xmlEscape: o que é especial no XML nunca sai cru (a URL pública é configurada pelo operador)", () => {
    expect(xmlEscape(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
    const xml = sitemapIndexXml({ base: "https://x.test/?a=1&b=2", handles: ["ana"] });
    expect(xml).toContain("https://x.test/?a=1&amp;b=2/ana/sitemap.xml");
    expect(xml).not.toContain("&b=2");
  });
});
