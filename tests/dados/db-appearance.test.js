// Integração: aparência por dono e configuração do site em src/lib/db.js (M15; RN08, RN17, RN27;
// ADR-025, ADR-028, ADR-031). A leitura de quem não tem linha devolve os padrões sem escrever.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_COLORS,
  DataError,
  getAppearance,
  getConfiguration,
  prisma,
  updateAppearance,
  updateConfiguration,
} from "@/lib/db";
import { contrastRatio } from "@/lib/theme";
import { createUser, resetDatabase } from "./helpers.js";

/** @param {Promise<unknown>} promise @returns {Promise<DataError>} */
async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return /** @type {DataError} */ (error);
  }
  throw new Error("Era esperado um erro, mas a chamada foi bem-sucedida.");
}

const LINKS_NULOS = {
  logoUrl: null,
  faviconUrl: null,
  discordUrl: null,
  githubUrl: null,
  youtubeUrl: null,
  instagramUrl: null,
  linkedinUrl: null,
  twitchUrl: null,
};

describe("db.js: aparência por dono", () => {
  beforeEach(resetDatabase);

  describe("padrões das paletas (ADR-031; Cap. 5 §5.9)", () => {
    it("são os da tabela de paletas padrão", () => {
      expect(DEFAULT_COLORS).toEqual({
        primaryColor: "#2563eb",
        secondaryColor: "#1e293b",
        accentColor: "#b45309",
        darkPrimaryColor: "#60a5fa",
        darkSecondaryColor: "#cbd5e1",
        darkAccentColor: "#fbbf24",
      });
    });

    it("coincidem com os padrões do schema, no site e na aparência (nenhum dos três diverge)", async () => {
      const user = await createUser("ana");
      const linha = await prisma.appearance.create({ data: { ownerId: user.id } });
      const site = await getConfiguration();

      for (const [campo, valor] of Object.entries(DEFAULT_COLORS)) {
        expect(/** @type {any} */ (linha)[campo], `Appearance.${campo}`).toBe(valor);
        expect(/** @type {any} */ (site)[campo], `Configuration.${campo}`).toBe(valor);
      }
    });
  });

  describe("getAppearance (RN08)", () => {
    it("sem linha, devolve os padrões com persisted=false, o nome do usuário e NÃO escreve", async () => {
      const ana = await createUser("ana");

      const aparencia = await getAppearance(ana.id);

      expect(aparencia).toEqual({
        ownerId: ana.id,
        siteName: "ana",
        siteDescription: null,
        ...DEFAULT_COLORS,
        ...LINKS_NULOS,
        createdAt: null,
        updatedAt: null,
        persisted: false,
      });
      expect(await prisma.appearance.count()).toBe(0);
      await getAppearance(ana.id);
      expect(await prisma.appearance.count()).toBe(0);
    });

    it("usuário inexistente devolve null; o dono vazio é INVALID_INPUT", async () => {
      expect(await getAppearance("fantasma")).toBeNull();
      expect((await failure(getAppearance(""))).code).toBe("INVALID_INPUT");
    });

    it("com linha, devolve os valores gravados com persisted=true", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { primaryColor: "#112233", githubUrl: "https://github.com/ana" });

      expect(await getAppearance(ana.id)).toMatchObject({
        ownerId: ana.id,
        persisted: true,
        primaryColor: "#112233",
        githubUrl: "https://github.com/ana",
        secondaryColor: DEFAULT_COLORS.secondaryColor,
      });
    });
  });

  describe("updateAppearance", () => {
    it("o primeiro salvamento cria a linha, com o nome do usuário se o pedido não traz siteName", async () => {
      const ana = await createUser("ana");

      const criada = await updateAppearance(ana.id, { darkPrimaryColor: "#334455" });

      expect(criada).toMatchObject({ ownerId: ana.id, siteName: "ana", darkPrimaryColor: "#334455", persisted: true });
      expect(criada.createdAt).toBeInstanceOf(Date);
      expect(await prisma.appearance.count()).toBe(1);
    });

    it("salvar de novo atualiza a mesma linha (uma por usuário) e o que não veio não muda", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Notas da Ana", accentColor: "#aa0000" });

      const segunda = await updateAppearance(ana.id, { siteDescription: "Descrição" });

      expect(await prisma.appearance.count()).toBe(1);
      expect(segunda).toMatchObject({ siteName: "Notas da Ana", accentColor: "#aa0000", siteDescription: "Descrição" });
    });

    it("cadeia vazia vira null nos opcionais (RN17); nos obrigatórios é INVALID_INPUT", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { githubUrl: "https://github.com/ana", siteDescription: "x" });

      const limpa = await updateAppearance(ana.id, { githubUrl: "", siteDescription: "   ", logoUrl: null });

      expect(limpa).toMatchObject({ githubUrl: null, siteDescription: null, logoUrl: null });
      expect((await failure(updateAppearance(ana.id, { siteName: "" }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateAppearance(ana.id, { darkAccentColor: " " }))).code).toBe("INVALID_INPUT");
    });

    it("ignora chaves desconhecidas e as do portal (homeBody e directoryEnabled não existem na aparência)", async () => {
      const ana = await createUser("ana");

      const linha = await updateAppearance(
        ana.id,
        /** @type {any} */ ({ homeBody: "texto", directoryEnabled: false, ownerId: "outro", foo: 1, siteName: "Ok" }),
      );

      expect(linha).toMatchObject({ ownerId: ana.id, siteName: "Ok" });
      expect("homeBody" in linha).toBe(false);
    });

    it("cada dono tem a sua: salvar a de um não toca na do outro", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await updateAppearance(ana.id, { primaryColor: "#111111" });

      expect((await getAppearance(bia.id))?.primaryColor).toBe(DEFAULT_COLORS.primaryColor);
      expect(await prisma.appearance.count({ where: { ownerId: bia.id } })).toBe(0);
    });

    it("usuário inexistente é NOT_FOUND, e excluir o usuário apaga a aparência (Cascade)", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Ana" });

      expect((await failure(updateAppearance("fantasma", { siteName: "x" }))).code).toBe("NOT_FOUND");
      await prisma.user.delete({ where: { id: ana.id } });
      expect(await prisma.appearance.count()).toBe(0);
    });
  });

  describe("configuração do site (registro único, RN08)", () => {
    it("o site não depende de nenhuma aparência: usa o registro default", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Do usuário" });

      expect((await getConfiguration()).siteName).toBe("Vitrine");
      expect(await prisma.configuration.count()).toBe(1);
    });

    it("grava a paleta noturna, o texto do portal e o diretório", async () => {
      const atualizada = await updateConfiguration({
        darkPrimaryColor: "#102030",
        darkSecondaryColor: "#405060",
        darkAccentColor: "#708090",
        homeBody: "# Bem-vindo",
        directoryEnabled: false,
      });

      expect(atualizada).toMatchObject({
        darkPrimaryColor: "#102030",
        darkSecondaryColor: "#405060",
        darkAccentColor: "#708090",
        homeBody: "# Bem-vindo",
        directoryEnabled: false,
        primaryColor: DEFAULT_COLORS.primaryColor,
      });
      expect(await prisma.configuration.count()).toBe(1);
    });

    it("homeBody vazio vira null; directoryEnabled só aceita booleano; cor noturna vazia é INVALID_INPUT", async () => {
      await updateConfiguration({ homeBody: "texto" });

      expect(await updateConfiguration({ homeBody: "" })).toMatchObject({ homeBody: null });
      expect((await failure(updateConfiguration({ directoryEnabled: /** @type {any} */ ("sim") }))).code).toBe("INVALID_INPUT");
      expect((await failure(updateConfiguration({ darkPrimaryColor: "" }))).code).toBe("INVALID_INPUT");
      expect((await getConfiguration()).directoryEnabled).toBe(true);
    });

    it("um pedido sem os campos novos não os altera", async () => {
      await updateConfiguration({ homeBody: "texto", directoryEnabled: false, darkAccentColor: "#010101" });

      const depois = await updateConfiguration({ siteName: "Só o nome" });

      expect(depois).toMatchObject({ siteName: "Só o nome", homeBody: "texto", directoryEnabled: false, darkAccentColor: "#010101" });
    });
  });
});

describe("paletas padrão e contraste (ADR-031; Cap. 5 §5.9, Tabela de paletas padrão)", () => {
  // O fundo de cada modo e os mínimos da WCAG 2.1 AA (Cap. 5 §5.9.1): texto, 4,5:1; destaque, 3:1.
  const MODES = [
    { name: "claro", background: "#FFFFFF", colors: ["primaryColor", "secondaryColor", "accentColor"] },
    { name: "noturno", background: "#0A0A0A", colors: ["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"] },
  ];

  for (const mode of MODES) {
    it(`a paleta padrão do modo ${mode.name} atinge os mínimos de contraste com o fundo (nenhum aviso)`, () => {
      const [primary, secondary, accent] = mode.colors.map((field) => /** @type {any} */ (DEFAULT_COLORS)[field]);

      expect(contrastRatio(primary, mode.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(secondary, mode.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accent, mode.background)).toBeGreaterThanOrEqual(3);
    });
  }

  it("a tabela do Cap. 5 §5.9: as razões conferem (5,17; 14,63; 5,02 no claro e 7,79; 13,33; 11,86 no noturno)", () => {
    const round = (/** @type {number} */ n) => Math.round(n * 100) / 100;

    expect([DEFAULT_COLORS.primaryColor, DEFAULT_COLORS.secondaryColor, DEFAULT_COLORS.accentColor].map((c) => round(contrastRatio(c, "#FFFFFF")))).toEqual([5.17, 14.63, 5.02]);
    expect([DEFAULT_COLORS.darkPrimaryColor, DEFAULT_COLORS.darkSecondaryColor, DEFAULT_COLORS.darkAccentColor].map((c) => round(contrastRatio(c, "#0A0A0A")))).toEqual([7.79, 13.33, 11.86]);
  });
});
