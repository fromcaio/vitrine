// Integração: registro único de configuração (RN08, RF23) e links sociais (RN17).
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
      logoUrl: null,
      faviconUrl: null,
      discordUrl: null,
      githubUrl: null,
      youtubeUrl: null,
      instagramUrl: null,
      linkedinUrl: null,
      twitchUrl: null,
    });
  });

  it("RN08: chamadas repetidas nunca criam um segundo registro", async () => {
    await getConfiguration();
    await getConfiguration();
    await updateConfiguration({ siteName: "Outro" });
    await Promise.all([getConfiguration(), updateConfiguration({ siteName: "Mais um" })]);

    expect(await prisma.configuration.count()).toBe(1);
  });

  it("atualiza identidade, cores e os seis links sociais", async () => {
    const links = {
      discordUrl: "https://discord.gg/exemplo",
      githubUrl: "https://github.com/exemplo",
      youtubeUrl: "https://youtube.com/@exemplo",
      instagramUrl: "https://instagram.com/exemplo",
      linkedinUrl: "https://linkedin.com/in/exemplo",
      twitchUrl: "https://twitch.tv/exemplo",
    };

    const updated = await updateConfiguration({
      siteName: "Meu Site",
      siteDescription: "Descrição",
      primaryColor: "#112233",
      ...links,
    });

    expect(updated).toMatchObject({ siteName: "Meu Site", siteDescription: "Descrição", primaryColor: "#112233", ...links });
    expect(await getConfiguration()).toMatchObject({ siteName: "Meu Site", ...links });
  });

  it("campos ausentes não mudam e chaves desconhecidas são ignoradas", async () => {
    await updateConfiguration({ siteName: "A", githubUrl: "https://github.com/a" });

    const updated = await updateConfiguration(/** @type {any} */ ({ primaryColor: "#000000", id: "outro", foo: "bar" }));

    expect(updated).toMatchObject({ id: CONFIGURATION_ID, siteName: "A", githubUrl: "https://github.com/a", primaryColor: "#000000" });
  });

  it("RN17: cadeia vazia ou em branco, nos campos opcionais, vira null (link ausente)", async () => {
    await updateConfiguration({ githubUrl: "https://github.com/a", logoUrl: "https://x.test/logo.png" });

    const updated = await updateConfiguration({ githubUrl: "", logoUrl: "   ", twitchUrl: null });

    expect(updated.githubUrl).toBeNull();
    expect(updated.logoUrl).toBeNull();
    expect(updated.twitchUrl).toBeNull();
  });

  it("recusa campo obrigatório vazio, sem alterar o registro", async () => {
    await updateConfiguration({ siteName: "Bom" });

    await expect(updateConfiguration({ siteName: "" })).rejects.toBeInstanceOf(DataError);
    await expect(updateConfiguration({ primaryColor: "  " })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect((await getConfiguration()).siteName).toBe("Bom");
  });
});
