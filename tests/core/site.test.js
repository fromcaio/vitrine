// src/app/_lib/site.js (M11, parte do Core): leitura tolerante da configuração, variáveis CSS
// do tema e nome e descrição do site. Usa o SQLite temporário do setup; não lê o .env.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A função real do Dados continua em uso; o espião só permite contar as chamadas e simular falha.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getConfiguration: vi.fn(actual.getConfiguration) };
});

import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  buildThemeStyle,
  faviconMetadata,
  getSiteConfiguration,
  mediaUrlOf,
  siteDescriptionOf,
  siteMetadata,
  siteNameOf,
} from "@/app/_lib/site";
import { getConfiguration, prisma, updateConfiguration } from "@/lib/db";
import { readableTextOn, textColorsOf } from "@/lib/theme";

beforeEach(async () => {
  await prisma.configuration.deleteMany();
  vi.mocked(getConfiguration).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildThemeStyle: as duas paletas, com o texto por modo (ADR-025, ADR-030)", () => {
  const light = { primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#b45309" };
  const dark = { darkPrimaryColor: "#93c5fd", darkSecondaryColor: "#e2e8f0", darkAccentColor: "#fcd34d" };
  const palette = { ...light, ...dark };

  it("paletas válidas: as dez variáveis, o texto sobre a primária e a secundária calculado por modo", () => {
    expect(buildThemeStyle(palette)).toEqual({
      "--vitrine-light-primary": "#1d4ed8",
      "--vitrine-light-secondary": "#0f172a",
      "--vitrine-light-accent": "#b45309",
      "--vitrine-light-on-primary": textColorsOf(palette, "light").onPrimary,
      "--vitrine-light-on-secondary": textColorsOf(palette, "light").onSecondary,
      "--vitrine-dark-primary": "#93c5fd",
      "--vitrine-dark-secondary": "#e2e8f0",
      "--vitrine-dark-accent": "#fcd34d",
      "--vitrine-dark-on-primary": textColorsOf(palette, "dark").onPrimary,
      "--vitrine-dark-on-secondary": textColorsOf(palette, "dark").onSecondary,
    });
  });

  it("o texto sobre as cores acompanha a cor e o modo: não é um valor fixo", () => {
    const onDark = buildThemeStyle({ ...palette, primaryColor: "#0f172a" })["--vitrine-light-on-primary"];
    const onLight = buildThemeStyle({ ...palette, primaryColor: "#fde68a" })["--vitrine-light-on-primary"];
    const style = buildThemeStyle(palette);

    expect(onDark).toBe(readableTextOn("#0f172a"));
    expect(onLight).toBe(readableTextOn("#fde68a"));
    expect(onDark).not.toBe(onLight);
    // A secundária clara (escura) pede branco; a noturna (clara), preto.
    expect(style["--vitrine-light-on-secondary"]).toBe("#FFFFFF");
    expect(style["--vitrine-dark-on-secondary"]).toBe("#000000");
  });

  it("aceita hexadecimais em maiúsculas", () => {
    const style = buildThemeStyle({ primaryColor: "#1D4ED8", secondaryColor: "#0F172A", accentColor: "#B45309" });

    expect(style["--vitrine-light-primary"]).toBe("#1D4ED8");
    expect(Object.keys(style).every((name) => name.startsWith("--vitrine-light-"))).toBe(true);
    expect(Object.keys(style)).toHaveLength(5);
  });

  it("só uma paleta válida: a outra fica de fora, e vale o padrão do globals.css", () => {
    expect(Object.keys(buildThemeStyle(dark)).every((name) => name.startsWith("--vitrine-dark-"))).toBe(true);
    expect(Object.keys(buildThemeStyle(light)).every((name) => name.startsWith("--vitrine-light-"))).toBe(true);
  });

  it.each([
    ["nome de cor com CSS injetado", "red; background:url(x)"],
    ["hexadecimal com CSS injetado", "#112233; --x: url(x)"],
    ["cinco dígitos", "#12345"],
    ["sete dígitos", "#1234567"],
    ["três dígitos", "#fff"],
    ["dígito inválido", "#12345g"],
    ["sem cerquilha", "1d4ed8"],
    ["espaço em volta", " #1d4ed8"],
    ["vazio", ""],
    ["nulo", null],
    ["indefinido", undefined],
    ["número", 123456],
  ])("primária inválida (%s): omite a primária e o texto sobre ela, sem lançar", (_label, primaryColor) => {
    for (const [field, mode] of [["primaryColor", "light"], ["darkPrimaryColor", "dark"]]) {
      const style = buildThemeStyle({ ...palette, [field]: primaryColor });

      expect(style).not.toHaveProperty(`--vitrine-${mode}-primary`);
      expect(style).not.toHaveProperty(`--vitrine-${mode}-on-primary`);
      // A secundária do mesmo modo e a paleta do outro modo continuam.
      expect(style[`--vitrine-${mode}-secondary`]).toBe(palette[mode === "light" ? "secondaryColor" : "darkSecondaryColor"]);
      expect(style[`--vitrine-${mode}-on-secondary`]).toMatch(/^#(FFFFFF|000000)$/);
      expect(Object.keys(style)).toHaveLength(8);
    }
  });

  it("secundária e destaque inválidos são omitidos cada um por si", () => {
    const noSecondary = buildThemeStyle({ ...palette, secondaryColor: "#12345" });
    expect(noSecondary).not.toHaveProperty("--vitrine-light-secondary");
    expect(noSecondary).not.toHaveProperty("--vitrine-light-on-secondary");
    expect(noSecondary["--vitrine-light-on-primary"]).toBe(readableTextOn("#1d4ed8"));

    const noAccent = buildThemeStyle({ ...palette, accentColor: null });
    expect(noAccent).not.toHaveProperty("--vitrine-light-accent");
    expect(noAccent["--vitrine-light-secondary"]).toBe("#0f172a");
  });

  it.each([null, undefined, {}])("sem configuração (%s): objeto vazio", (configuration) => {
    expect(buildThemeStyle(configuration)).toEqual({});
  });
});

describe("siteMetadata", () => {
  it("o nome vira o título padrão e o modelo; a descrição vem da configuração", () => {
    expect(siteMetadata({ siteName: " Notas ", siteDescription: " Cálculo " })).toEqual({
      title: { absolute: "Notas", template: "%s | Notas" },
      description: "Cálculo",
    });
  });

  it.each([null, undefined, {}])("sem configuração (%s): 'Vitrine' e a descrição padrão", (configuration) => {
    expect(siteMetadata(configuration)).toEqual({
      title: { absolute: DEFAULT_SITE_NAME, template: `%s | ${DEFAULT_SITE_NAME}` },
      description: DEFAULT_SITE_DESCRIPTION,
    });
  });
});

describe("mediaUrlOf: só um identificador com a forma de um id entra na URL de /media (A-029, P-020)", () => {
  it.each(["abc123", "A", "a-b_C-9", "x".repeat(64), "0123456789"])("%s: /media/<id>", (id) => {
    expect(mediaUrlOf(id)).toBe(`/media/${id}`);
  });

  it.each([
    ["vazio", ""],
    ["65 caracteres", "x".repeat(65)],
    ["barra (caminho)", "a/b"],
    ["subida de diretório", "../x"],
    ["espaço", "a b"],
    ["ponto", "a.b"],
    ["consulta", "a?b=1"],
    ["âncora", "a#b"],
    ["porcentagem (codificação)", "a%2Fb"],
    ["aspas", 'a"b'],
    ["sinal de menor", "a<b"],
    ["acento", "á"],
    ["quebra de linha no fim", `abc${String.fromCharCode(10)}`],
    ["nulo", null],
    ["indefinido", undefined],
    ["número", 4],
    ["objeto", { id: "abc" }],
  ])("%s: nenhum endereço", (_name, id) => {
    expect(mediaUrlOf(id)).toBeNull();
  });
});

describe("faviconMetadata e o favicon enviado em siteMetadata (A-029)", () => {
  it("com a imagem: o icons PNG 64x64 em /media/<id>; sem imagem ou com id inválido: nada (vale o favicon.ico de reserva)", () => {
    expect(faviconMetadata("abc123")).toEqual({ icons: { icon: [{ url: "/media/abc123", type: "image/png", sizes: "64x64" }] } });
    expect(siteMetadata({ faviconImageId: "abc123" }).icons).toEqual({ icon: [{ url: "/media/abc123", type: "image/png", sizes: "64x64" }] });
    for (const id of [null, undefined, "", "a/b"]) expect(faviconMetadata(id)).toEqual({});
    expect(siteMetadata({}).icons).toBeUndefined();
  });
});

describe("nome e descrição do site", () => {
  it("usa os valores da configuração, sem espaços nas pontas", () => {
    expect(siteNameOf({ siteName: "  Notas de Aula " })).toBe("Notas de Aula");
    expect(siteDescriptionOf({ siteDescription: " Material didático " })).toBe("Material didático");
  });

  it.each([null, undefined, {}, { siteName: "", siteDescription: "" }, { siteName: "   ", siteDescription: null }])(
    "sem valor (%j): os padrões",
    (configuration) => {
      expect(siteNameOf(configuration)).toBe("Vitrine");
      expect(siteNameOf(configuration)).toBe(DEFAULT_SITE_NAME);
      expect(siteDescriptionOf(configuration)).toBe(DEFAULT_SITE_DESCRIPTION);
    },
  );
});

describe("getSiteConfiguration", () => {
  it("devolve a configuração gravada", async () => {
    await updateConfiguration({ siteName: "Notas de Aula", primaryColor: "#1d4ed8" });

    expect(await getSiteConfiguration()).toMatchObject({
      id: "default",
      siteName: "Notas de Aula",
      primaryColor: "#1d4ed8",
    });
    expect(getConfiguration).toHaveBeenCalledOnce();
  });

  it("sem registro, devolve a configuração padrão da RN08", async () => {
    expect(await getSiteConfiguration()).toMatchObject({ siteName: "Vitrine", primaryColor: "#2563eb" });
  });

  it("no next build devolve null e não consulta o banco", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(await getSiteConfiguration()).toBeNull();
    expect(getConfiguration).not.toHaveBeenCalled();
    expect(await prisma.configuration.count()).toBe(0);
  });

  it("fora do build (outra fase do Next), consulta normalmente", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    expect(await getSiteConfiguration()).not.toBeNull();
    expect(getConfiguration).toHaveBeenCalledOnce();
  });

  it("se a consulta falha, registra o erro e devolve null, sem lançar", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Cannot open database because the directory does not exist");
    vi.mocked(getConfiguration).mockRejectedValueOnce(failure);

    await expect(getSiteConfiguration()).resolves.toBeNull();
    expect(log).toHaveBeenCalledExactlyOnceWith(expect.any(String), failure);
  });
});
