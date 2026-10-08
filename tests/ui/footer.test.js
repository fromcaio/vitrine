// @vitest-environment jsdom
// O rodapé por ícones (RF24, RN17; ADR-035) e os ícones do Simple Icons inline: os links, o `rel`, o
// `target`, o nome acessível, a defesa em profundidade contra URL ruim, o teto de 8, nenhuma imagem
// externa e a cobertura da lista fechada (marca do pacote ou glifo neutro próprio).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BRAND_ICONS, BRAND_ICONS_SOURCE } from "@/components/layout/brand-icons";
import { Footer } from "@/components/layout/Footer";
import { FooterIcon, hasBrandMark } from "@/components/layout/FooterIcon";
import { FOOTER_ICONS } from "@/components/layout/footer-model";

afterEach(cleanup);

const LINKS = [
  { icon: "github", url: "https://github.com/maria" },
  { icon: "orcid", url: "https://orcid.org/0000-0000-0000-0000" },
  { icon: "email", url: "mailto:maria@exemplo.com" },
];

describe("Footer", () => {
  it("gera os direitos do nome e do ano", () => {
    render(<Footer name="Espaço da Maria" links={LINKS} year={2026} />);
    expect(screen.getByRole("contentinfo").textContent).toContain("© 2026 Espaço da Maria. Todos os direitos reservados.");
  });

  it("o ano padrão é o corrente", () => {
    render(<Footer name="X" />);
    expect(screen.getByRole("contentinfo").textContent).toContain(`© ${new Date().getFullYear()} X.`);
  });

  it("os links na ordem recebida, cada um com o nome acessível do ícone (exato)", () => {
    render(<Footer name="X" links={LINKS} year={2026} />);
    const nav = screen.getByRole("navigation", { name: "Links do rodapé" });
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("aria-label"))).toEqual(["GitHub", "ORCID", "E-mail"]);
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe("https://github.com/maria");
  });

  it("os https abrem em nova aba com rel noopener noreferrer, e o aviso fica na descrição (title)", () => {
    render(<Footer name="X" links={LINKS} year={2026} />);
    for (const name of ["GitHub", "ORCID"]) {
      const a = screen.getByRole("link", { name });
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("title")).toBe(`${name} (abre em uma nova aba)`);
    }
  });

  it("o mailto: não abre aba nem leva rel de aba nova", () => {
    render(<Footer name="X" links={LINKS} year={2026} />);
    const mail = screen.getByRole("link", { name: "E-mail" });
    expect(mail.getAttribute("href")).toBe("mailto:maria@exemplo.com");
    expect(mail.getAttribute("target")).toBeNull();
    expect(mail.getAttribute("rel")).toBeNull();
  });

  it("sem links (vazio, nulo ou ausente) não há navegação nem lista vazia", () => {
    for (const links of [[], null, undefined]) {
      const { unmount } = render(<Footer name="X" links={links} year={2026} />);
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
      unmount();
    }
  });

  it("defesa em profundidade: o que a regra recusa nunca vira href", () => {
    render(
      <Footer
        name="X"
        year={2026}
        links={[
          { icon: "github", url: "javascript:alert(1)" },
          { icon: "youtube", url: "http://youtube.com/x" },
          { icon: "instagram", url: "data:text/html,x" },
          { icon: "email", url: "https://exemplo.com" },
          { icon: "tiktok", url: "https://tiktok.com/x" },
          { icon: "x", url: "https://x.com/maria" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["https://x.com/maria"]);
  });

  it("no máximo 8 links, e um por ícone", () => {
    const many = FOOTER_ICONS.filter((icon) => icon !== "email").map((icon) => ({ icon, url: `https://exemplo.com/${icon}` }));
    render(<Footer name="X" links={[...many, { icon: "github", url: "https://github.com/repetido" }]} year={2026} />);
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe("https://exemplo.com/github");
  });

  it("não carrega nenhuma imagem: os ícones são SVG inline e decorativos", () => {
    const { container } = render(<Footer name="X" links={LINKS} year={2026} />);
    expect(container.querySelector("img")).toBeNull();
    const icons = container.querySelectorAll("a svg");
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("o texto do nome é texto: HTML no nome não vira marcação", () => {
    const { container } = render(<Footer name={'<img src=x onerror="alert(1)">'} year={2026} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});

describe("os ícones do Simple Icons (inline, CC0)", () => {
  it("o módulo gerado diz de onde veio: Simple Icons, CC0", () => {
    expect(BRAND_ICONS_SOURCE.package).toBe("simple-icons");
    expect(BRAND_ICONS_SOURCE.license).toBe("CC0-1.0");
    expect(BRAND_ICONS_SOURCE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("as marcas que o pacote tem estão no módulo, com o caminho do desenho; só elas", () => {
    expect(Object.keys(BRAND_ICONS).sort()).toEqual(
      ["bluesky", "discord", "facebook", "github", "googlescholar", "instagram", "mastodon", "orcid", "researchgate", "telegram", "twitch", "whatsapp", "x", "youtube"].sort(),
    );
    for (const entry of Object.values(BRAND_ICONS)) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.path).toMatch(/^M[\d.\-\s]/);
    }
  });

  it("lattes e linkedin não existem no pacote: glifo neutro próprio, sem marca; website e email também", () => {
    for (const icon of ["lattes", "linkedin", "website", "email"]) {
      expect(hasBrandMark(icon)).toBe(false);
      const { container, unmount } = render(<FooterIcon icon={icon} />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.hasAttribute("data-brand")).toBe(false);
      unmount();
    }
  });

  it("todos os dezoito ícones desenham um SVG, e os de marca usam currentColor (seguem os tokens de tema)", () => {
    for (const icon of FOOTER_ICONS) {
      const { container, unmount } = render(<FooterIcon icon={icon} />);
      const svg = container.querySelector("svg");
      expect(svg, icon).toBeTruthy();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      if (hasBrandMark(icon)) {
        expect(svg?.getAttribute("fill")).toBe("currentColor");
        expect(svg?.querySelector("path")?.getAttribute("d")).toBe(BRAND_ICONS[icon].path);
      }
      unmount();
    }
  });

  it("um nome fora do protótipo não vira marca (constructor, __proto__)", () => {
    expect(hasBrandMark("constructor")).toBe(false);
    expect(hasBrandMark("toString")).toBe(false);
  });
});
