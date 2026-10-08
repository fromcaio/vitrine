// @vitest-environment jsdom
// Componentes de apresentação do espaço público (RF12 a RF14, RF24, RF29, RF30, RN14, RN17, RN28,
// RNF05; M17): landmarks, o envoltório .vitrine-tema, rodapé, redes sociais, diretório do portal,
// leitura do documento e o estado vazio da coleção. As medidas e o contraste vão ao navegador.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { PortalDirectory } from "@/components/layout/PortalDirectory";
import { PortalHome } from "@/components/layout/PortalHome";
import { SocialLinks } from "@/components/layout/SocialLinks";
import { SpaceLayout } from "@/components/layout/SpaceLayout";
import { navItemsOf } from "@/components/layout/space-paths";
import { DocumentView } from "@/components/reading/DocumentView";
import { EmptyCollection } from "@/components/reading/EmptyCollection";
import { node, sampleCollection } from "./space-helpers";

// O Markdown é testado à parte (markdown-renderer.test.js): aqui basta ver que o texto chega a ele.
vi.mock("@/components/markdown/MarkdownRenderer", async () => {
  const { createElement } = await import("react");
  return { MarkdownRenderer: ({ markdown }) => createElement("div", { "data-testid": "renderizado" }, markdown) };
});

afterEach(cleanup);

const THEME = {
  "--vitrine-light-primary": "#2563EB",
  "--vitrine-light-secondary": "#1E293B",
  "--vitrine-light-accent": "#B45309",
  "--vitrine-light-on-primary": "#FFFFFF",
  "--vitrine-light-on-secondary": "#FFFFFF",
  "--vitrine-dark-primary": "#60A5FA",
  "--vitrine-dark-secondary": "#CBD5E1",
  "--vitrine-dark-accent": "#FBBF24",
  "--vitrine-dark-on-primary": "#000000",
  "--vitrine-dark-on-secondary": "#000000",
};

const ALL_LINKS = {
  discordUrl: "https://discord.gg/exemplo",
  githubUrl: "https://github.com/exemplo",
  youtubeUrl: "https://youtube.com/@exemplo",
  instagramUrl: "https://instagram.com/exemplo",
  linkedinUrl: "https://linkedin.com/in/exemplo",
  twitchUrl: "https://twitch.tv/exemplo",
};

function renderLayout(props = {}) {
  const collection = sampleCollection();
  return render(
    <SpaceLayout
      themeStyle={THEME}
      name="Espaço da Maria"
      homeHref="/maria"
      navItems={navItemsOf([collection], { basePath: "/maria", activeSlug: "algoritmos" })}
      collection={collection}
      basePath="/maria"
      activePath={["algoritmos", "variaveis"]}
      socialLinks={ALL_LINKS}
      year={2026}
      {...props}
    >
      <h1>Página</h1>
    </SpaceLayout>,
  );
}

describe("SpaceLayout: landmarks e atalho (RNF05)", () => {
  it("tem banner, navegações rotuladas, main e contentinfo, nessa ordem no documento", () => {
    const { container } = renderLayout();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Coleções" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /^Coleção Algoritmos/ })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Redes sociais" })).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const tags = [...container.querySelectorAll("header, main, footer")].map((el) => el.tagName);
    expect(tags).toEqual(["HEADER", "MAIN", "FOOTER"]);
  });

  it("o primeiro elemento focável é o atalho 'Pular para o conteúdo', que aponta para o main", () => {
    renderLayout();
    const first = document.querySelector("a, button");
    expect(first?.textContent).toBe("Pular para o conteúdo");
    expect(first?.getAttribute("href")).toBe("#conteudo-principal");
    const main = screen.getByRole("main");
    expect(main.id).toBe("conteudo-principal");
    expect(main.getAttribute("tabindex")).toBe("-1");
  });

  it("a ordem de tabulação: atalho, nome, seletor de modo, coleções, sidebar, rodapé", () => {
    renderLayout();
    const names = [...document.querySelectorAll("a, button")].map((el) => el.getAttribute("aria-label") ?? el.textContent);
    const at = (/** @type {RegExp | string} */ needle) => names.findIndex((name) => (needle instanceof RegExp ? needle.test(name ?? "") : name === needle));
    const order = [at("Pular para o conteúdo"), at("Espaço da Maria"), at("Modo claro"), at("Algoritmos e Estruturas de Dados"), at(/^Menu:/), at(/^GitHub/)];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("renderiza a página dentro do main", () => {
    renderLayout();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Página" })).toBeTruthy();
  });

  it("sem coleção corrente (início do espaço, portal), não há sidebar", () => {
    renderLayout({ collection: null, activePath: [] });
    expect(screen.queryByRole("navigation", { name: /^Coleção Algoritmos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Menu:/ })).toBeNull();
  });
});

describe("SpaceLayout: envoltório .vitrine-tema (§5.9)", () => {
  const wrapper = () => /** @type {HTMLElement} */ (document.querySelector(".vitrine-tema"));

  it("a classe vitrine-tema e o style com as variáveis das duas paletas estão no MESMO elemento", () => {
    renderLayout();
    const element = wrapper();
    expect(element).toBeTruthy();
    const style = element.getAttribute("style") ?? "";
    for (const [name, value] of Object.entries(THEME)) expect(style.toLowerCase()).toContain(`${name}: ${value.toLowerCase()}`);
    expect(document.querySelectorAll(".vitrine-tema")).toHaveLength(1);
    // O elemento do style é o que contém tudo (a barra, a sidebar, o main e o rodapé).
    expect(element.contains(screen.getByRole("banner"))).toBe(true);
    expect(element.contains(screen.getByRole("contentinfo"))).toBe(true);
  });

  it("sem themeStyle, o atributo style é omitido e valem as paletas padrão do CSS", () => {
    renderLayout({ themeStyle: null });
    expect(wrapper().hasAttribute("style")).toBe(false);
    expect(wrapper().className).toContain("vitrine-tema");
  });

  it("descarta tudo que não for uma das dez variáveis com valor #RRGGBB (injeção de CSS)", () => {
    renderLayout({
      themeStyle: {
        ...THEME,
        "--vitrine-light-primary": "red; background: url(https://evil.example/x)",
        "--vitrine-dark-primary": "#12345",
        "background-image": "url(https://evil.example/y)",
        "--outra-variavel": "#ffffff",
        "--vitrine-light-extra": "#ffffff",
        "--vitrine-dark-accent": 123,
      },
    });
    const style = wrapper().getAttribute("style") ?? "";
    expect(style).not.toMatch(/evil|url\(|background-image|--outra|--vitrine-light-extra/);
    expect(style.toLowerCase()).not.toContain("--vitrine-light-primary");
    expect(style.toLowerCase()).not.toContain("--vitrine-dark-primary");
    expect(style.toLowerCase()).not.toContain("--vitrine-dark-accent");
    expect(style.toLowerCase()).toContain("--vitrine-light-secondary: #1e293b");
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = renderLayout();
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|text-black|(bg|text|border)-(slate|gray|zinc|neutral|red|blue)-\d/);
  });
});

describe("Navbar (RF13)", () => {
  const items = navItemsOf([node("C", "c", "COLLECTION"), node("Python", "python", "COLLECTION")], { basePath: "/maria", activeSlug: "python" });

  it("mostra o nome, as coleções raiz e marca a corrente com aria-current", () => {
    render(<Navbar name="Espaço da Maria" homeHref="/maria" items={items} />);
    expect(screen.getByRole("link", { name: "Espaço da Maria" }).getAttribute("href")).toBe("/maria");
    expect(screen.getByRole("link", { name: "C" }).getAttribute("href")).toBe("/maria/c");
    expect(screen.getByRole("link", { name: "Python" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "C" }).getAttribute("aria-current")).toBeNull();
  });

  it("o item corrente também se distingue sem a cor (sublinhado e negrito)", () => {
    render(<Navbar name="X" homeHref="/x" items={items} />);
    expect(screen.getByRole("link", { name: "Python" }).className).toMatch(/underline/);
    expect(screen.getByRole("link", { name: "Python" }).className).toMatch(/font-semibold/);
    expect(screen.getByRole("link", { name: "C" }).className).not.toMatch(/(^| )underline( |$)/);
  });

  it("o seletor de modo de cor fica na barra", () => {
    render(<Navbar name="X" homeHref="/x" />);
    const group = screen.getByRole("group", { name: "Modo de cor" });
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Modo claro", "Modo escuro"]);
    expect(screen.getByRole("banner").contains(group)).toBe(true);
  });

  it("o logotipo só aparece quando existe, decorativo (o nome já está ao lado)", () => {
    const { container, rerender } = render(<Navbar name="X" homeHref="/x" />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Navbar name="X" homeHref="/x" logoUrl="https://exemplo.com/logo.png" />);
    const img = /** @type {HTMLImageElement} */ (container.querySelector("img"));
    expect(img.getAttribute("src")).toBe("https://exemplo.com/logo.png");
    expect(img.getAttribute("alt")).toBe("");
  });

  it("sem coleções, não há a navegação de coleções", () => {
    render(<Navbar name="X" homeHref="/x" items={[]} />);
    expect(screen.queryByRole("navigation", { name: "Coleções" })).toBeNull();
  });

  it("um nome longo quebra de linha em vez de estourar a barra", () => {
    render(<Navbar name={"Nome-muito-longo-".repeat(8)} homeHref="/x" />);
    expect(screen.getByRole("link").querySelector("span")?.className).toMatch(/break-words/);
  });
});

describe("SocialLinks e Footer (RF24, RN17)", () => {
  it("mostra os seis, na ordem fixa, cada um com o nome da rede e rel noopener noreferrer", () => {
    render(<SocialLinks links={ALL_LINKS} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Discord (abre em uma nova aba)",
      "GitHub (abre em uma nova aba)",
      "YouTube (abre em uma nova aba)",
      "Instagram (abre em uma nova aba)",
      "LinkedIn (abre em uma nova aba)",
      "Twitch (abre em uma nova aba)",
    ]);
    for (const a of links) {
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    expect(links[1].getAttribute("href")).toBe("https://github.com/exemplo");
  });

  it("só as redes com link: campo vazio, em branco, nulo ou ausente não mostra o ícone", () => {
    render(<SocialLinks links={{ discordUrl: "", githubUrl: "https://github.com/x", youtubeUrl: "   ", instagramUrl: null, linkedinUrl: undefined }} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("aria-label"))).toEqual(["GitHub (abre em uma nova aba)"]);
  });

  it("descarta o que não é uma URL http(s) absoluta (defesa em profundidade, RN17)", () => {
    render(
      <SocialLinks
        links={{
          discordUrl: "javascript:alert(1)",
          githubUrl: "data:text/html,x",
          youtubeUrl: "//exemplo.com/x",
          instagramUrl: "ftp://exemplo.com",
          linkedinUrl: "exemplo.com/in/x",
          twitchUrl: "http://twitch.tv/x",
        }}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["http://twitch.tv/x"]);
  });

  it("sem nenhum link, não renderiza nada (nem a navegação vazia)", () => {
    const { container } = render(<SocialLinks links={{}} />);
    expect(container.innerHTML).toBe("");
    const { container: other } = render(<SocialLinks links={null} />);
    expect(other.innerHTML).toBe("");
  });

  it("os ícones são decorativos, ocultos das tecnologias assistivas", () => {
    const { container } = render(<SocialLinks links={ALL_LINKS} />);
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(6);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("o rodapé gera os direitos do nome e do ano e traz as redes", () => {
    render(<Footer name="Espaço da Maria" socialLinks={{ githubUrl: "https://github.com/x" }} year={2026} />);
    expect(screen.getByRole("contentinfo").textContent).toContain("© 2026 Espaço da Maria. Todos os direitos reservados.");
    expect(screen.getByRole("link", { name: /GitHub/ })).toBeTruthy();
  });

  it("o ano padrão é o corrente, e um espaço sem redes tem rodapé sem a navegação social", () => {
    render(<Footer name="X" />);
    expect(screen.getByRole("contentinfo").textContent).toContain(`© ${new Date().getFullYear()} X.`);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("PortalDirectory e PortalHome (RF30, RN28)", () => {
  const spaces = [
    { id: "u1", handle: "ana", name: "Espaço da Ana", description: "Notas de cálculo." },
    { id: "u2", handle: "bia", name: "Bia", description: null },
  ];

  it("um cartão por espaço, na ordem recebida, levando a /{handle}", () => {
    render(<PortalDirectory spaces={spaces} />);
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Espaço da Ana", "Bia"]);
    expect(screen.getByRole("link", { name: "Espaço da Ana" }).getAttribute("href")).toBe("/ana");
    expect(screen.getByRole("link", { name: "Bia" }).getAttribute("href")).toBe("/bia");
    expect(screen.getByText("Notas de cálculo.")).toBeTruthy();
    expect(screen.getByText("@bia")).toBeTruthy();
  });

  it("sem nenhum espaço, mostra 'Nenhum espaço público ainda.' e nenhuma lista", () => {
    render(<PortalDirectory spaces={[]} />);
    expect(screen.getByText("Nenhum espaço público ainda.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("heading", { name: "Espaços" })).toBeTruthy();
  });

  it("codifica o handle na URL", () => {
    render(<PortalDirectory spaces={[{ id: "u", handle: "a b", name: "N", description: null }]} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/a%20b");
  });

  it("o portal mostra o título, o texto em Markdown e o diretório", () => {
    render(<PortalHome title="Vitrine" body="# Bem-vindo" spaces={spaces} />);
    expect(screen.getByRole("heading", { level: 1, name: "Vitrine" })).toBeTruthy();
    expect(screen.getByTestId("renderizado").textContent).toBe("# Bem-vindo");
    expect(screen.getByRole("region", { name: "Espaços" })).toBeTruthy();
  });

  it("com o diretório desligado (spaces nulo), não mostra a lista nem o estado vazio", () => {
    render(<PortalHome title="Vitrine" body="texto" spaces={null} />);
    expect(screen.queryByRole("region", { name: "Espaços" })).toBeNull();
    expect(screen.queryByText("Nenhum espaço público ainda.")).toBeNull();
  });

  it("sem texto, mostra só o diretório; ligado e vazio, o estado vazio", () => {
    render(<PortalHome title="Vitrine" spaces={[]} />);
    expect(screen.queryByTestId("renderizado")).toBeNull();
    expect(screen.getByText("Nenhum espaço público ainda.")).toBeTruthy();
  });
});

describe("DocumentView e EmptyCollection (RF14, RN14)", () => {
  it("mostra o título como h1 e o texto pelo renderizador de Markdown", () => {
    render(<DocumentView title="Variáveis" body="# texto do documento" />);
    expect(screen.getByRole("heading", { level: 1, name: "Variáveis" })).toBeTruthy();
    expect(screen.getByTestId("renderizado").textContent).toBe("# texto do documento");
    expect(screen.getByRole("article")).toBeTruthy();
  });

  it("com vizinhos, mostra anterior e seguinte em uma navegação rotulada", () => {
    render(
      <DocumentView
        title="Atual"
        body="x"
        previous={{ title: "Antes", href: "/maria/c/antes" }}
        next={{ title: "Depois", href: "/maria/c/depois" }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Navegação entre documentos" });
    expect(within(nav).getByRole("link", { name: /Antes/ }).getAttribute("href")).toBe("/maria/c/antes");
    expect(within(nav).getByRole("link", { name: /Depois/ }).getAttribute("href")).toBe("/maria/c/depois");
    expect(within(nav).getByRole("link", { name: /Antes/ }).getAttribute("rel")).toBe("prev");
    expect(within(nav).getByRole("link", { name: /Depois/ }).getAttribute("rel")).toBe("next");
  });

  it("só um vizinho: só um link; nenhum: nenhuma navegação", () => {
    const { rerender } = render(<DocumentView title="A" next={{ title: "Depois", href: "/d" }} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/d"]);
    rerender(<DocumentView title="A" />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("um documento sem corpo não quebra", () => {
    render(<DocumentView title="Vazio" body={null} />);
    expect(screen.getByRole("heading", { name: "Vazio" })).toBeTruthy();
  });

  it("a coleção sem documento publicado mostra o estado vazio, e não um 404 (RN14)", () => {
    render(<EmptyCollection title="Python" homeHref="/maria" />);
    expect(screen.getByRole("heading", { level: 1, name: "Python" })).toBeTruthy();
    expect(screen.getByText("Esta coleção ainda não tem documentos publicados.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar ao início" }).getAttribute("href")).toBe("/maria");
  });
});
