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
  getSiteConfiguration,
  siteDescriptionOf,
  siteNameOf,
} from "@/app/_lib/site";
import { getConfiguration, prisma, updateConfiguration } from "@/lib/db";
import { readableTextOn } from "@/lib/theme";

beforeEach(async () => {
  await prisma.configuration.deleteMany();
  vi.mocked(getConfiguration).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildThemeStyle", () => {
  const palette = { primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#b45309" };

  it("paleta válida: as quatro variáveis, com o texto sobre a primária calculado", () => {
    expect(buildThemeStyle(palette)).toEqual({
      "--vitrine-primary": "#1d4ed8",
      "--vitrine-on-primary": readableTextOn("#1d4ed8"),
      "--vitrine-secondary": "#0f172a",
      "--vitrine-accent": "#b45309",
    });
  });

  it("o texto sobre a primária acompanha a primária, não é um valor fixo", () => {
    const onDark = buildThemeStyle({ ...palette, primaryColor: "#0f172a" })["--vitrine-on-primary"];
    const onLight = buildThemeStyle({ ...palette, primaryColor: "#fde68a" })["--vitrine-on-primary"];

    expect(onDark).toBe(readableTextOn("#0f172a"));
    expect(onLight).toBe(readableTextOn("#fde68a"));
    expect(onDark).not.toBe(onLight);
  });

  it("aceita hexadecimais em maiúsculas e não define o texto sobre a secundária", () => {
    const style = buildThemeStyle({ primaryColor: "#1D4ED8", secondaryColor: "#0F172A", accentColor: "#B45309" });

    expect(style["--vitrine-primary"]).toBe("#1D4ED8");
    expect(style).not.toHaveProperty("--vitrine-on-secondary");
    expect(Object.keys(style)).toHaveLength(4);
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
    expect(buildThemeStyle({ ...palette, primaryColor })).toEqual({
      "--vitrine-secondary": "#0f172a",
      "--vitrine-accent": "#b45309",
    });
  });

  it("secundária e destaque inválidos são omitidos cada um por si", () => {
    expect(buildThemeStyle({ ...palette, secondaryColor: "#12345" })).toEqual({
      "--vitrine-primary": "#1d4ed8",
      "--vitrine-on-primary": readableTextOn("#1d4ed8"),
      "--vitrine-accent": "#b45309",
    });
    expect(buildThemeStyle({ ...palette, accentColor: null })).toEqual({
      "--vitrine-primary": "#1d4ed8",
      "--vitrine-on-primary": readableTextOn("#1d4ed8"),
      "--vitrine-secondary": "#0f172a",
    });
  });

  it.each([null, undefined, {}])("sem configuração (%s): objeto vazio", (configuration) => {
    expect(buildThemeStyle(configuration)).toEqual({});
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
