// Testes de unidade do contraste do tema (RN09, RNF05; CT24, parte de unidade) e dos tokens de
// src/app/globals.css que dependem dele (RF19).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, contrastWarnings, readableTextOn } from "@/lib/theme";

/** Paleta padrão da RN08. */
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

describe("tokens de tema em globals.css (RF19, D-17)", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
  /** Valor de uma variável declarada em :root. */
  const rootVariable = (/** @type {string} */ name) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
    if (!match) throw new Error(`Variável ${name} não encontrada em globals.css.`);
    return match[1];
  };

  it("declara a paleta padrão da RN08", () => {
    expect(rootVariable("--vitrine-primary")).toBe(DEFAULT_PALETTE.primaryColor);
    expect(rootVariable("--vitrine-secondary")).toBe(DEFAULT_PALETTE.secondaryColor);
    expect(rootVariable("--vitrine-accent")).toBe(DEFAULT_PALETTE.accentColor);
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
});
