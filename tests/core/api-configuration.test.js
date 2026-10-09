// Route Handlers de configuração (M05) sobre o SQLite temporário, com sessão real: leitura,
// atualização, validação de cor e avisos de contraste (CT24, parte de API), links sociais (CT33,
// parte de API) e revalidação só do portal (RN10, ADR-030).
import "./env";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// A função real da UI continua em uso; o espião só permite simular uma falha no cálculo.
vi.mock("@/lib/theme", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, contrastWarnings: vi.fn(actual.contrastWarnings) };
});

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import { prisma } from "@/lib/db";
import { contrastWarnings } from "@/lib/theme";
import { apiRequest, createAdminSession, resetContent } from "./helpers";

/** @type {string} */
let cookie;

beforeAll(async () => {
  ({ cookie } = await createAdminSession());
});

beforeEach(async () => {
  await resetContent();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(contrastWarnings).mockClear();
});

const read = () => configurationRoute.GET(apiRequest("/api/configuration", { cookie }));
const put = (body) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie }));

describe("GET /api/configuration", () => {
  it("devolve a configuração padrão, criando o registro único se ausente (RN08)", async () => {
    const response = await read();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: "default",
      siteName: "Vitrine",
      primaryColor: "#2563eb",
      secondaryColor: "#1e293b",
      accentColor: "#b45309",
      // Épico v1: o site tem imagens por referência (sem upload ainda), os dois itens da barra
      // superior ligados, o par de ícones do modo e o título do diretório; os links sociais saíram da
      // configuração (viraram o rodapé por ícones, FooterLink).
      logoImageId: null,
      faviconImageId: null,
      showLogo: true,
      showName: true,
      modeIconPair: "sun_moon",
      directoryTitle: "Espaços",
    });
    expect(body.data).not.toHaveProperty("githubUrl");
    expect(body.data).not.toHaveProperty("logoUrl");
    expect(await prisma.configuration.count()).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("não devolve avisos de contraste, nem com uma paleta que os geraria no PUT", async () => {
    // A paleta padrão gravada reprova em duas cores; ainda assim o GET traz só `data`.
    const body = await (await read()).json();

    expect(Object.keys(body)).toEqual(["data"]);
    expect(body).not.toHaveProperty("warnings");
    expect(contrastWarnings).not.toHaveBeenCalled();
  });
});

describe("PUT /api/configuration", () => {
  it("atualiza identidade e cores, e revalida só o portal `/` (RN10, ADR-030)", async () => {
    const response = await put({
      siteName: "Notas de Aula",
      siteDescription: "Material didático de Cálculo",
      primaryColor: "#112233",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      siteName: "Notas de Aula",
      siteDescription: "Material didático de Cálculo",
      primaryColor: "#112233",
      secondaryColor: "#1e293b", // campo ausente não muda
    });
    expect(await prisma.configuration.count()).toBe(1);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("CT24: cor fora de #RRGGBB responde 422 e nada é gravado", async () => {
    const response = await put({ siteName: "Novo nome", primaryColor: "red; background: url(x)" });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Dados inválidos.",
      details: [{ field: "primaryColor", message: "A cor deve estar no formato #RRGGBB." }],
    });
    // O erro de formato não é um aviso: a resposta não traz `warnings` e a cor nem é avaliada.
    expect(body).not.toHaveProperty("warnings");
    expect(contrastWarnings).not.toHaveBeenCalled();
    expect(await prisma.configuration.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("as URLs de logotipo e favicon e os links sociais fixos saíram (A-029): são descartados, não gravados nem devolvidos", async () => {
    const response = await put({ siteName: "Notas", logoUrl: "/logo.svg", faviconUrl: "https://exemplo.test/f.ico", githubUrl: "javascript:alert(1)" });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.siteName).toBe("Notas");
    for (const field of ["logoUrl", "faviconUrl", "githubUrl", "discordUrl"]) expect(data).not.toHaveProperty(field);
    // Sozinhos, não sobra campo a atualizar.
    expect((await put({ githubUrl: "https://github.com/x" })).status).toBe(422);
  });

  it("recusa nome em branco, corpo vazio e JSON malformado", async () => {
    expect((await put({ siteName: "   " })).status).toBe(422);
    expect((await put({})).status).toBe(422);
    expect((await put("{ siteName: ")).status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ignora campos desconhecidos, como o identificador do registro", async () => {
    const response = await put({ id: "outro", siteName: "Notas" });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: "default", siteName: "Notas" });
    expect(await prisma.configuration.count()).toBe(1);
  });
});

describe("PUT /api/configuration: avisos de contraste (CT24, RN09)", () => {
  // Pares sempre contra o branco (Cap. 5 §5.9.1): primária e secundária, mínimo 4,5:1; destaque,
  // mínimo 3:1. `ratio` vem truncado em duas casas. A paleta padrão anterior à ADR-031 (primária
  // #3b82f6 e destaque #f59e0b, que ainda vale em instalações que a personalizaram assim) reprova na
  // primária e no destaque; a paleta padrão atual não reprova em nada. Por isso os testes que
  // precisam de avisos gravam a paleta antiga e todo teste afirma campo, razão e mínimo.
  const DEFAULT_PALETTE_WARNINGS = [
    { field: "primaryColor", ratio: 3.67, minimum: 4.5 },
    { field: "accentColor", ratio: 2.14, minimum: 3 },
  ];
  const PREVIOUS_DEFAULT_PALETTE = { primaryColor: "#3b82f6", secondaryColor: "#1e293b", accentColor: "#f59e0b" };
  const storePreviousDefaultPalette = () => prisma.configuration.upsert({ where: { id: "default" }, update: PREVIOUS_DEFAULT_PALETTE, create: { id: "default", ...PREVIOUS_DEFAULT_PALETTE } });
  const SAFE_PALETTE = { primaryColor: "#1d4ed8", secondaryColor: "#1e293b", accentColor: "#b45309" };
  const BAD_PALETTE = { primaryColor: "#facc15", secondaryColor: "#94a3b8", accentColor: "#fde68a" };
  const BAD_PALETTE_WARNINGS = [
    { field: "primaryColor", ratio: 1.53, minimum: 4.5 },
    { field: "secondaryColor", ratio: 2.56, minimum: 4.5 },
    { field: "accentColor", ratio: 1.24, minimum: 3 },
  ];

  /** Campo avisado, razão e mínimo de cada aviso, na ordem em que vieram. */
  const summarize = (warnings) => warnings.map(({ field, ratio, minimum }) => ({ field, ratio, minimum }));

  it("sem cores no corpo, avalia a paleta gravada (a padrão anterior): primária e destaque, nessa ordem", async () => {
    await storePreviousDefaultPalette();
    const response = await put({ siteName: "Notas de Aula" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["data", "warnings"]);
    expect(body.data).toMatchObject({ siteName: "Notas de Aula", primaryColor: "#3b82f6", accentColor: "#f59e0b" });
    expect(summarize(body.warnings)).toEqual(DEFAULT_PALETTE_WARNINGS);
  });

  it("sem cores no corpo, a paleta padrão atual (ADR-031) não gera nenhum aviso", async () => {
    const body = await (await put({ siteName: "Notas de Aula" })).json();

    expect(body.data).toMatchObject({ primaryColor: "#2563eb", secondaryColor: "#1e293b", accentColor: "#b45309" });
    expect(body.warnings).toEqual([]);
  });

  it("cada aviso segue o formato { code, field, ratio, minimum, message }", async () => {
    await storePreviousDefaultPalette();
    const { warnings } = await (await put({ siteName: "Notas de Aula" })).json();

    for (const warning of warnings) {
      expect(Object.keys(warning).sort()).toEqual(["code", "field", "message", "minimum", "ratio"]);
      expect(warning.code).toBe("LOW_CONTRAST");
    }
    expect(warnings[0].message).toBe(
      "A cor primária tem contraste de 3,67:1 com o branco, abaixo do mínimo de 4,5:1 (WCAG 2.1 AA).",
    );
  });

  it("paleta sem falhas: warnings presente e vazio", async () => {
    const response = await put(SAFE_PALETTE);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject(SAFE_PALETTE);
    expect(body.warnings).toEqual([]);
  });

  it("corrigir só a primária mantém o aviso do destaque padrão anterior", async () => {
    await storePreviousDefaultPalette();
    const body = await (await put({ primaryColor: SAFE_PALETTE.primaryColor })).json();

    expect(summarize(body.warnings)).toEqual([{ field: "accentColor", ratio: 2.14, minimum: 3 }]);
  });

  it("secundária logo abaixo do limiar gera um único aviso, com a razão truncada (4,47)", async () => {
    const response = await put({ primaryColor: "#1d4ed8", secondaryColor: "#777777", accentColor: "#b45309" });

    expect(response.status).toBe(200);
    expect(summarize((await response.json()).warnings)).toEqual([
      { field: "secondaryColor", ratio: 4.47, minimum: 4.5 },
    ]);
  });

  it("os avisos refletem a paleta gravada: continuam em um PUT posterior sem cores", async () => {
    expect(summarize((await (await put(BAD_PALETTE)).json()).warnings)).toEqual(BAD_PALETTE_WARNINGS);

    const response = await put({ siteName: "Só o nome" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ siteName: "Só o nome", ...BAD_PALETTE });
    expect(summarize(body.warnings)).toEqual(BAD_PALETTE_WARNINGS);
  });

  it("recebe do banco as seis cores gravadas, uma paleta por vez, e não o corpo da requisição", async () => {
    await storePreviousDefaultPalette();
    await put({ accentColor: "#b45309", siteName: "Notas" });

    expect(contrastWarnings).toHaveBeenCalledTimes(2);
    expect(contrastWarnings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ primaryColor: "#3b82f6", secondaryColor: "#1e293b", accentColor: "#b45309" }),
      "light",
    );
    expect(contrastWarnings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" }),
      "dark",
    );
  });

  it("o aviso não bloqueia: com os três avisos, grava e revalida o portal normalmente", async () => {
    const response = await put(BAD_PALETTE);

    expect(response.status).toBe(200);
    expect((await response.json()).warnings).toHaveLength(3);
    expect(await prisma.configuration.findUniqueOrThrow({ where: { id: "default" } })).toMatchObject(BAD_PALETTE);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("uma falha no cálculo dos avisos não impede a gravação nem a revalidação", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(contrastWarnings).mockImplementationOnce(() => {
      throw new Error("falha simulada no cálculo de contraste");
    });

    const response = await put({ siteName: "Gravado antes da falha" });

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect((await prisma.configuration.findUniqueOrThrow({ where: { id: "default" } })).siteName).toBe(
      "Gravado antes da falha",
    );
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/");
    log.mockRestore();
  });
});
