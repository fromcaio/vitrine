// Contraste dos componentes novos da A-028 (RNF05; WCAG 1.4.3 e 1.4.11) nos DOIS modos, medido sobre os
// tokens reais de `globals.css`: texto de 4,5:1 e bordas e controles de 3:1. As pares são as que os
// componentes usam (as classes `bg-*`, `text-*` e `border-*` do Tailwind mapeiam para os tokens).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

/** Os tokens `--vitrine-*` de um bloco que começa em `selector`. @param {string} selector */
function tokensOf(selector) {
  const start = css.indexOf(selector);
  const end = css.indexOf("}", start);
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const match of css.slice(start, end).matchAll(/--vitrine-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[match[1]] = match[2];
  return tokens;
}
const LIGHT = tokensOf(":root,\n.vitrine-modo-claro {");
const DARK = tokensOf(".dark,\n.vitrine-modo-escuro {");

const MODES = /** @type {const} */ ([
  ["claro", LIGHT],
  ["noturno", DARK],
]);

describe("os tokens de cada modo existem", () => {
  it.each(MODES)("modo %s", (_name, tokens) => {
    for (const key of ["background", "foreground", "surface", "muted", "border", "border-strong", "danger"]) expect(tokens[key], key).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("texto: 4,5:1 (WCAG 1.4.3)", () => {
  it.each(MODES)("[%s] iniciais do avatar e o desenho do ícone: foreground sobre surface", (_name, t) => {
    expect(contrastRatio(t.foreground, t.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(MODES)("[%s] 'Sem imagem' e as ajudas: muted sobre surface e sobre background", (_name, t) => {
    expect(contrastRatio(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.muted, t.background)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(MODES)("[%s] mensagens de erro: danger sobre background", (_name, t) => {
    expect(contrastRatio(t.danger, t.background)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(MODES)("[%s] botões 'Remover' de perigo: background sobre danger", (_name, t) => {
    expect(contrastRatio(t.background, t.danger)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(MODES)("[%s] campos de texto e o seletor de arquivo: foreground sobre background e sobre surface", (_name, t) => {
    expect(contrastRatio(t.foreground, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.foreground, t.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("componentes de interface e gráficos: 3:1 (WCAG 1.4.11)", () => {
  it.each(MODES)("[%s] a borda dos campos, do seletor de ícone e do círculo do avatar: border-strong sobre background", (_name, t) => {
    expect(contrastRatio(t["border-strong"], t.background)).toBeGreaterThanOrEqual(3);
  });
  it.each(MODES)("[%s] a borda do avatar e da caixa da imagem sobre surface", (_name, t) => {
    expect(contrastRatio(t["border-strong"], t.surface)).toBeGreaterThanOrEqual(3);
  });
  it.each(MODES)("[%s] o ícone do rodapé (foreground) sobre o fundo do rodapé (surface)", (_name, t) => {
    expect(contrastRatio(t.foreground, t.surface)).toBeGreaterThanOrEqual(3);
  });
  it.each(MODES)("[%s] o indicador de foco sobre o fundo", (_name, t) => {
    expect(contrastRatio(t.focus, t.background)).toBeGreaterThanOrEqual(3);
  });
});
