// Comandos da barra de ferramentas do editor (M09; RF08): funções puras de format.js. Os casos
// usam um formato legível: ⟦seleção⟧ marca o trecho selecionado e ‸ marca o cursor sem seleção.
import { describe, expect, it } from "vitest";
import { applyFormat, diffRange, findInsecureImages, slugFromTitle } from "@/components/editor/format";
import { SLUG_PATTERN } from "@/lib/validators";

/** @param {string} marked texto com ⟦ ⟧ ou ‸ */
function parse(marked) {
  if (marked.includes("‸")) {
    const at = marked.indexOf("‸");
    return { value: marked.replace("‸", ""), start: at, end: at };
  }
  const start = marked.indexOf("⟦");
  const end = marked.indexOf("⟧") - 1;
  return { value: marked.replace("⟦", "").replace("⟧", ""), start, end };
}

/** @param {{ value: string, start: number, end: number }} state */
function show({ value, start, end }) {
  return start === end ? `${value.slice(0, start)}‸${value.slice(start)}` : `${value.slice(0, start)}⟦${value.slice(start, end)}⟧${value.slice(end)}`;
}

/** Aplica o comando a um texto marcado e devolve o resultado marcado. */
const run = (/** @type {any} */ command, /** @type {string} */ marked) => show(applyFormat(command, parse(marked)));

describe("applyFormat: estilo em linha", () => {
  it.each([
    ["bold", "oi ⟦mundo⟧", "oi **⟦mundo⟧**"],
    ["italic", "oi ⟦mundo⟧", "oi *⟦mundo⟧*"],
    ["strike", "oi ⟦mundo⟧", "oi ~~⟦mundo⟧~~"],
    ["code", "oi ⟦mundo⟧", "oi `⟦mundo⟧`"],
    ["math", "oi ⟦x^2⟧", "oi $⟦x^2⟧$"],
  ])("%s envolve a seleção", (command, before, after) => {
    expect(run(command, before)).toBe(after);
  });

  it.each([
    ["bold", "**⟦texto em negrito⟧**"],
    ["italic", "*⟦texto em itálico⟧*"],
    ["strike", "~~⟦texto tachado⟧~~"],
    ["code", "`⟦código⟧`"],
    ["math", "$⟦x⟧$"],
  ])("%s sem seleção insere o exemplo, já selecionado, para o autor digitar por cima", (command, expected) => {
    expect(run(command, "‸")).toBe(expected);
  });

  it.each([
    ["bold", "**⟦mundo⟧**", "⟦mundo⟧"],
    ["italic", "*⟦mundo⟧*", "⟦mundo⟧"],
    ["strike", "~~⟦mundo⟧~~", "⟦mundo⟧"],
    ["code", "`⟦mundo⟧`", "⟦mundo⟧"],
    ["math", "$⟦x⟧$", "⟦x⟧"],
  ])("%s desfaz o estilo quando a seleção já o tem (alternância)", (command, before, after) => {
    expect(run(command, before)).toBe(after);
  });

  it("desfaz o estilo quando a seleção inclui os marcadores", () => {
    expect(run("bold", "⟦**mundo**⟧")).toBe("⟦mundo⟧");
    expect(run("strike", "⟦~~mundo~~⟧")).toBe("⟦mundo⟧");
    expect(run("italic", "⟦*mundo*⟧")).toBe("⟦mundo⟧");
  });

  it("deixa os espaços das pontas fora do marcador (`** texto**` não seria negrito)", () => {
    expect(run("bold", "a⟦ mundo ⟧b")).toBe("a **⟦mundo⟧** b");
  });

  it("uma seleção só de espaços vira o exemplo", () => {
    expect(run("bold", "a⟦ ⟧b")).toBe("a**⟦texto em negrito⟧**b");
  });

  it("negrito e itálico convivem: o `*` do itálico dentro de `**` não conta como itálico", () => {
    expect(run("italic", "**⟦x⟧**")).toBe("***⟦x⟧***");
    expect(run("bold", "*⟦x⟧*")).toBe("***⟦x⟧***");
    // E, com os dois, cada comando desfaz só o seu.
    expect(run("italic", "***⟦x⟧***")).toBe("**⟦x⟧**");
    expect(run("bold", "***⟦x⟧***")).toBe("*⟦x⟧*");
    expect(run("italic", "⟦***x***⟧")).toBe("⟦**x**⟧");
  });

  it("o tachado de um negrito não desfaz o negrito", () => {
    expect(run("strike", "**⟦x⟧**")).toBe("**~~⟦x⟧~~**");
  });

  it("não confunde um `$$` de fórmula em bloco com a fórmula em linha", () => {
    expect(run("math", "$$⟦x⟧$$")).not.toBe("$⟦x⟧$");
  });
});

describe("applyFormat: títulos, citação e listas", () => {
  it("título: acrescenta o prefixo e o cursor acompanha o texto", () => {
    expect(run("heading1", "‸título")).toBe("# ‸título");
    expect(run("heading2", "meu ‸título")).toBe("## meu ‸título");
    expect(run("heading3", "‸")).toBe("### ‸");
  });

  it("título: o mesmo nível desfaz, e outro nível troca", () => {
    expect(run("heading2", "## ‸x")).toBe("‸x");
    expect(run("heading2", "# ‸x")).toBe("## ‸x");
    expect(run("heading1", "###### ‸x")).toBe("# ‸x");
  });

  it("título: vale para cada linha da seleção e preserva as linhas em branco", () => {
    expect(run("heading2", "⟦a\n\nb⟧")).toBe("⟦## a\n\n## b⟧");
    expect(run("heading2", "⟦## a\n## b⟧")).toBe("⟦a\nb⟧");
  });

  it("título: uma seleção que termina depois da quebra de linha não pega a linha seguinte", () => {
    expect(run("heading2", "⟦a\n⟧b")).toBe("⟦## a⟧\nb");
  });

  it("citação: prefixa cada linha e alterna", () => {
    expect(run("quote", "⟦a\nb⟧")).toBe("⟦> a\n> b⟧");
    expect(run("quote", "⟦> a\n> b⟧")).toBe("⟦a\nb⟧");
    expect(run("quote", "‸x")).toBe("> ‸x");
  });

  it("lista com marcadores", () => {
    expect(run("ul", "⟦a\nb⟧")).toBe("⟦- a\n- b⟧");
    expect(run("ul", "⟦- a\n- b⟧")).toBe("⟦a\nb⟧");
    expect(run("ul", "⟦* a\n+ b⟧")).toBe("⟦a\nb⟧");
  });

  it("lista numerada: numera em sequência, pulando as linhas em branco", () => {
    expect(run("ol", "⟦a\nb\nc⟧")).toBe("⟦1. a\n2. b\n3. c⟧");
    expect(run("ol", "⟦a\n\nb⟧")).toBe("⟦1. a\n\n2. b⟧");
    expect(run("ol", "⟦1. a\n2. b⟧")).toBe("⟦a\nb⟧");
  });

  it("lista de tarefas", () => {
    expect(run("tasks", "⟦a\nb⟧")).toBe("⟦- [ ] a\n- [ ] b⟧");
    expect(run("tasks", "⟦- [ ] a\n- [x] b⟧")).toBe("⟦a\nb⟧");
  });

  it("trocar o tipo da lista troca o marcador das linhas", () => {
    expect(run("ol", "⟦- a\n- b⟧")).toBe("⟦1. a\n2. b⟧");
    expect(run("ul", "⟦1. a\n2. b⟧")).toBe("⟦- a\n- b⟧");
    expect(run("ul", "⟦- [ ] a⟧")).toBe("⟦- a⟧");
    expect(run("tasks", "⟦- a⟧")).toBe("⟦- [ ] a⟧");
  });

  it("uma lista parcial vira lista inteira, sem prefixo duplicado", () => {
    expect(run("ul", "⟦- a\nb⟧")).toBe("⟦- a\n- b⟧");
  });

  it("só mexe nas linhas cobertas pela seleção", () => {
    expect(run("quote", "antes\n⟦meio⟧\ndepois")).toBe("antes\n⟦> meio⟧\ndepois");
    expect(run("ul", "antes\nme‸io\ndepois")).toBe("antes\n- me‸io\ndepois");
  });
});

describe("applyFormat: links, imagens, código, fórmulas e tabela", () => {
  it("link sem seleção: o texto fica para o autor", () => {
    expect(run("link", "‸")).toBe("[⟦texto do link⟧](https://)");
  });

  it("link com texto selecionado: o endereço fica para o autor", () => {
    expect(run("link", "veja ⟦a aula⟧ hoje")).toBe("veja [a aula](⟦https://⟧) hoje");
  });

  it("link com um endereço selecionado: ele vira o destino", () => {
    expect(run("link", "⟦https://exemplo.test/a⟧")).toBe("[⟦texto do link⟧](https://exemplo.test/a)");
    expect(run("link", "⟦http://exemplo.test⟧")).toBe("[⟦texto do link⟧](http://exemplo.test)");
  });

  it("imagem sem seleção: a descrição é a primeira a ser preenchida e o endereço começa em https", () => {
    expect(run("image", "‸")).toBe("![⟦descrição da imagem⟧](https://)");
  });

  it("imagem com texto selecionado: ele vira a descrição", () => {
    expect(run("image", "⟦gráfico da função⟧")).toBe("![gráfico da função](⟦https://⟧)");
  });

  it("bloco de código: separa do texto vizinho e deixa a linguagem selecionada", () => {
    expect(run("codeBlock", "‸")).toBe("```⟦linguagem⟧\ncódigo\n```");
    expect(run("codeBlock", "texto‸")).toBe("texto\n\n```⟦linguagem⟧\ncódigo\n```");
    expect(run("codeBlock", "texto\n‸")).toBe("texto\n\n```⟦linguagem⟧\ncódigo\n```");
    expect(run("codeBlock", "texto\n\n‸")).toBe("texto\n\n```⟦linguagem⟧\ncódigo\n```");
    expect(run("codeBlock", "‸depois")).toBe("```⟦linguagem⟧\ncódigo\n```\n\ndepois");
  });

  it("bloco de código: usa a seleção como conteúdo", () => {
    expect(run("codeBlock", "⟦x = 1\ny = 2⟧")).toBe("```⟦linguagem⟧\nx = 1\ny = 2\n```");
  });

  it("fórmula em bloco: $$ em linhas próprias, com o exemplo selecionado", () => {
    expect(run("mathBlock", "‸")).toBe("$$\n⟦x^2 + y^2 = z^2⟧\n$$");
    expect(run("mathBlock", "veja:‸")).toBe("veja:\n\n$$\n⟦x^2 + y^2 = z^2⟧\n$$");
    expect(run("mathBlock", "⟦a + b⟧")).toBe("$$\n⟦a + b⟧\n$$");
  });

  it("tabela: modelo GFM com a primeira coluna selecionada, depois de uma linha em branco", () => {
    const table = "| ⟦Coluna 1⟧ | Coluna 2 |\n|:---------|:---------|\n| dado     | dado     |";
    expect(run("table", "‸")).toBe(table);
    expect(run("table", "texto‸")).toBe(`texto\n\n${table}`);
  });

  it("tabela: não perde o texto selecionado, e insere depois dele", () => {
    expect(run("table", "⟦nota⟧ fim")).toBe("nota\n\n| ⟦Coluna 1⟧ | Coluna 2 |\n|:---------|:---------|\n| dado     | dado     |\n\n fim");
  });

  it("os blocos que resultam são Markdown válido para o renderizador (a primeira linha começa o bloco)", () => {
    const { value } = applyFormat("table", { value: "a", start: 1, end: 1 });
    expect(value.split("\n")).toEqual(["a", "", "| Coluna 1 | Coluna 2 |", "|:---------|:---------|", "| dado     | dado     |"]);
  });
});

describe("applyFormat: entradas fora do comum", () => {
  it("normaliza uma seleção invertida", () => {
    expect(applyFormat("bold", { value: "abc", start: 3, end: 0 })).toEqual({ value: "**abc**", start: 2, end: 5 });
  });

  it("recusa um comando desconhecido", () => {
    expect(() => applyFormat(/** @type {any} */ ("nao-existe"), { value: "", start: 0, end: 0 })).toThrow(TypeError);
  });

  it("não altera o texto de entrada", () => {
    const state = Object.freeze({ value: "texto", start: 0, end: 5 });
    expect(() => applyFormat("bold", state)).not.toThrow();
    expect(state.value).toBe("texto");
  });

  it("funciona em texto vazio e com acentos", () => {
    expect(applyFormat("bold", { value: "", start: 0, end: 0 }).value).toBe("**texto em negrito**");
    expect(run("bold", "‸ação")).toBe("**⟦texto em negrito⟧**ação");
    expect(run("heading1", "⟦ação⟧")).toBe("⟦# ação⟧");
  });
});

describe("diffRange", () => {
  it.each([
    ["inserção", "ab", "aXb", { start: 1, end: 1, text: "X" }],
    ["remoção", "aXb", "ab", { start: 1, end: 2, text: "" }],
    ["troca", "abc", "aXc", { start: 1, end: 2, text: "X" }],
    ["textos iguais", "abc", "abc", { start: 3, end: 3, text: "" }],
    ["início", "bc", "abc", { start: 0, end: 0, text: "a" }],
    ["fim", "ab", "abc", { start: 2, end: 2, text: "c" }],
    ["tudo diferente", "abc", "xyz", { start: 0, end: 3, text: "xyz" }],
    ["vazio para texto", "", "abc", { start: 0, end: 0, text: "abc" }],
    ["texto para vazio", "abc", "", { start: 0, end: 3, text: "" }],
    ["caracteres repetidos", "aaa", "aaaa", { start: 3, end: 3, text: "a" }],
  ])("%s", (_name, before, after, expected) => {
    expect(diffRange(before, after)).toEqual(expected);
  });

  it("reaplicar o trecho ao texto antigo dá o novo (propriedade, em vários pares)", () => {
    const pairs = [
      ["", ""],
      ["abc", "abc"],
      ["**x**", "x"],
      ["texto", "**texto**"],
      ["linha 1\nlinha 2", "> linha 1\n> linha 2"],
      ["aaaa", "aa"],
      ["ação ✓", "ação ✓✓"],
    ];
    for (const [before, after] of pairs) {
      const { start, end, text } = diffRange(before, after);
      expect(before.slice(0, start) + text + before.slice(end), `${before} -> ${after}`).toBe(after);
    }
  });
});

describe("slugFromTitle (UC05)", () => {
  it.each([
    ["Introdução ao Cálculo", "introducao-ao-calculo"],
    ["  Olá,   Mundo!! ", "ola-mundo"],
    ["Aula 01: Séries e Somatórios", "aula-01-series-e-somatorios"],
    ["Ça va? Año nuevo", "ca-va-ano-nuevo"],
    ["C++ e C#", "c-e-c"],
    ["já-é-slug", "ja-e-slug"],
    ["Título --- com --- hífens", "titulo-com-hifens"],
    ["2026", "2026"],
    ["***", ""],
    ["", ""],
    ["   ", ""],
  ])("%j vira %j", (title, slug) => {
    expect(slugFromTitle(title)).toBe(slug);
  });

  it("corta em 80 caracteres sem deixar hífen no fim", () => {
    const slug = slugFromTitle(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(slugFromTitle("palavra ".repeat(30)).length).toBeLessThanOrEqual(80);
  });

  it("o resultado sempre cumpre a RN03 (ou é vazio)", () => {
    for (const title of ["Álgebra Linear — Aula 1", "  --x--  ", "ÀÉÎÕÜ", "a b  c   d", "😀 emoji", "x".repeat(200), "Mixed CASE title", "1/2 + 1/3 = ?"]) {
      const slug = slugFromTitle(title);
      expect(slug === "" || SLUG_PATTERN.test(slug), `${title} -> ${slug}`).toBe(true);
    }
  });
});

describe("findInsecureImages (CSP: img-src só aceita https)", () => {
  it("acha o endereço de cada imagem em http://", () => {
    expect(findInsecureImages("![a](http://exemplo.test/a.png) texto ![b](http://outro.test/b.jpg \"título\")")).toEqual([
      "http://exemplo.test/a.png",
      "http://outro.test/b.jpg",
    ]);
  });

  it("não avisa de imagens https, de caminhos do próprio site nem de links comuns", () => {
    expect(findInsecureImages("![a](https://exemplo.test/a.png) ![b](/imagens/b.png) [c](http://exemplo.test) <http://auto.test>")).toEqual([]);
  });

  it("reconhece maiúsculas, espaços e o endereço entre <>", () => {
    // O esquema não diferencia maiúsculas de minúsculas: HTTP:// também é barrado.
    expect(findInsecureImages("![a]( HTTP://exemplo.test/a.png)")).toEqual(["HTTP://exemplo.test/a.png"]);
    expect(findInsecureImages("![a](  http://exemplo.test/a.png )")).toEqual(["http://exemplo.test/a.png"]);
    expect(findInsecureImages("![a](<http://exemplo.test/a.png>)")).toEqual(["http://exemplo.test/a.png"]);
  });

  it("ignora o que está em código, para um exemplo de Markdown não gerar aviso", () => {
    expect(findInsecureImages("`![a](http://exemplo.test/a.png)`")).toEqual([]);
    expect(findInsecureImages("```md\n![a](http://exemplo.test/a.png)\n```")).toEqual([]);
    expect(findInsecureImages("~~~\n![a](http://exemplo.test/a.png)\n~~~")).toEqual([]);
    // Um bloco ainda aberto também é código.
    expect(findInsecureImages("```md\n![a](http://exemplo.test/a.png)")).toEqual([]);
    expect(findInsecureImages("```\ncódigo\n```\n![b](http://real.test/b.png)")).toEqual(["http://real.test/b.png"]);
  });

  it("aceita texto vazio ou de outro tipo", () => {
    expect(findInsecureImages("")).toEqual([]);
    expect(findInsecureImages(/** @type {any} */ (undefined))).toEqual([]);
  });
});
