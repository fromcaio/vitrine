// Integração: aparência por dono e configuração do site em src/lib/db.js (M15, épico v1; RN08, RN17,
// RN27; ADR-025, ADR-028, ADR-031, ADR-038). Nulo na aparência = herda o site: a leitura de quem não
// tem linha devolve nulos sem escrever, e a aparência efetiva mescla o usuário sobre o site.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_COLORS,
  DataError,
  getAppearance,
  getConfiguration,
  getEffectiveAppearance,
  prisma,
  replaceFooterLinks,
  replaceImage,
  updateAppearance,
  updateConfiguration,
} from "@/lib/db";
import { contrastRatio } from "@/lib/theme";
import { createUser, resetDatabase, sampleImage } from "./helpers.js";

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

const NULOS = {
  siteName: null,
  siteDescription: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  darkPrimaryColor: null,
  darkSecondaryColor: null,
  darkAccentColor: null,
  logoImageId: null,
  faviconImageId: null,
};

const PALETA_CLARA = { primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333" };
const PALETA_NOTURNA = { darkPrimaryColor: "#aaaaaa", darkSecondaryColor: "#bbbbbb", darkAccentColor: "#cccccc" };

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

    it("coincidem com os padrões do schema do SITE; a aparência não tem padrão (nulo herda)", async () => {
      const user = await createUser("ana");
      const linha = await prisma.appearance.create({ data: { ownerId: user.id } });
      const site = await getConfiguration();

      for (const [campo, valor] of Object.entries(DEFAULT_COLORS)) {
        expect(/** @type {any} */ (site)[campo], `Configuration.${campo}`).toBe(valor);
        expect(/** @type {any} */ (linha)[campo], `Appearance.${campo}`).toBeNull();
      }
      expect(linha.siteName).toBeNull();
    });
  });

  describe("getAppearance (crua; RN08, ADR-038)", () => {
    it("sem linha, devolve os campos herdáveis NULOS com persisted=false, sem o nome do usuário, e NÃO escreve", async () => {
      const ana = await createUser("ana");

      const aparencia = await getAppearance(ana.id);

      expect(aparencia).toEqual({
        ownerId: ana.id,
        ...NULOS,
        showLogo: true,
        showName: true,
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

    it("com linha, devolve os valores gravados com persisted=true e os nulos de quem herda", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { ...PALETA_CLARA, showName: false });

      expect(await getAppearance(ana.id)).toMatchObject({
        ownerId: ana.id,
        persisted: true,
        ...PALETA_CLARA,
        darkPrimaryColor: null,
        darkSecondaryColor: null,
        darkAccentColor: null,
        siteName: null,
        showLogo: true,
        showName: false,
      });
    });

    it("não tem mais as URLs de logo e favicon nem os seis links sociais", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteDescription: "x" });
      const linha = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (await getAppearance(ana.id)));

      for (const campo of ["logoUrl", "faviconUrl", "discordUrl", "githubUrl", "youtubeUrl", "instagramUrl", "linkedinUrl", "twitchUrl"]) {
        expect(campo in linha, campo).toBe(false);
      }
    });
  });

  describe("updateAppearance", () => {
    it("o primeiro salvamento cria a linha SEM preencher o siteName (nulo herda o nome do site)", async () => {
      const ana = await createUser("ana");

      const criada = await updateAppearance(ana.id, { ...PALETA_NOTURNA });

      expect(criada).toMatchObject({ ownerId: ana.id, siteName: null, ...PALETA_NOTURNA, persisted: true });
      expect(criada.createdAt).toBeInstanceOf(Date);
      expect(await prisma.appearance.count()).toBe(1);
    });

    it("salvar de novo atualiza a mesma linha (uma por usuário) e o que não veio não muda", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Notas da Ana", ...PALETA_CLARA });

      const segunda = await updateAppearance(ana.id, { siteDescription: "Descrição" });

      expect(await prisma.appearance.count()).toBe(1);
      expect(segunda).toMatchObject({ siteName: "Notas da Ana", ...PALETA_CLARA, siteDescription: "Descrição" });
    });

    it("null e cadeia vazia ANULAM o nome e a paleta (voltam a herdar) e o siteDescription (RN17)", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Ana", siteDescription: "x", ...PALETA_CLARA, ...PALETA_NOTURNA });

      const limpa = await updateAppearance(ana.id, {
        siteName: "",
        siteDescription: "   ",
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
      });

      expect(limpa).toMatchObject({ siteName: null, siteDescription: null, ...PALETA_NOTURNA });
      expect([limpa.primaryColor, limpa.secondaryColor, limpa.accentColor]).toEqual([null, null, null]);
    });

    it("ignora chaves desconhecidas, as do portal e as removidas pelo épico", async () => {
      const ana = await createUser("ana");

      const linha = await updateAppearance(
        ana.id,
        /** @type {any} */ ({ homeBody: "texto", directoryEnabled: false, ownerId: "outro", foo: 1, siteName: "Ok", githubUrl: "https://github.com/ana", logoUrl: "https://x.test/l.png", logoImageId: "forjada" }),
      );

      expect(linha).toMatchObject({ ownerId: ana.id, siteName: "Ok", logoImageId: null });
      expect(linha.homeBody).toBeNull(); // a coluna existe (M26), mas updateAppearance a ignora: é de updateHome
      expect("githubUrl" in linha).toBe(false);
    });

    it("cada dono tem a sua: salvar a de um não toca na do outro", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await updateAppearance(ana.id, PALETA_CLARA);

      expect((await getAppearance(bia.id))?.primaryColor).toBeNull();
      expect(await prisma.appearance.count({ where: { ownerId: bia.id } })).toBe(0);
    });

    it("usuário inexistente é NOT_FOUND, e excluir o usuário apaga a aparência (Cascade)", async () => {
      const ana = await createUser("ana");
      await updateAppearance(ana.id, { siteName: "Ana" });

      expect((await failure(updateAppearance("fantasma", { siteName: "x" }))).code).toBe("NOT_FOUND");
      await prisma.user.delete({ where: { id: ana.id } });
      expect(await prisma.appearance.count()).toBe(0);
    });

    describe("ADR-038: a paleta de um modo vale por inteiro (as três cores) ou herda (nenhuma)", () => {
      it.each([
        ["lightPalette", { primaryColor: "#111111" }],
        ["lightPalette", { primaryColor: "#111111", secondaryColor: "#222222" }],
        ["darkPalette", { darkAccentColor: "#cccccc" }],
        ["darkPalette", { darkPrimaryColor: "#aaaaaa", darkSecondaryColor: "#bbbbbb" }],
      ])("%s com uma ou duas cores é INVALID_INPUT (field = o modo), e nada é gravado", async (modo, patch) => {
        const ana = await createUser("ana");

        const erro = await failure(updateAppearance(ana.id, patch));

        expect(erro).toMatchObject({ code: "INVALID_INPUT", details: { field: modo } });
        expect(await prisma.appearance.count()).toBe(0);
      });

      it("anular só uma cor de uma paleta definida é inválido (herdar é anular as três)", async () => {
        const ana = await createUser("ana");
        await updateAppearance(ana.id, PALETA_CLARA);

        expect(await failure(updateAppearance(ana.id, { accentColor: null }))).toMatchObject({
          code: "INVALID_INPUT",
          details: { field: "lightPalette" },
        });
        expect(await getAppearance(ana.id)).toMatchObject(PALETA_CLARA);
      });

      it("trocar uma cor de uma paleta definida é aceito (o estado resultante continua inteiro)", async () => {
        const ana = await createUser("ana");
        await updateAppearance(ana.id, PALETA_CLARA);

        expect(await updateAppearance(ana.id, { accentColor: "#999999" })).toMatchObject({ ...PALETA_CLARA, accentColor: "#999999" });
      });

      it("definir uma paleta pelas três, ou anular as três, é aceito; os modos são independentes", async () => {
        const ana = await createUser("ana");

        const so = await updateAppearance(ana.id, PALETA_CLARA);
        expect([so.darkPrimaryColor, so.darkSecondaryColor, so.darkAccentColor]).toEqual([null, null, null]);
        const nenhuma = await updateAppearance(ana.id, { primaryColor: null, secondaryColor: null, accentColor: null });
        expect([nenhuma.primaryColor, nenhuma.secondaryColor, nenhuma.accentColor]).toEqual([null, null, null]);
      });
    });

    describe("D-34: showLogo e showName não podem ficar ambos falsos (estado resultante)", () => {
      it("os dois falsos no mesmo pedido: INVALID_INPUT com field showName, sem criar a linha", async () => {
        const ana = await createUser("ana");

        expect(await failure(updateAppearance(ana.id, { showLogo: false, showName: false }))).toMatchObject({
          code: "INVALID_INPUT",
          details: { field: "showName" },
        });
        expect(await prisma.appearance.count()).toBe(0);
      });

      it("desligar o segundo quando o primeiro já está desligado é recusado; religar é aceito", async () => {
        const ana = await createUser("ana");
        await updateAppearance(ana.id, { showLogo: false });

        expect((await failure(updateAppearance(ana.id, { showName: false }))).code).toBe("INVALID_INPUT");
        expect(await updateAppearance(ana.id, { showLogo: true, showName: false })).toMatchObject({ showLogo: true, showName: false });
      });

      it("um pedido que não toca nos dois não os valida nem os altera", async () => {
        const ana = await createUser("ana");
        await updateAppearance(ana.id, { showName: false });

        expect(await updateAppearance(ana.id, { siteDescription: "x" })).toMatchObject({ showLogo: true, showName: false });
      });
    });
  });

  describe("getEffectiveAppearance (ADR-038): o usuário sobre o site, por unidade de herança", () => {
    it("sem linha do usuário, vale tudo do site e tudo herda; NÃO escreve nada (nem a linha do site)", async () => {
      const ana = await createUser("ana");

      const efetiva = await getEffectiveAppearance(ana.id);

      expect(efetiva).toEqual({
        ownerId: ana.id,
        persisted: false,
        siteName: "Vitrine",
        siteDescription: null,
        ...DEFAULT_COLORS,
        logoImageId: null,
        faviconImageId: null,
        showLogo: true,
        showName: true,
        footerLinks: [],
        inherits: { lightPalette: true, darkPalette: true, siteName: true, logo: true, favicon: true },
      });
      expect(await prisma.appearance.count()).toBe(0);
      expect(await prisma.configuration.count()).toBe(0);
    });

    it("herda o que o SITE definiu: nome, paletas e imagens", async () => {
      const ana = await createUser("ana");
      await updateConfiguration({ siteName: "Do sistema", primaryColor: "#010101", darkAccentColor: "#fefefe" });
      const logo = await replaceImage("logo", null, sampleImage("site-logo"));
      const favicon = await replaceImage("favicon", null, sampleImage("site-favicon"));

      const efetiva = await getEffectiveAppearance(ana.id);

      expect(efetiva).toMatchObject({
        siteName: "Do sistema",
        primaryColor: "#010101",
        darkAccentColor: "#fefefe",
        logoImageId: logo.id,
        faviconImageId: favicon.id,
        inherits: { lightPalette: true, darkPalette: true, siteName: true, logo: true, favicon: true },
      });
    });

    it("o que o usuário definiu sobrescreve o site: a paleta de cada modo (independentes), o nome e as imagens", async () => {
      const ana = await createUser("ana");
      await updateConfiguration({ siteName: "Do sistema", primaryColor: "#010101", darkPrimaryColor: "#020202" });
      const logoSite = await replaceImage("logo", null, sampleImage("logo-do-site"));
      await updateAppearance(ana.id, { siteName: "Da Ana", ...PALETA_CLARA });
      const logoAna = await replaceImage("logo", ana.id, sampleImage("logo-da-ana"));

      const efetiva = await getEffectiveAppearance(ana.id);

      expect(efetiva).toMatchObject({
        siteName: "Da Ana",
        ...PALETA_CLARA, // o modo claro é dela
        darkPrimaryColor: "#020202", // o noturno herda do site
        logoImageId: logoAna.id,
        faviconImageId: null,
        inherits: { lightPalette: false, darkPalette: true, siteName: false, logo: false, favicon: true },
      });
      expect(logoAna.id).not.toBe(logoSite.id);
    });

    it("showLogo, showName, siteDescription e o rodapé são só do usuário (não herdam do site)", async () => {
      const ana = await createUser("ana");
      await updateConfiguration({ siteDescription: "Do sistema", showLogo: false });
      await replaceFooterLinks(null, [{ icon: "github", url: "https://github.com/site" }]);
      await updateAppearance(ana.id, { showName: false });
      await replaceFooterLinks(ana.id, [{ icon: "email", url: "mailto:ana@exemplo.test" }]);

      const efetiva = await getEffectiveAppearance(ana.id);

      expect(efetiva).toMatchObject({ siteDescription: null, showLogo: true, showName: false });
      expect(efetiva?.footerLinks.map((l) => [l.icon, l.url])).toEqual([["email", "mailto:ana@exemplo.test"]]);
      expect((await getEffectiveAppearance((await createUser("bia")).id))?.footerLinks).toEqual([]);
    });

    it("usuário inexistente devolve null; o id vazio é INVALID_INPUT", async () => {
      expect(await getEffectiveAppearance("fantasma")).toBeNull();
      expect((await failure(getEffectiveAppearance(""))).code).toBe("INVALID_INPUT");
    });

    it("a efetiva de um usuário não é a de outro", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await updateAppearance(ana.id, { siteName: "Da Ana", ...PALETA_CLARA });

      expect((await getEffectiveAppearance(bia.id))?.siteName).toBe("Vitrine");
      expect((await getEffectiveAppearance(bia.id))?.primaryColor).toBe(DEFAULT_COLORS.primaryColor);
    });

    it("uma paleta incompleta na linha (estado que db.js recusa) é tratada como herdada, nunca mesclada", async () => {
      const ana = await createUser("ana");
      await prisma.appearance.create({ data: { ownerId: ana.id, primaryColor: "#123456" } });

      const efetiva = await getEffectiveAppearance(ana.id);

      expect(efetiva?.primaryColor).toBe(DEFAULT_COLORS.primaryColor);
      expect(efetiva?.inherits.lightPalette).toBe(true);
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
