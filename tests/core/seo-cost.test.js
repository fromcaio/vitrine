// Custo da descrição (R-018; Cap. 5 §5.12; RN25): `plainDescription` roda no servidor, que é um só processo
// Node, sobre o corpo de um conteúdo de até 256 KiB escrito por qualquer usuário. Estes testes rodam a
// função sobre entradas HOSTIS (delimitadores que abrem e nunca fecham, repetidos até o limite do corpo) e
// exigem um teto de tempo: o defeito original levava de 6 s a mais de 2 minutos nelas.
//
// Dois seguros independentes: (1) só o COMEÇO do texto é analisado (`ANALYSIS_LIMIT`), e (2) nenhum
// quantificador varre sem teto (`SPAN`). O segundo só aparece com uma janela maior que a do corte, por
// isso o ensaio com `stripMarkdown(texto, janela)`: sem o teto de um quantificador, a janela larga o torna
// quadrático e o teste estoura.
import { describe, expect, it } from "vitest";
import { ANALYSIS_LIMIT, SPAN, plainDescription, stripMarkdown } from "@/lib/seo";

const KB = 256 * 1024;
/** Teto de uma chamada sobre 256 KiB (o ensaio do Arquiteto pede 50 ms; o folgado absorve a carga da suíte). */
const CAP_MS = 150;
/** Janela larga do ensaio dos quantificadores, e o teto dela (limitado: ~100 ms; sem limite: segundos). */
const WIDE_WINDOW = 32 * 1024;
const WIDE_CAP_MS = 1000;

/** Os 20 casos do ensaio do Arquiteto (`doc/revisao/redos-seo.mjs`) e variantes: nunca devem passar do teto. */
const HOSTILE = {
  "crases triplas sem fechar": "```\n".repeat(KB / 4),
  "crases com texto": "```js\nx\n".repeat(KB / 8),
  "til triplo": "~~~\n".repeat(KB / 4),
  "dólar duplo aberto": "$$ ".repeat(KB / 3),
  "dólar simples alternado": "$a ".repeat(KB / 3),
  "colchetes abertos": "[a](".repeat(KB / 4),
  "colchetes sem fechar": "[".repeat(KB),
  "imagens abertas": "![a](".repeat(KB / 5),
  asteriscos: "*a ".repeat(KB / 3),
  "negrito aberto": "**a ".repeat(KB / 4),
  sublinhados: "_a ".repeat(KB / 3),
  "tags abertas": "<a ".repeat(KB / 3),
  "comentário aberto": "<!-- ".repeat(KB / 5),
  barras: "\\".repeat(KB),
  tabela: "|-".repeat(KB / 2),
  hashes: "#".repeat(KB),
  "linhas de espaço": " \n".repeat(KB / 2),
  "ref link": "[a]: ".repeat(KB / 5),
  "til duplo": "~~a ".repeat(KB / 4),
  "crase simples": "`a ".repeat(KB / 3),
  // variantes
  "abre e nunca fecha, um só trecho": `[${"x".repeat(KB)}`,
  "abre e fecha longe demais (acima do teto), por linha": `[${"x".repeat(SPAN + 1)}\n`.repeat(KB / (SPAN + 3)),
  "colchete e parêntese abertos sem fim": "[a](".repeat(KB / 4) + "x".repeat(1000),
  "notas de rodapé abertas": "[^a ".repeat(KB / 4),
  "negrito aberto com quebras": "**a\n".repeat(KB / 4),
  "itálico e sublinhado intercalados": "*_a ".repeat(KB / 4),
  "dólar com texto e quebra": "$a\n".repeat(KB / 3),
  "régua e lista sem fim": "- - ".repeat(KB / 4),
  "citações aninhadas": ">".repeat(KB),
  "espaços e cerquilha": " #".repeat(KB / 2),
  "tab e cerca": "\t```".repeat(KB / 4),
  "crases em fila": "`".repeat(KB),
  "tabela larga": `|${"-|".repeat(KB / 2)}`,
  "parênteses e escapes": "\\(\\[".repeat(KB / 4),
  "um corpo enorme de uma só palavra": "a".repeat(KB),
  "unicode fora do plano básico": "😀[".repeat(KB / 3),
};

/** Mede uma chamada, em ms. */
function timed(run) {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("plainDescription: custo sobre entrada hostil de 256 KiB (R-018)", () => {
  it.each(Object.entries(HOSTILE))("%s", (_label, input) => {
    expect(input.length).toBeGreaterThanOrEqual(KB * 0.99);
    let result = null;
    const ms = timed(() => {
      result = plainDescription(input);
    });

    expect(ms).toBeLessThan(CAP_MS);
    // E o resultado continua sendo uma descrição válida (texto bem formado, no tamanho).
    if (result !== null) {
      expect(Array.from(result).length).toBeLessThanOrEqual(160);
      expect(result.isWellFormed()).toBe(true);
    }
  });

  it("o custo não cresce com o tamanho do corpo: 16 KiB e 256 KiB levam o mesmo (só o começo é lido)", () => {
    const small = timed(() => plainDescription("[".repeat(16 * 1024)));
    const large = timed(() => plainDescription("[".repeat(KB)));

    // Sem o corte do começo, 256 KiB custaria 16 vezes mais ou mais; aqui o teto é uma margem larga.
    expect(large).toBeLessThan(Math.max(small * 8, 40));
  });

  it("só o começo conta: o que vem depois do limite nunca altera a descrição", () => {
    const start = `Texto do começo. ${"palavra ".repeat(60)}`;
    const common = plainDescription(start + "x".repeat(ANALYSIS_LIMIT));

    expect(plainDescription(`${start}${"x".repeat(ANALYSIS_LIMIT)}[[[${"**a ".repeat(40000)}`)).toBe(common);
    expect(common?.startsWith("Texto do começo. palavra palavra")).toBe(true);
  });
});

describe("stripMarkdown: todo quantificador tem teto (janela larga)", () => {
  // O corte do começo esconde o custo de um quantificador sem teto (4000 caracteres ainda passam rápido);
  // com uma janela de 32 KiB, o quadrático vira segundos e o limitado segue em ~100 ms.
  const wide = Object.entries({
    "colchetes sem fechar": "[".repeat(WIDE_WINDOW),
    "colchetes abertos": "[a](".repeat(WIDE_WINDOW / 4),
    "imagens abertas": "![a](".repeat(WIDE_WINDOW / 5),
    "imagem de referência aberta": "![a][".repeat(WIDE_WINDOW / 5),
    "referência aberta": "[a][".repeat(WIDE_WINDOW / 4),
    "definição de referência": "[a]: ".repeat(WIDE_WINDOW / 5),
    "nota de rodapé aberta": "[^a ".repeat(WIDE_WINDOW / 4),
    "dólar duplo aberto": "$$ ".repeat(WIDE_WINDOW / 3),
    "dólar simples alternado": "$a ".repeat(WIDE_WINDOW / 3),
    "dólar simples em uma linha": `$${"a".repeat(WIDE_WINDOW)}`,
    "comentário aberto": "<!-- ".repeat(WIDE_WINDOW / 5),
    "tags abertas": "<a ".repeat(WIDE_WINDOW / 3),
    "negrito aberto": "**a ".repeat(WIDE_WINDOW / 4),
    "sublinhado duplo aberto": "__a ".repeat(WIDE_WINDOW / 4),
    "til duplo aberto": "~~a ".repeat(WIDE_WINDOW / 4),
    "itálico aberto": "*a ".repeat(WIDE_WINDOW / 3),
    "itálico de sublinhado aberto": "_a ".repeat(WIDE_WINDOW / 3),
    "crases em fila": "`".repeat(WIDE_WINDOW),
    "crase simples": "`a ".repeat(WIDE_WINDOW / 3),
    "régua": "- ".repeat(WIDE_WINDOW / 2),
    "tabela": `|${"-|".repeat(WIDE_WINDOW / 2)}`,
    "linha só de traços": "-".repeat(WIDE_WINDOW),
    "espaços longos": `${" ".repeat(WIDE_WINDOW)}x`,
    "espaços e cerquilhas": " #".repeat(WIDE_WINDOW / 2),
    "citações": ">".repeat(WIDE_WINDOW),
    "lista": `1${".".repeat(0)}${" ".repeat(WIDE_WINDOW)}`,
    "título": `#${" ".repeat(WIDE_WINDOW)}`,
  });

  it.each(wide)("%s", (_label, input) => {
    const ms = timed(() => stripMarkdown(input, WIDE_WINDOW));

    expect(ms).toBeLessThan(WIDE_CAP_MS);
  });
});

describe("plainDescription: o corte do começo não estraga a descrição", () => {
  it("um corpo longo só de marcação no começo termina em palavra inteira, com reticências", () => {
    // O começo analisado tem poucas palavras (quase tudo é marcação de citação): a última, cortada pelo
    // limite da janela, não pode sobrar pela metade.
    const body = `${"> \n".repeat(1300)}Primeira frase boa ${"palavra ".repeat(500)}`;
    const description = plainDescription(body);

    expect(description?.startsWith("Primeira frase boa palavra palavra")).toBe(true);
    expect(description).toMatch(/ palavra…$/);
    expect(Array.from(description ?? "").length).toBeLessThan(160);
  });

  it("não parte um par substituto ao meio no limite da janela", () => {
    const body = `${"a".repeat(ANALYSIS_LIMIT - 1)}😀 fim`;
    const description = plainDescription(body);

    expect(description?.isWellFormed()).toBe(true);
    expect(stripMarkdown(body).isWellFormed()).toBe(true);
  });

  it("o texto curto passa inteiro, sem reticências, e o vazio vira null", () => {
    expect(plainDescription("Um texto curto.")).toBe("Um texto curto.");
    expect(plainDescription("")).toBeNull();
    expect(plainDescription("```\nso codigo\n```")).toBeNull();
    expect(plainDescription(null)).toBeNull();
  });

  it("um trecho acima do teto não é tratado como construção (fica como texto)", () => {
    const long = "x".repeat(SPAN + 20);

    expect(stripMarkdown(`[${long}](http://a)`)).toContain("http://a");
    expect(stripMarkdown(`[curto](http://a)`)).toBe("curto");
    expect(stripMarkdown(`**${long}**`)).toContain("**");
    expect(stripMarkdown("**curto**")).toBe("curto");
  });
});
