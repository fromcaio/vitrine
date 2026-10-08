// Integração: rodapé por ícones (ADR-035; RF24, RN17 nova) e as listas fechadas de
// src/lib/footer-icons.js. replaceFooterLinks é o único caminho de escrita: substitui o rodapé inteiro
// numa transação, com teto de 8, um ícone por dono e `order` renumerada. O formato da URL é do Core.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataError, deleteUser, listFooterLinks, prisma, replaceFooterLinks } from "@/lib/db";
import {
  DEFAULT_MODE_ICON_PAIR,
  FOOTER_ICONS,
  MAX_FOOTER_LINKS,
  MODE_ICON_PAIRS,
  isFooterIcon,
  isModeIconPair,
} from "@/lib/footer-icons";
import { createUser, failTransactionAt, resetDatabase } from "./helpers.js";

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

/** @param {string} icon */
const link = (icon) => ({ icon, url: `https://exemplo.test/${icon}` });
/** @param {Array<{ icon: string, order: number }>} rows */
const icons = (rows) => rows.map((row) => row.icon);

describe("footer-icons: as listas fechadas (ADR-035, ADR-037)", () => {
  it("são os dezoito ícones da ADR-035, na ordem do seletor, sem repetição", () => {
    expect([...FOOTER_ICONS]).toEqual([
      "github", "linkedin", "instagram", "youtube", "x", "facebook", "bluesky", "mastodon", "telegram",
      "whatsapp", "twitch", "discord", "lattes", "orcid", "researchgate", "googlescholar", "website", "email",
    ]);
    expect(new Set(FOOTER_ICONS).size).toBe(18);
  });

  it("são os quatro pares de ícones do modo, e o padrão é o primeiro (sun_moon)", () => {
    expect([...MODE_ICON_PAIRS]).toEqual(["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);
    expect(DEFAULT_MODE_ICON_PAIR).toBe("sun_moon");
  });

  it("o teto é 8", () => {
    expect(MAX_FOOTER_LINKS).toBe(8);
  });

  it("isFooterIcon e isModeIconPair só aceitam os valores das listas", () => {
    expect(FOOTER_ICONS.every((icon) => isFooterIcon(icon))).toBe(true);
    expect(MODE_ICON_PAIRS.every((pair) => isModeIconPair(pair))).toBe(true);
    for (const outro of ["", "GitHub", "gitlab", "constructor", "toString", null, undefined, 1, ["github"]]) {
      expect(isFooterIcon(outro), String(outro)).toBe(false);
    }
    expect(isModeIconPair("sun")).toBe(false);
    expect(isModeIconPair(undefined)).toBe(false);
  });

  it("é um módulo puro: não importa nada (nem Prisma, nem Next.js)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../src/lib/footer-icons.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("a lista de pares coincide com o padrão do schema (Configuration.modeIconPair)", async () => {
    const { readFile } = await import("node:fs/promises");
    const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schema).toMatch(new RegExp(`modeIconPair\\s+String\\s+@default\\("${DEFAULT_MODE_ICON_PAIR}"\\)`));
  });
});

describe("db.js: rodapé por ícones", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    if (/** @type {any} */ (prisma.$transaction).mockRestore) /** @type {any} */ (prisma.$transaction).mockRestore();
  });

  describe("listFooterLinks", () => {
    it("rodapé vazio devolve lista vazia, para o site e para o usuário", async () => {
      const ana = await createUser("ana");

      expect(await listFooterLinks(null)).toEqual([]);
      expect(await listFooterLinks(ana.id)).toEqual([]);
    });

    it("cada dono vê só o seu: o rodapé do site, o da Ana e o da Bia não se misturam", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceFooterLinks(null, [link("github")]);
      await replaceFooterLinks(ana.id, [link("youtube"), link("email")]);
      await replaceFooterLinks(bia.id, [link("orcid")]);

      expect(icons(await listFooterLinks(null))).toEqual(["github"]);
      expect(icons(await listFooterLinks(ana.id))).toEqual(["youtube", "email"]);
      expect(icons(await listFooterLinks(bia.id))).toEqual(["orcid"]);
    });

    it("dono ausente (undefined) ou vazio é INVALID_INPUT: nunca lê o rodapé de todos", async () => {
      await replaceFooterLinks(null, [link("github")]);

      expect((await failure(listFooterLinks(/** @type {any} */ (undefined)))).code).toBe("INVALID_INPUT");
      expect((await failure(listFooterLinks(""))).code).toBe("INVALID_INPUT");
      expect((await failure(replaceFooterLinks(/** @type {any} */ (undefined), []))).code).toBe("INVALID_INPUT");
    });

    it("devolve id, dono, ícone, URL e ordem", async () => {
      const ana = await createUser("ana");
      await replaceFooterLinks(ana.id, [link("github")]);

      const [primeiro] = await listFooterLinks(ana.id);

      expect(primeiro).toEqual({ id: expect.any(String), ownerId: ana.id, icon: "github", url: "https://exemplo.test/github", order: 0 });
    });
  });

  describe("replaceFooterLinks: substitui o rodapé inteiro", () => {
    it("grava na ordem recebida e renumera order de 0 a n-1, ignorando o order enviado", async () => {
      const ana = await createUser("ana");

      const gravado = await replaceFooterLinks(ana.id, [
        { ...link("github"), order: 40 },
        { ...link("discord"), order: 7 },
        { ...link("email"), order: 7 },
      ].map((l) => /** @type {any} */ (l)));

      expect(gravado.map((l) => [l.icon, l.order])).toEqual([["github", 0], ["discord", 1], ["email", 2]]);
      expect(icons(await listFooterLinks(ana.id))).toEqual(["github", "discord", "email"]);
    });

    it("reordenar e remover: o novo lote substitui o anterior", async () => {
      const ana = await createUser("ana");
      await replaceFooterLinks(ana.id, [link("github"), link("discord"), link("email")]);

      const novo = await replaceFooterLinks(ana.id, [link("email"), link("github")]);

      expect(novo.map((l) => [l.icon, l.order])).toEqual([["email", 0], ["github", 1]]);
      expect(await prisma.footerLink.count({ where: { ownerId: ana.id } })).toBe(2);
    });

    it("lista vazia esvazia o rodapé (do dono, sem tocar nos outros)", async () => {
      const ana = await createUser("ana");
      await replaceFooterLinks(null, [link("github")]);
      await replaceFooterLinks(ana.id, [link("github"), link("email")]);

      expect(await replaceFooterLinks(ana.id, [])).toEqual([]);

      expect(await listFooterLinks(ana.id)).toEqual([]);
      expect(icons(await listFooterLinks(null))).toEqual(["github"]);
    });

    it("o mesmo ícone pode estar no rodapé do site e no de cada usuário (a unicidade é por dono)", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");

      await replaceFooterLinks(null, [link("github")]);
      await replaceFooterLinks(ana.id, [link("github")]);
      await replaceFooterLinks(bia.id, [link("github")]);

      expect(await prisma.footerLink.count({ where: { icon: "github" } })).toBe(3);
    });

    it("aceita cada um dos dezoito ícones", async () => {
      const ana = await createUser("ana");
      for (const icon of FOOTER_ICONS) {
        expect(icons(await replaceFooterLinks(ana.id, [link(icon)])), icon).toEqual([icon]);
      }
    });

    it("a URL é guardada como veio: o formato (https, mailto) é validado pelo Core, não aqui", async () => {
      const ana = await createUser("ana");

      const gravado = await replaceFooterLinks(ana.id, [
        { icon: "website", url: "http://exemplo.test/inseguro" },
        { icon: "email", url: "mailto:ana@exemplo.test" },
      ]);

      expect(gravado.map((l) => l.url)).toEqual(["http://exemplo.test/inseguro", "mailto:ana@exemplo.test"]);
    });
  });

  describe("teto de 8 links por dono", () => {
    it("oito é aceito, para o usuário e para o site", async () => {
      const ana = await createUser("ana");
      const oito = FOOTER_ICONS.slice(0, 8).map(link);

      expect(await replaceFooterLinks(ana.id, oito)).toHaveLength(8);
      expect(await replaceFooterLinks(null, oito)).toHaveLength(8);
    });

    it("nove é INVALID_INPUT e o rodapé anterior permanece, para o usuário e para o site", async () => {
      const ana = await createUser("ana");
      await replaceFooterLinks(ana.id, [link("github")]);
      await replaceFooterLinks(null, [link("discord")]);
      const nove = FOOTER_ICONS.slice(0, 9).map(link);

      expect(await failure(replaceFooterLinks(ana.id, nove))).toMatchObject({ code: "INVALID_INPUT", details: { field: "links", max: 8 } });
      expect((await failure(replaceFooterLinks(null, nove))).code).toBe("INVALID_INPUT");

      expect(icons(await listFooterLinks(ana.id))).toEqual(["github"]);
      expect(icons(await listFooterLinks(null))).toEqual(["discord"]);
    });

    it("o teto é por dono: o rodapé cheio da Ana não impede o da Bia", async () => {
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceFooterLinks(ana.id, FOOTER_ICONS.slice(0, 8).map(link));

      expect(await replaceFooterLinks(bia.id, FOOTER_ICONS.slice(0, 8).map(link))).toHaveLength(8);
    });
  });

  describe("um item inválido recusa o lote inteiro (o rodapé anterior permanece)", () => {
    it.each([
      ["ícone repetido", [link("github"), link("discord"), link("github")], { field: "icon", index: 2 }],
      ["ícone fora da lista", [link("github"), { icon: "gitlab", url: "https://exemplo.test" }], { field: "icon", index: 1 }],
      ["ícone em maiúsculas", [{ icon: "GitHub", url: "https://exemplo.test" }], { field: "icon", index: 0 }],
      ["ícone ausente", [{ url: "https://exemplo.test" }], { field: "icon", index: 0 }],
      ["URL vazia", [link("github"), { icon: "discord", url: "" }], { field: "url", index: 1 }],
      ["URL em branco", [{ icon: "discord", url: "   " }], { field: "url", index: 0 }],
      ["URL que não é texto", [{ icon: "discord", url: 42 }], { field: "url", index: 0 }],
      ["item nulo", [link("github"), null], { field: "icon", index: 1 }],
    ])("%s", async (_nome, lote, details) => {
      const ana = await createUser("ana");
      await replaceFooterLinks(ana.id, [link("youtube"), link("email")]);

      const erro = await failure(replaceFooterLinks(ana.id, /** @type {any} */ (lote)));

      expect(erro).toMatchObject({ code: "INVALID_INPUT", details });
      expect(icons(await listFooterLinks(ana.id))).toEqual(["youtube", "email"]);
    });

    it("ícone repetido no rodapé do SITE também é recusado", async () => {
      await replaceFooterLinks(null, [link("github")]);

      expect((await failure(replaceFooterLinks(null, [link("discord"), link("discord")]))).code).toBe("INVALID_INPUT");

      expect(icons(await listFooterLinks(null))).toEqual(["github"]);
    });

    it("o lote que não é uma lista é INVALID_INPUT", async () => {
      for (const invalido of [undefined, null, "github", { icon: "github" }]) {
        expect((await failure(replaceFooterLinks(null, /** @type {any} */ (invalido)))).code, String(invalido)).toBe("INVALID_INPUT");
      }
    });
  });

  describe("atomicidade e integridade", () => {
    it("o lote é atômico: se a gravação do terceiro link falha, o rodapé anterior fica intacto", async () => {
      const ana = await createUser("ana");
      await replaceFooterLinks(ana.id, [link("youtube"), link("email")]);
      const antes = await listFooterLinks(ana.id);
      const spy = failTransactionAt("footerLink", "create", { after: 2 });

      await expect(replaceFooterLinks(ana.id, [link("github"), link("discord"), link("twitch"), link("orcid")])).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(await listFooterLinks(ana.id)).toEqual(antes);
    });

    it("o lote do SITE também é atômico", async () => {
      await replaceFooterLinks(null, [link("youtube")]);
      const spy = failTransactionAt("footerLink", "create", { after: 1 });

      await expect(replaceFooterLinks(null, [link("github"), link("discord")])).rejects.toThrow("falha injetada");
      spy.mockRestore();

      expect(icons(await listFooterLinks(null))).toEqual(["youtube"]);
    });

    it("usuário inexistente é NOT_FOUND e nada é gravado", async () => {
      expect((await failure(replaceFooterLinks("fantasma", [link("github")]))).code).toBe("NOT_FOUND");
      expect(await prisma.footerLink.count()).toBe(0);
    });

    it("o banco também recusa ícone repetido do mesmo dono, do usuário e do site (rede de segurança)", async () => {
      const ana = await createUser("ana");
      await prisma.footerLink.create({ data: { ownerId: ana.id, icon: "github", url: "https://a.test", order: 0 } });
      await prisma.footerLink.create({ data: { ownerId: null, icon: "github", url: "https://a.test", order: 0 } });

      await expect(prisma.footerLink.create({ data: { ownerId: ana.id, icon: "github", url: "https://b.test", order: 1 } })).rejects.toBeTruthy();
      // o índice parcial: o @@unique sozinho deixaria passar (NULL é distinto de NULL)
      await expect(prisma.footerLink.create({ data: { ownerId: null, icon: "github", url: "https://b.test", order: 1 } })).rejects.toBeTruthy();
      expect(await prisma.footerLink.count()).toBe(2);
    });

    it("excluir o usuário apaga o rodapé dele e preserva os dos outros e o do site", async () => {
      const admin = await createUser("admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
      const ana = await createUser("ana");
      const bia = await createUser("bia");
      await replaceFooterLinks(null, [link("github")]);
      await replaceFooterLinks(ana.id, [link("github"), link("email")]);
      await replaceFooterLinks(bia.id, [link("orcid")]);

      await deleteUser(ana.id);

      expect(await prisma.footerLink.count({ where: { ownerId: ana.id } })).toBe(0);
      expect(icons(await listFooterLinks(bia.id))).toEqual(["orcid"]);
      expect(icons(await listFooterLinks(null))).toEqual(["github"]);
    });
  });
});
