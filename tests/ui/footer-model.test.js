// Modelo do rodapé por ícones (RF24, RN17; ADR-035): a lista fechada, o teto de 8, um por ícone, a regra
// de URL de cada ícone (`https://`; `mailto:` só no e-mail) e o que o rodapé aceita renderizar.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMAIL_ICON,
  FOOTER_ICONS,
  FOOTER_ICON_LABELS,
  MAX_FOOTER_LINKS,
  MESSAGES,
  emailAddressOf,
  fieldOfUrl,
  isEmailAddress,
  isFooterIcon,
  linkUrlError,
  renderableLinks,
  urlOfField,
  validateLinks,
} from "@/components/layout/footer-model";

describe("a lista fechada (ADR-035, item 3)", () => {
  it("tem os dezoito ícones, na ordem do seletor, sem repetição", () => {
    expect([...FOOTER_ICONS]).toEqual([
      "github", "linkedin", "instagram", "youtube", "x", "facebook", "bluesky", "mastodon", "telegram", "whatsapp",
      "twitch", "discord", "lattes", "orcid", "researchgate", "googlescholar", "website", "email",
    ]);
    expect(new Set(FOOTER_ICONS).size).toBe(18);
  });

  it("todo ícone tem um nome acessível em português, e só eles", () => {
    expect(Object.keys(FOOTER_ICON_LABELS).sort()).toEqual([...FOOTER_ICONS].sort());
    expect(FOOTER_ICON_LABELS.github).toBe("GitHub");
    expect(FOOTER_ICON_LABELS.email).toBe("E-mail");
    expect(FOOTER_ICON_LABELS.googlescholar).toBe("Google Acadêmico");
  });

  it("o teto é de 8 links", () => {
    expect(MAX_FOOTER_LINKS).toBe(8);
  });

  it("repete a lista do Dados (src/lib/footer-icons.js) quando o módulo já está na árvore", async () => {
    const file = path.resolve(import.meta.dirname, "../../src/lib/footer-icons.js");
    if (!existsSync(file)) return; // o módulo do Dados entra com o M-039; até lá não há o que comparar
    const shared = await import(/* @vite-ignore */ file);
    expect([...FOOTER_ICONS]).toEqual([...shared.FOOTER_ICONS]);
    expect(MAX_FOOTER_LINKS).toBe(shared.MAX_FOOTER_LINKS);
  });

  it("isFooterIcon só aceita os da lista (nada herdado do protótipo)", () => {
    expect(isFooterIcon("github")).toBe(true);
    for (const value of ["GitHub", "tiktok", "", "constructor", "__proto__", null, undefined, 3]) expect(isFooterIcon(value)).toBe(false);
  });
});

describe("linkUrlError (RN17)", () => {
  it.each(["https://github.com/maria", "https://exemplo.com", "  https://exemplo.com/a?b=1#c  ", "HTTPS://EXEMPLO.COM"])("aceita %j", (url) => {
    expect(linkUrlError("github", url)).toBeNull();
  });

  it.each(["http://exemplo.com", "javascript:alert(1)", "data:text/html,x", "ftp://exemplo.com", "//exemplo.com", "exemplo.com", "https:/exemplo.com", "mailto:a@b.co", "https://", "https://a b.com", "file:///etc/passwd"])(
    "recusa %j num ícone de rede",
    (url) => {
      expect(linkUrlError("github", url)).toBe(MESSAGES.https);
    },
  );

  it("endereço vazio pede o endereço", () => {
    expect(linkUrlError("github", "   ")).toBe(MESSAGES.required);
    expect(linkUrlError(EMAIL_ICON, "")).toBe(MESSAGES.required);
  });

  it("o ícone de e-mail aceita só mailto: com e-mail válido, e https não vale nele", () => {
    expect(linkUrlError(EMAIL_ICON, "mailto:maria@exemplo.com")).toBeNull();
    expect(linkUrlError(EMAIL_ICON, "MAILTO:maria@exemplo.com")).toBeNull();
    for (const url of ["https://exemplo.com", "maria@exemplo.com", "mailto:", "mailto:maria", "mailto:maria@", "mailto:@exemplo.com", "mailto:a b@exemplo.com", "mailto:maria@exemplo.com?subject=oi", "javascript:alert(1)"]) {
      expect(linkUrlError(EMAIL_ICON, url)).toBe(MESSAGES.email);
    }
  });

  it("mailto: não vale em ícone de rede (o esquema certo é por ícone)", () => {
    for (const icon of FOOTER_ICONS.filter((name) => name !== EMAIL_ICON)) expect(linkUrlError(icon, "mailto:a@b.co")).toBe(MESSAGES.https);
  });
});

describe("o campo do e-mail e a URL enviada", () => {
  it("o endereço puro e o já prefixado dão o mesmo mailto:", () => {
    expect(urlOfField(EMAIL_ICON, "maria@exemplo.com")).toBe("mailto:maria@exemplo.com");
    expect(urlOfField(EMAIL_ICON, "  mailto:maria@exemplo.com ")).toBe("mailto:maria@exemplo.com");
    expect(urlOfField("github", "  https://github.com/x  ")).toBe("https://github.com/x");
  });

  it("o campo mostra o e-mail sem o prefixo; os outros ícones, a URL inteira", () => {
    expect(fieldOfUrl(EMAIL_ICON, "mailto:maria@exemplo.com")).toBe("maria@exemplo.com");
    expect(fieldOfUrl("github", "https://github.com/x")).toBe("https://github.com/x");
    expect(emailAddressOf("mailto: a@b.co ")).toBe("a@b.co");
  });

  it("isEmailAddress: simples, sem espaços nem vírgulas", () => {
    expect(isEmailAddress("a@b.co")).toBe(true);
    for (const value of ["a@b", "a b@c.de", "a,b@c.de", "@c.de", "a@.de", "a@c.", `${"a".repeat(250)}@b.co`]) expect(isEmailAddress(value)).toBe(false);
  });
});

describe("renderableLinks: o que o rodapé pode desenhar", () => {
  it("mantém a ordem, descarta ícone fora da lista, URL inválida e ícone repetido", () => {
    const links = renderableLinks([
      { icon: "github", url: "https://github.com/a" },
      { icon: "tiktok", url: "https://tiktok.com/a" },
      { icon: "youtube", url: "javascript:alert(1)" },
      { icon: "github", url: "https://github.com/b" },
      { icon: "email", url: "https://exemplo.com" },
      { icon: "email", url: "mailto:oi@exemplo.com" },
      null,
      { icon: "x" },
    ]);
    expect(links).toEqual([
      { icon: "github", url: "https://github.com/a" },
      { icon: "email", url: "mailto:oi@exemplo.com" },
    ]);
  });

  it("corta em 8", () => {
    const many = FOOTER_ICONS.filter((icon) => icon !== "email").map((icon) => ({ icon, url: `https://exemplo.com/${icon}` }));
    expect(many.length).toBeGreaterThan(8);
    expect(renderableLinks(many)).toHaveLength(8);
  });

  it("entrada que não é lista dá lista vazia", () => {
    for (const value of [null, undefined, "x", {}, 3]) expect(renderableLinks(value)).toEqual([]);
  });
});

describe("validateLinks: a lista inteira, antes de enviar", () => {
  it("uma lista válida não tem erro", () => {
    expect(validateLinks([{ icon: "github", url: "https://github.com/a" }, { icon: "email", url: "mailto:a@b.co" }])).toEqual({ rows: {}, general: "" });
    expect(validateLinks([])).toEqual({ rows: {}, general: "" });
  });

  it("a mensagem vai na posição do item", () => {
    const { rows } = validateLinks([
      { icon: "github", url: "https://github.com/a" },
      { icon: "youtube", url: "http://youtube.com/a" },
      { icon: "email", url: "mailto:" },
    ]);
    expect(rows).toEqual({ 1: MESSAGES.https, 2: MESSAGES.email });
  });

  it("dois links com o mesmo ícone: o segundo é recusado", () => {
    const { rows } = validateLinks([{ icon: "github", url: "https://github.com/a" }, { icon: "github", url: "https://github.com/b" }]);
    expect(rows).toEqual({ 1: MESSAGES.duplicated });
  });

  it("mais de 8 links: erro geral", () => {
    const nine = FOOTER_ICONS.slice(0, 9).map((icon) => ({ icon, url: `https://exemplo.com/${icon}` }));
    expect(validateLinks(nine).general).toBe(MESSAGES.full);
    expect(validateLinks(nine.slice(0, 8)).general).toBe("");
  });

  it("um ícone fora da lista é recusado", () => {
    expect(validateLinks([{ icon: "tiktok", url: "https://tiktok.com/a" }]).rows[0]).toBeTruthy();
  });
});
