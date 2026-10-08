// Integração: registro único de configuração (RN08, RF23) e os campos do épico v1 (D-34, D-35, D-38).
// Os links do rodapé não vivem mais aqui: são linhas de footer_links (ADR-035; db-footer.test.js).
import { beforeEach, describe, expect, it } from "vitest";
import { CONFIGURATION_ID, DataError, getConfiguration, prisma, updateConfiguration } from "@/lib/db";
import { resetDatabase } from "./helpers.js";

describe("db.js: configuração", () => {
  beforeEach(resetDatabase);

  it("RN08: se o registro não existe, getConfiguration o cria com os valores padrão", async () => {
    expect(await prisma.configuration.count()).toBe(0);

    const configuration = await getConfiguration();

    expect(configuration).toMatchObject({
      id: CONFIGURATION_ID,
      siteName: "Vitrine",
      primaryColor: "#2563eb",
      secondaryColor: "#1e293b",
      accentColor: "#b45309",
      darkPrimaryColor: "#60a5fa",
      darkSecondaryColor: "#cbd5e1",
      darkAccentColor: "#fbbf24",
      homeBody: null,
      directoryEnabled: true,
      siteDescription: null,
      logoImageId: null,
      faviconImageId: null,
      showLogo: true,
      showName: true,
      modeIconPair: "sun_moon",
      directoryTitle: "Espaços",
    });
  });

  it("os campos removidos pelo épico v1 (URLs de logo e favicon e os seis links sociais) não existem mais", async () => {
    const configuration = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (await getConfiguration()));

    for (const campo of ["logoUrl", "faviconUrl", "discordUrl", "githubUrl", "youtubeUrl", "instagramUrl", "linkedinUrl", "twitchUrl"]) {
      expect(campo in configuration, campo).toBe(false);
    }
  });

  it("RN08: chamadas repetidas nunca criam um segundo registro", async () => {
    await getConfiguration();
    await getConfiguration();
    await updateConfiguration({ siteName: "Outro" });
    await Promise.all([getConfiguration(), updateConfiguration({ siteName: "Mais um" })]);

    expect(await prisma.configuration.count()).toBe(1);
  });

  it("atualiza identidade, cores, barra superior, par de ícones e título do diretório", async () => {
    const updated = await updateConfiguration({
      siteName: "Meu Site",
      siteDescription: "Descrição",
      primaryColor: "#112233",
      showLogo: false,
      modeIconPair: "lightbulb",
      directoryTitle: "Pessoas",
    });

    const esperado = {
      siteName: "Meu Site",
      siteDescription: "Descrição",
      primaryColor: "#112233",
      showLogo: false,
      showName: true,
      modeIconPair: "lightbulb",
      directoryTitle: "Pessoas",
    };
    expect(updated).toMatchObject(esperado);
    expect(await getConfiguration()).toMatchObject(esperado);
  });

  it("campos ausentes não mudam e chaves desconhecidas (inclusive as removidas) são ignoradas", async () => {
    await updateConfiguration({ siteName: "A", modeIconPair: "contrast_half" });

    const updated = await updateConfiguration(
      /** @type {any} */ ({ primaryColor: "#000000", id: "outro", foo: "bar", githubUrl: "https://github.com/a", logoUrl: "https://x.test/l.png" }),
    );

    expect(updated).toMatchObject({ id: CONFIGURATION_ID, siteName: "A", primaryColor: "#000000", modeIconPair: "contrast_half" });
    expect("githubUrl" in updated).toBe(false);
  });

  it("RN17: cadeia vazia ou em branco, nos campos opcionais, vira null", async () => {
    await updateConfiguration({ siteDescription: "texto", homeBody: "corpo" });

    const updated = await updateConfiguration({ siteDescription: "   ", homeBody: "" });

    expect(updated.siteDescription).toBeNull();
    expect(updated.homeBody).toBeNull();
  });

  it("recusa campo obrigatório vazio, sem alterar o registro", async () => {
    await updateConfiguration({ siteName: "Bom" });

    await expect(updateConfiguration({ siteName: "" })).rejects.toBeInstanceOf(DataError);
    await expect(updateConfiguration({ primaryColor: "  " })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect((await getConfiguration()).siteName).toBe("Bom");
  });

  describe("D-35: par de ícones do modo (lista fechada de quatro)", () => {
    it.each(["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"])("aceita %s", async (par) => {
      expect((await updateConfiguration({ modeIconPair: /** @type {any} */ (par) })).modeIconPair).toBe(par);
    });

    it("recusa um par fora da lista, sem alterar o registro", async () => {
      await updateConfiguration({ modeIconPair: "lightbulb" });

      await expect(updateConfiguration({ modeIconPair: /** @type {any} */ ("estrela") })).rejects.toMatchObject({
        code: "INVALID_INPUT",
        details: { field: "modeIconPair" },
      });
      expect((await getConfiguration()).modeIconPair).toBe("lightbulb");
    });
  });

  describe("D-38: título do diretório (1 a 40 caracteres)", () => {
    it("aceita de 1 a 40 caracteres", async () => {
      expect((await updateConfiguration({ directoryTitle: "A" })).directoryTitle).toBe("A");
      expect((await updateConfiguration({ directoryTitle: "x".repeat(40) })).directoryTitle).toBe("x".repeat(40));
    });

    it("recusa vazio, em branco e mais de 40 caracteres, sem alterar o registro", async () => {
      await updateConfiguration({ directoryTitle: "Pessoas" });

      for (const invalido of ["", "   ", "x".repeat(41)]) {
        await expect(updateConfiguration({ directoryTitle: invalido }), JSON.stringify(invalido)).rejects.toMatchObject({
          code: "INVALID_INPUT",
          details: { field: "directoryTitle" },
        });
      }
      expect((await getConfiguration()).directoryTitle).toBe("Pessoas");
    });
  });

  describe("D-34: showLogo e showName não podem ficar ambos falsos (estado resultante)", () => {
    it("desligar um de cada vez é aceito", async () => {
      expect(await updateConfiguration({ showLogo: false })).toMatchObject({ showLogo: false, showName: true });
      expect(await updateConfiguration({ showLogo: true, showName: false })).toMatchObject({ showLogo: true, showName: false });
    });

    it("desligar os dois no mesmo pedido é INVALID_INPUT com field showName", async () => {
      await expect(updateConfiguration({ showLogo: false, showName: false })).rejects.toMatchObject({
        code: "INVALID_INPUT",
        details: { field: "showName" },
      });
      expect(await getConfiguration()).toMatchObject({ showLogo: true, showName: true });
    });

    it("desligar o segundo quando o primeiro já está desligado também é recusado (o estado gravado conta)", async () => {
      await updateConfiguration({ showLogo: false });

      await expect(updateConfiguration({ showName: false })).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(await getConfiguration()).toMatchObject({ showLogo: false, showName: true });
    });

    it("recusa valor que não é booleano", async () => {
      await expect(updateConfiguration({ showLogo: /** @type {any} */ ("não") })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });
  });
});
