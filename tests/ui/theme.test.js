// Testes de unidade do contraste do tema, por modo (RN09, RN27, RNF05; CT24 e CT48, parte de
// unidade), e dos tokens de src/app/globals.css que dependem dele (RF19, RF31, ADR-025, ADR-031).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_MODES, MODE_BACKGROUND, contrastRatio, contrastWarnings, readableTextOn, safeThemeStyle, textColorsOf } from "@/lib/theme";

/** Paletas padrão da ADR-031 (Tabela do Cap. 5 §5.9): nenhuma cor gera aviso, em nenhum modo. */
const DEFAULTS = {
  primaryColor: "#2563EB",
  secondaryColor: "#1E293B",
  accentColor: "#B45309",
  darkPrimaryColor: "#60A5FA",
  darkSecondaryColor: "#CBD5E1",
  darkAccentColor: "#FBBF24",
};

/** Paleta clara anterior (RN08, até a ADR-031): ainda gera avisos no modo claro. */
const DEFAULT_PALETTE = {
  primaryColor: "#3b82f6",
  secondaryColor: "#1e293b",
  accentColor: "#f59e0b",
};
/** Paleta em que nenhuma cor gera aviso. */
const SAFE_PALETTE = {
  primaryColor: "#1d4ed8",
  secondaryColor: "#1e293b",
  accentColor: "#b45309",
};

describe("contrastRatio (WCAG 2.1)", () => {
  it("dá 21 entre o preto e o branco", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
  });

  it("dá 1 entre cores iguais", () => {
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBe(1);
  });

  it("não depende da ordem dos argumentos", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(contrastRatio("#000000", "#ffffff"));
    expect(contrastRatio("#f59e0b", "#1e293b")).toBe(contrastRatio("#1e293b", "#f59e0b"));
  });

  it("aceita maiúsculas e minúsculas", () => {
    expect(contrastRatio("#3B82F6", "#FFFFFF")).toBe(contrastRatio("#3b82f6", "#ffffff"));
    expect(contrastRatio("#AbCdEf", "#000000")).toBe(contrastRatio("#abcdef", "#000000"));
  });

  it.each([
    ["#767676", 4.54],
    ["#777777", 4.48],
    ["#3b82f6", 3.68],
    ["#1e293b", 14.63],
    ["#f59e0b", 2.15],
  ])("calcula %s contra o branco (cerca de %d)", (color, expected) => {
    expect(contrastRatio(color, "#ffffff")).toBeCloseTo(expected, 2);
  });

  it.each([["3b82f6"], ["#fff"], ["#3b82f6ff"], ["#gggggg"], ["azul"], [""], [undefined], [null], [0x3b82f6]])(
    "recusa %j, que não é #RRGGBB",
    (color) => {
      expect(() => contrastRatio(/** @type {any} */ (color), "#ffffff")).toThrow(TypeError);
      expect(() => contrastRatio("#ffffff", /** @type {any} */ (color))).toThrow(TypeError);
    },
  );
});

describe("contrastWarnings (RN09)", () => {
  it("devolve lista vazia quando nenhuma cor falha", () => {
    expect(contrastWarnings(SAFE_PALETTE)).toEqual([]);
  });

  it("avisa a primária e a de destaque da paleta padrão, mas não a secundária", () => {
    expect(contrastWarnings(DEFAULT_PALETTE)).toEqual([
      {
        code: "LOW_CONTRAST",
        field: "primaryColor",
        ratio: 3.67,
        minimum: 4.5,
        message:
          "A cor primária tem contraste de 3,67:1 com o branco, abaixo do mínimo de 4,5:1 (WCAG 2.1 AA).",
      },
      {
        code: "LOW_CONTRAST",
        field: "accentColor",
        ratio: 2.14,
        minimum: 3,
        message:
          "A cor de destaque tem contraste de 2,14:1 com o branco, abaixo do mínimo de 3:1 (WCAG 2.1 AA).",
      },
    ]);
  });

  it("exige 4,5:1 da primária e da secundária: #767676 passa e #777777 reprova", () => {
    for (const field of /** @type {const} */ (["primaryColor", "secondaryColor"])) {
      expect(contrastWarnings({ ...SAFE_PALETTE, [field]: "#767676" })).toEqual([]);

      const warnings = contrastWarnings({ ...SAFE_PALETTE, [field]: "#777777" });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ code: "LOW_CONTRAST", field, ratio: 4.47, minimum: 4.5 });
    }
  });

  it("exige só 3:1 da cor de destaque", () => {
    // #777777 (4,48:1) reprovaria como texto, mas atende ao mínimo de componentes de interface.
    expect(contrastWarnings({ ...SAFE_PALETTE, accentColor: "#777777" })).toEqual([]);
    // #949494 tem 3,03:1 e #959595 tem 2,99:1: o limite de 3:1 fica entre as duas.
    expect(contrastWarnings({ ...SAFE_PALETTE, accentColor: "#949494" })).toEqual([]);
    expect(contrastWarnings({ ...SAFE_PALETTE, accentColor: "#959595" })).toMatchObject([
      { field: "accentColor", ratio: 2.99, minimum: 3 },
    ]);
  });

  it("compara sempre com o branco, sem cruzar as cores entre si", () => {
    // Três cores iguais e escuras: contraste 1:1 entre elas, mas alto contra o branco.
    expect(
      contrastWarnings({ primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000" }),
    ).toEqual([]);
    // O branco tem 1:1 contra o branco: os três campos são avisados, na ordem dos pares.
    const warnings = contrastWarnings({
      primaryColor: "#FFFFFF",
      secondaryColor: "#ffffff",
      accentColor: "#FFFFFF",
    });
    expect(warnings.map((warning) => warning.field)).toEqual([
      "primaryColor",
      "secondaryColor",
      "accentColor",
    ]);
    expect(warnings.every((warning) => warning.ratio === 1)).toBe(true);
    expect(warnings[0].message).toContain("1,00:1");
  });

  it("trunca a razão exibida, sem arredondar para cima", () => {
    // 4,478...:1 arredondaria para 4,48; o aviso mostra 4,47.
    const [warning] = contrastWarnings({ ...SAFE_PALETTE, primaryColor: "#777777" });
    expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThan(4.475);
    expect(warning.ratio).toBe(4.47);
    expect(warning.message).toContain("4,47:1");
    expect(warning.ratio).toBeLessThan(warning.minimum);
  });

  it("aceita maiúsculas e minúsculas", () => {
    expect(
      contrastWarnings({ primaryColor: "#3B82F6", secondaryColor: "#1E293B", accentColor: "#F59E0B" }),
    ).toEqual(contrastWarnings(DEFAULT_PALETTE));
  });

  it("recusa cor fora do formato, que deveria ter sido barrada pela validação", () => {
    expect(() => contrastWarnings({ ...DEFAULT_PALETTE, accentColor: "laranja" })).toThrow(TypeError);
    expect(() => contrastWarnings(/** @type {any} */ ({ primaryColor: "#3b82f6" }))).toThrow(TypeError);
  });
});

describe("contrastWarnings por modo (RN09, RN27; CT24, CT48)", () => {
  // Fundo noturno: #0A0A0A. Cinzas no limite de 4,5:1 (#787878 = 4,48 reprova; #797979 = 4,54 passa)
  // e de 3:1 (#5C5C5C = 2,96 reprova; #5D5D5D = 3,01 passa) sobre ele.
  it("tem os dois modos e o fundo de cada um (#FFFFFF e #0A0A0A)", () => {
    expect(COLOR_MODES).toEqual(["light", "dark"]);
    expect(MODE_BACKGROUND).toEqual({ light: "#FFFFFF", dark: "#0A0A0A" });
  });

  it.each([
    ["light", "primaryColor", 5.17],
    ["light", "secondaryColor", 14.63],
    ["light", "accentColor", 5.02],
    ["dark", "darkPrimaryColor", 7.79],
    ["dark", "darkSecondaryColor", 13.33],
    ["dark", "darkAccentColor", 11.86],
  ])("as paletas padrão têm a razão da Tabela do Cap. 5 no modo %s (%s: %d:1)", (mode, field, expected) => {
    expect(contrastRatio(DEFAULTS[field], MODE_BACKGROUND[mode])).toBeCloseTo(expected, 2);
  });

  it("as paletas padrão não geram aviso em nenhum modo (CT24, CT48)", () => {
    expect(contrastWarnings(DEFAULTS, "light")).toEqual([]);
    expect(contrastWarnings(DEFAULTS, "dark")).toEqual([]);
  });

  it("sem o modo, vale o claro (quem passa só as três cores claras segue funcionando)", () => {
    expect(contrastWarnings(DEFAULTS)).toEqual(contrastWarnings(DEFAULTS, "light"));
    expect(contrastWarnings(DEFAULT_PALETTE)).toHaveLength(2);
    expect(contrastWarnings(DEFAULT_PALETTE, "light")).toEqual(contrastWarnings(DEFAULT_PALETTE));
  });

  it("o modo claro lê só os campos claros, e o noturno, só os campos darkXxxColor", () => {
    // Cores ruins no outro conjunto (e até inválidas) não interferem.
    expect(contrastWarnings({ ...DEFAULTS, darkPrimaryColor: "#0A0A0A", darkAccentColor: "azul" }, "light")).toEqual([]);
    expect(contrastWarnings({ ...DEFAULTS, primaryColor: "#FFFFFF", accentColor: "azul" }, "dark")).toEqual([]);
    expect(() => contrastWarnings({ primaryColor: "#2563EB" }, "dark")).toThrow(TypeError);
    expect(() => contrastWarnings({ darkPrimaryColor: "#60A5FA" }, "light")).toThrow(TypeError);
  });

  it("a paleta noturna é comparada com o fundo noturno, e não com o branco", () => {
    // Cinza escuro: razoável contra o branco (#404040 = 10,37:1), reprovado contra #0A0A0A (1,9:1).
    expect(contrastWarnings({ ...DEFAULTS, primaryColor: "#404040" }, "light")).toEqual([]);
    const [warning] = contrastWarnings({ ...DEFAULTS, darkPrimaryColor: "#404040" }, "dark");
    expect(warning).toMatchObject({ code: "LOW_CONTRAST", field: "darkPrimaryColor", minimum: 4.5 });
    expect(warning.ratio).toBeLessThan(2);
    // O inverso: o branco passa folgado no noturno (19,26:1) e reprova no claro (1:1).
    expect(contrastWarnings({ ...DEFAULTS, darkPrimaryColor: "#FFFFFF" }, "dark")).toEqual([]);
    expect(contrastWarnings({ ...DEFAULTS, primaryColor: "#FFFFFF" }, "light")).toMatchObject([
      { field: "primaryColor", ratio: 1 },
    ]);
  });

  it("no modo noturno, a mensagem nomeia a paleta e o fundo, e a forma do aviso é a mesma", () => {
    const warnings = contrastWarnings(
      { ...DEFAULTS, darkPrimaryColor: "#787878", darkSecondaryColor: "#787878", darkAccentColor: "#5C5C5C" },
      "dark",
    );
    expect(warnings.map(({ field }) => field)).toEqual(["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"]);
    expect(warnings[0]).toEqual({
      code: "LOW_CONTRAST",
      field: "darkPrimaryColor",
      ratio: 4.48,
      minimum: 4.5,
      message:
        "A cor primária noturna tem contraste de 4,48:1 com o fundo noturno (#0A0A0A), abaixo do mínimo de 4,5:1 (WCAG 2.1 AA).",
    });
    expect(warnings[1].message).toContain("A cor secundária noturna");
    expect(warnings[2]).toMatchObject({ ratio: 2.96, minimum: 3 });
    expect(warnings[2].message).toContain("A cor de destaque noturna");
    // A mesma forma do modo claro: cinco chaves, nem uma a mais (o Core confere a lista).
    for (const warning of warnings) expect(Object.keys(warning).sort()).toEqual(["code", "field", "message", "minimum", "ratio"]);
  });

  it("os limites do modo noturno são 4,5:1 (primária e secundária) e 3:1 (destaque)", () => {
    for (const field of /** @type {const} */ (["darkPrimaryColor", "darkSecondaryColor"])) {
      expect(contrastWarnings({ ...DEFAULTS, [field]: "#797979" }, "dark")).toEqual([]);
      expect(contrastWarnings({ ...DEFAULTS, [field]: "#787878" }, "dark")).toMatchObject([{ field, minimum: 4.5 }]);
    }
    expect(contrastWarnings({ ...DEFAULTS, darkAccentColor: "#5D5D5D" }, "dark")).toEqual([]);
    expect(contrastWarnings({ ...DEFAULTS, darkAccentColor: "#5C5C5C" }, "dark")).toMatchObject([
      { field: "darkAccentColor", minimum: 3 },
    ]);
  });

  it("no modo claro a forma da mensagem não mudou: ela fala do branco", () => {
    const [warning] = contrastWarnings({ ...DEFAULTS, primaryColor: "#777777" }, "light");
    expect(warning.message).toBe("A cor primária tem contraste de 4,47:1 com o branco, abaixo do mínimo de 4,5:1 (WCAG 2.1 AA).");
  });

  it("recusa um modo desconhecido", () => {
    for (const mode of ["sepia", "", null, "DARK"]) {
      expect(() => contrastWarnings(DEFAULTS, /** @type {any} */ (mode))).toThrow(/Modo de cor desconhecido/);
      expect(() => textColorsOf(DEFAULTS, /** @type {any} */ (mode))).toThrow(/Modo de cor desconhecido/);
    }
  });
});

describe("textColorsOf: o texto sobre a primária e a secundária, por modo (CT48)", () => {
  it("com as paletas padrão: branco no claro e preto no noturno, como na Tabela do Cap. 5", () => {
    expect(textColorsOf(DEFAULTS, "light")).toEqual({ onPrimary: "#FFFFFF", onSecondary: "#FFFFFF" });
    expect(textColorsOf(DEFAULTS, "dark")).toEqual({ onPrimary: "#000000", onSecondary: "#000000" });
    expect(textColorsOf(DEFAULTS)).toEqual(textColorsOf(DEFAULTS, "light"));
  });

  it("o texto sobre cada cor tem a razão da Tabela e acompanha a cor personalizada", () => {
    // Arredondadas em duas casas, como a Tabela do Cap. 5 (que traz 8,25 para a primária noturna;
    // o valor real, 8,2598, arredonda para 8,26: erro de arredondamento a corrigir na Tabela).
    const rounded = (/** @type {string} */ background, /** @type {string} */ text) =>
      Math.round(contrastRatio(background, text) * 100) / 100;
    expect(rounded(DEFAULTS.primaryColor, "#FFFFFF")).toBe(5.17);
    expect(rounded(DEFAULTS.darkPrimaryColor, "#000000")).toBe(8.26);
    expect(rounded(DEFAULTS.secondaryColor, "#FFFFFF")).toBe(14.63);
    expect(rounded(DEFAULTS.darkSecondaryColor, "#000000")).toBe(14.14);
    // A secundária deixa de ser sempre branca: uma secundária clara no claro pede texto preto.
    expect(textColorsOf({ ...DEFAULTS, secondaryColor: "#E5E7EB", primaryColor: "#FDE68A" }, "light")).toEqual({
      onPrimary: "#000000",
      onSecondary: "#000000",
    });
    // E uma escura no noturno, branco.
    expect(textColorsOf({ ...DEFAULTS, darkSecondaryColor: "#1E3A8A", darkPrimaryColor: "#312E81" }, "dark")).toEqual({
      onPrimary: "#FFFFFF",
      onSecondary: "#FFFFFF",
    });
  });

  it("cada modo lê a sua paleta: a mesma gravação dá textos diferentes", () => {
    expect(textColorsOf(DEFAULTS, "light").onSecondary).not.toBe(textColorsOf(DEFAULTS, "dark").onSecondary);
    expect(textColorsOf(DEFAULTS, "light").onPrimary).toBe(readableTextOn(DEFAULTS.primaryColor));
    expect(textColorsOf(DEFAULTS, "dark").onPrimary).toBe(readableTextOn(DEFAULTS.darkPrimaryColor));
    expect(textColorsOf(DEFAULTS, "dark").onSecondary).toBe(readableTextOn(DEFAULTS.darkSecondaryColor));
  });

  it("recusa cor fora do formato", () => {
    expect(() => textColorsOf({ ...DEFAULTS, darkSecondaryColor: "cinza" }, "dark")).toThrow(TypeError);
  });
});

describe("readableTextOn", () => {
  it("escolhe o preto sobre a primária padrão, em que o branco reprova o nível AA", () => {
    expect(contrastRatio("#3b82f6", "#ffffff")).toBeLessThan(4.5);
    expect(readableTextOn("#3b82f6")).toBe("#000000");
    expect(contrastRatio("#3b82f6", "#000000")).toBeCloseTo(5.71, 2);
  });

  it("escolhe o branco sobre cores escuras e o preto sobre cores claras", () => {
    expect(readableTextOn("#1e293b")).toBe("#FFFFFF");
    expect(readableTextOn("#000000")).toBe("#FFFFFF");
    expect(readableTextOn("#171717")).toBe("#FFFFFF");
    expect(readableTextOn("#f59e0b")).toBe("#000000");
    expect(readableTextOn("#ffffff")).toBe("#000000");
  });

  it("aceita maiúsculas e minúsculas", () => {
    expect(readableTextOn("#3B82F6")).toBe(readableTextOn("#3b82f6"));
  });

  it("devolve sempre a opção de maior contraste", () => {
    for (const color of ["#000000", "#404040", "#6b7280", "#808080", "#3b82f6", "#f59e0b", "#ffffff"]) {
      const chosen = readableTextOn(color);
      const other = chosen === "#FFFFFF" ? "#000000" : "#FFFFFF";
      expect(contrastRatio(color, chosen)).toBeGreaterThanOrEqual(contrastRatio(color, other));
    }
  });

  it("garante pelo menos 4,5:1 sobre qualquer cor (ADR-020)", () => {
    // Com #171717 como texto escuro, estas cores ficavam abaixo de 4,5:1 (pior caso, 4,23:1).
    for (const color of ["#7b7b7b", "#676fe3"]) {
      expect(contrastRatio(color, readableTextOn(color))).toBeGreaterThanOrEqual(4.5);
    }
    // Varredura dos cinzas e de uma grade de 4.096 cores: o pior caso é 4,58:1.
    let worst = Infinity;
    const hex = (/** @type {number} */ value) => value.toString(16).padStart(2, "0");
    for (let gray = 0; gray < 256; gray++) {
      const color = `#${hex(gray).repeat(3)}`;
      worst = Math.min(worst, contrastRatio(color, readableTextOn(color)));
    }
    for (let red = 0; red < 256; red += 17) {
      for (let green = 0; green < 256; green += 17) {
        for (let blue = 0; blue < 256; blue += 17) {
          const color = `#${hex(red)}${hex(green)}${hex(blue)}`;
          worst = Math.min(worst, contrastRatio(color, readableTextOn(color)));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.58);
  });

  it("recusa cor fora do formato", () => {
    expect(() => readableTextOn("#12345")).toThrow(TypeError);
  });
});

describe("tokens de tema em globals.css (RF19, ADR-031)", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
  /** Valor de uma variável declarada em :root. */
  const rootVariable = (/** @type {string} */ name) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
    if (!match) throw new Error(`Variável ${name} não encontrada em globals.css.`);
    return match[1];
  };

  it("declara a paleta clara padrão da ADR-031", () => {
    expect(rootVariable("--vitrine-primary")).toBe(DEFAULTS.primaryColor.toLowerCase());
    expect(rootVariable("--vitrine-secondary")).toBe(DEFAULTS.secondaryColor.toLowerCase());
    expect(rootVariable("--vitrine-accent")).toBe(DEFAULTS.accentColor.toLowerCase());
  });

  it("mapeia os tokens do Tailwind para as variáveis, sem fixar o valor", () => {
    for (const name of ["primary", "secondary", "accent", "on-primary"]) {
      expect(css).toContain(`--color-${name}: var(--vitrine-${name});`);
    }
  });

  it("usa readableTextOn para o texto sobre a primária", () => {
    const onPrimary = rootVariable("--vitrine-on-primary");
    expect(onPrimary.toUpperCase()).toBe(readableTextOn(rootVariable("--vitrine-primary")));
    expect(contrastRatio(rootVariable("--vitrine-primary"), onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("mantém os neutros com contraste AA sobre o fundo e a superfície", () => {
    const background = rootVariable("--vitrine-background");
    const surface = rootVariable("--vitrine-surface");
    for (const name of ["--vitrine-foreground", "--vitrine-muted", "--vitrine-danger"]) {
      expect(contrastRatio(rootVariable(name), background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(rootVariable(name), surface)).toBeGreaterThanOrEqual(4.5);
    }
    // Borda de campos de formulário e indicador de foco: componentes de interface (3:1).
    expect(contrastRatio(rootVariable("--vitrine-border-strong"), background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(rootVariable("--vitrine-focus"), background)).toBeGreaterThanOrEqual(3);
  });

  it("não tem modo escuro automático", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("define a cor dos links do conteúdo como a do texto, e não a primária", () => {
    // Com a paleta padrão, a primária teria 3,68:1 sobre o branco (Cap. 5 §5.9.1).
    expect(css).toContain("--vitrine-link: var(--vitrine-foreground);");
    expect(contrastRatio(rootVariable("--vitrine-foreground"), rootVariable("--vitrine-background"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("tokens do realce de código em globals.css (RF10, ADR-025)", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
  const ROLES = ["foreground", "comment", "keyword", "string", "number", "function", "type", "variable", "deletion"];

  /**
   * Variáveis --vitrine-code-* declaradas em um bloco do CSS.
   * @param {string} selector seletor do bloco, como aparece no arquivo
   * @returns {Record<string, string>}
   */
  function codeTokensOf(selector) {
    const start = css.indexOf(`\n${selector} {`);
    if (start === -1) throw new Error(`Bloco ${selector} não encontrado em globals.css.`);
    const block = css.slice(start, css.indexOf("\n}", start));
    return Object.fromEntries(
      [...block.matchAll(/--vitrine-code-([a-z]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, role, color]) => [role, color]),
    );
  }

  it.each([
    ["claro", ":root"],
    ["noturno", ".dark"],
  ])("o tema %s declara todas as cores, com contraste AA sobre o fundo do bloco", (_name, selector) => {
    const tokens = codeTokensOf(selector);
    expect(Object.keys(tokens).sort()).toEqual(["background", ...ROLES].sort());
    for (const role of ROLES) {
      expect(contrastRatio(tokens[role], tokens.background), `${selector} ${role}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o tema noturno é de fato escuro, e o claro, claro", () => {
    expect(readableTextOn(codeTokensOf(":root").background)).toBe("#000000");
    expect(readableTextOn(codeTokensOf(".dark").background)).toBe("#FFFFFF");
  });

  it("a variante noturna só vale sob a classe .dark", () => {
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
    expect(css).not.toContain("prefers-color-scheme");
  });
});

describe("neutros e paletas por modo em globals.css (RF31, RN27; CT48)", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

  /**
   * Corpo de um bloco do CSS, pelo seletor como aparece no arquivo.
   * @param {string} selector
   */
  function blockOf(selector) {
    const start = css.indexOf(`\n${selector} {`);
    if (start === -1) throw new Error(`Bloco ${selector} não encontrado em globals.css.`);
    return css.slice(start, css.indexOf("\n}", start));
  }

  /**
   * Variáveis --vitrine-* com valor #RRGGBB de um bloco (minúsculas).
   * @param {string} selector
   * @returns {Record<string, string>}
   */
  function colorsOf(selector) {
    return Object.fromEntries(
      [...blockOf(selector).matchAll(/--vitrine-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, value]) => [name, value.toLowerCase()]),
    );
  }

  const light = colorsOf(":root");
  const dark = colorsOf(".dark");

  // Tabela de neutros do Cap. 5 §5.9 (e o foco).
  const NEUTRALS = {
    light: { background: "#ffffff", foreground: "#171717", surface: "#f5f5f5", muted: "#525252", border: "#d4d4d4", "border-strong": "#737373", danger: "#b91c1c", focus: "#171717", "focus-halo": "#ffffff" },
    dark: { background: "#0a0a0a", foreground: "#ededed", surface: "#171717", muted: "#a3a3a3", border: "#404040", "border-strong": "#737373", danger: "#f87171", focus: "#fafafa", "focus-halo": "#0a0a0a" },
  };

  it.each([
    ["claro", light, NEUTRALS.light],
    ["noturno", dark, NEUTRALS.dark],
  ])("os neutros do modo %s são os da Tabela do Cap. 5", (_name, actual, expected) => {
    for (const [token, value] of Object.entries(expected)) expect(actual[token], `--vitrine-${token}`).toBe(value);
  });

  it("o fundo de cada modo é o contra o qual o contraste é verificado (MODE_BACKGROUND)", () => {
    expect(light.background).toBe(MODE_BACKGROUND.light.toLowerCase());
    expect(dark.background).toBe(MODE_BACKGROUND.dark.toLowerCase());
  });

  it.each([
    ["claro", light],
    ["noturno", dark],
  ])("os neutros do modo %s atendem à WCAG 2.1 AA (texto 4,5:1; bordas e foco 3:1)", (_name, tokens) => {
    for (const name of ["foreground", "muted", "danger"]) {
      expect(contrastRatio(tokens[name], tokens.background), name).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens[name], tokens.surface), `${name} sobre a superfície`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(tokens["border-strong"], tokens.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens["border-strong"], tokens.surface)).toBeGreaterThanOrEqual(3);
    // O foco é neutro e vem com um halo da cor do fundo: um dos dois contrasta com qualquer cor.
    expect(contrastRatio(tokens.focus, tokens.background)).toBeGreaterThanOrEqual(3);
    expect(tokens["focus-halo"]).toBe(tokens.background);
  });

  it("declara a paleta noturna padrão da ADR-031 sob .dark, sem aviso de contraste", () => {
    expect(dark.primary).toBe(DEFAULTS.darkPrimaryColor.toLowerCase());
    expect(dark.secondary).toBe(DEFAULTS.darkSecondaryColor.toLowerCase());
    expect(dark.accent).toBe(DEFAULTS.darkAccentColor.toLowerCase());
    expect(contrastWarnings({ darkPrimaryColor: dark.primary, darkSecondaryColor: dark.secondary, darkAccentColor: dark.accent }, "dark")).toEqual([]);
    expect(contrastWarnings({ primaryColor: light.primary, secondaryColor: light.secondary, accentColor: light.accent }, "light")).toEqual([]);
  });

  it("o texto sobre a primária e sobre a secundária é o readableTextOn da cor do próprio modo", () => {
    for (const tokens of [light, dark]) {
      expect(tokens["on-primary"].toUpperCase()).toBe(readableTextOn(tokens.primary));
      expect(tokens["on-secondary"].toUpperCase()).toBe(readableTextOn(tokens.secondary));
      expect(contrastRatio(tokens.primary, tokens["on-primary"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.secondary, tokens["on-secondary"])).toBeGreaterThanOrEqual(4.5);
    }
    expect(light["on-secondary"]).toBe("#ffffff");
    expect(dark["on-secondary"]).toBe("#000000");
  });

  it("color-scheme acompanha o modo (barras de rolagem e controles nativos)", () => {
    expect(blockOf(":root")).toContain("color-scheme: light;");
    expect(blockOf(".dark")).toContain("color-scheme: dark;");
  });

  it("o modo noturno vale só pela classe .dark, nunca pela preferência do sistema", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
  });

  describe("o envoltório .vitrine-tema (Código do Cap. 5 §5.9)", () => {
    const FIELDS = ["primary", "secondary", "accent", "on-primary", "on-secondary"];

    /** @param {string} selector @returns {Record<string, { source: string, fallback: string }>} */
    function wrapperOf(selector) {
      return Object.fromEntries(
        [...blockOf(selector).matchAll(/--vitrine-([a-z-]+):\s*var\(--vitrine-(light|dark)-([a-z-]+),\s*(#[0-9a-fA-F]{6})\);/g)].map(
          ([, name, mode, source, fallback]) => [name, { source: `${mode}-${source}`, fallback: fallback.toLowerCase() }],
        ),
      );
    }

    it.each([
      ["claro", ".vitrine-tema", "light", light],
      ["noturno", ".dark .vitrine-tema", "dark", dark],
    ])("no modo %s, escolhe as cinco variáveis --vitrine-%s-* do próprio modo", (_name, selector, mode, defaults) => {
      const rules = wrapperOf(selector);
      expect(Object.keys(rules).sort()).toEqual([...FIELDS].sort());
      for (const field of FIELDS) {
        expect(rules[field].source, field).toBe(`${mode}-${field}`);
        // Sem as variáveis do proprietário, vale a paleta padrão do modo.
        expect(rules[field].fallback, `${field}, padrão`).toBe(defaults[field]);
      }
    });

    it("as duas regras ficam no mesmo bloco que recebe o style: .vitrine-tema não é :root", () => {
      expect(css).not.toMatch(/:root\s*\{[^}]*--vitrine-(light|dark)-/);
    });
  });
});

describe("safeThemeStyle: o style do envoltório .vitrine-tema (§5.9)", () => {
  const FULL = {
    "--vitrine-light-primary": "#2563EB",
    "--vitrine-light-secondary": "#1E293B",
    "--vitrine-light-accent": "#B45309",
    "--vitrine-light-on-primary": "#FFFFFF",
    "--vitrine-light-on-secondary": "#FFFFFF",
    "--vitrine-dark-primary": "#60A5FA",
    "--vitrine-dark-secondary": "#CBD5E1",
    "--vitrine-dark-accent": "#FBBF24",
    "--vitrine-dark-on-primary": "#000000",
    "--vitrine-dark-on-secondary": "#000000",
  };

  it("deixa passar as dez variáveis das duas paletas, com valor #RRGGBB", () => {
    expect(safeThemeStyle(FULL)).toEqual(FULL);
  });

  it.each([
    ["valor com outra declaração", { "--vitrine-light-primary": "#2563EB; background: red" }],
    ["valor que não é cor", { "--vitrine-light-primary": "red" }],
    ["cor de três dígitos", { "--vitrine-light-primary": "#fff" }],
    ["valor com url()", { "--vitrine-dark-accent": "url(https://x.example/a)" }],
    ["valor que não é texto", { "--vitrine-dark-accent": 123 }],
    ["propriedade comum", { background: "#ffffff" }],
    ["variável de outro nome", { "--vitrine-primary": "#ffffff", "--vitrine-light-extra": "#ffffff", "--x": "#ffffff" }],
    ["variável com sufixo", { "--vitrine-light-primary-x": "#ffffff" }],
  ])("descarta %s", (_name, style) => {
    expect(safeThemeStyle(/** @type {any} */ (style))).toBeUndefined();
  });

  it("descarta só o que é inválido e mantém o resto", () => {
    expect(safeThemeStyle({ ...FULL, "--vitrine-dark-primary": "azul", color: "#ffffff" })).toEqual(
      Object.fromEntries(Object.entries(FULL).filter(([name]) => name !== "--vitrine-dark-primary")),
    );
  });

  it("sem nada, devolve undefined (o atributo style é omitido)", () => {
    expect(safeThemeStyle(null)).toBeUndefined();
    expect(safeThemeStyle(undefined)).toBeUndefined();
    expect(safeThemeStyle({})).toBeUndefined();
  });
});
