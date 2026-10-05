// Renderização no servidor dos arquivos de rota (A-014 Parte 3a, item 5; ADR-030, ADR-025; CT47): o
// layout raiz ESTÁTICO (idioma, fontes, script do modo, sem banco e sem cores), os layouts do portal, do
// login e do painel, que aplicam a configuração do site no envoltório `.vitrine-tema`, e a página 404.
// Os componentes são renderizados de verdade, com react-dom/server, sobre o SQLite temporário do setup;
// não leem o .env. São substituídos só os módulos que dependem do servidor do Next.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As fontes do next/font são geradas no build; aqui bastam os nomes das variáveis CSS.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "fonte-sans-de-teste" }),
  Geist_Mono: () => ({ variable: "fonte-mono-de-teste" }),
}));
// A sessão do painel depende dos cabeçalhos da requisição: aqui, um usuário fictício.
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async () => ({ user: { name: "Ada Fictícia", email: "ada@exemplo.test" } })),
}));
vi.mock("@/app/admin/_lib/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => "/admin",
}));
// A função real do Dados continua em uso; o espião só permite contar as chamadas e simular falha.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getConfiguration: vi.fn(actual.getConfiguration) };
});

import { renderToStaticMarkup } from "react-dom/server";
import { requireSession } from "@/app/admin/_lib/session";
import AdminLayout, { generateMetadata as adminMetadata } from "@/app/admin/layout";
import RootLayout, { generateMetadata as rootMetadata } from "@/app/layout";
import LoginLayout, { generateMetadata as loginMetadata } from "@/app/login/layout";
import NotFound, { metadata as notFoundMetadata } from "@/app/not-found";
import PortalLayout, { generateMetadata as portalMetadata } from "@/app/(portal)/layout";
import { DEFAULT_SITE_DESCRIPTION } from "@/app/_lib/site";
import { COLOR_MODE_SCRIPT } from "@/components/layout/color-mode-script";
import { getConfiguration, prisma, updateConfiguration } from "@/lib/db";
import { textColorsOf } from "@/lib/theme";

const LIGHT = { primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#b45309" };
const DARK = { darkPrimaryColor: "#93c5fd", darkSecondaryColor: "#e2e8f0", darkAccentColor: "#fcd34d" };
const PALETTES = { ...LIGHT, ...DARK };

beforeEach(async () => {
  await prisma.configuration.deleteMany();
  vi.mocked(getConfiguration).mockClear();
  vi.mocked(requireSession).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Atributos da marca de abertura de um elemento do HTML renderizado. */
function attributesOf(html, tag) {
  const opening = html.match(new RegExp(`<${tag}(\\s[^>]*)?>`))?.[0] ?? "";
  return Object.fromEntries([...opening.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
}

/** Declarações de um atributo style serializado, como objeto. */
function declarationsOf(style = "") {
  return Object.fromEntries(
    style
      .split(";")
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
      }),
  );
}

/** Variáveis do envoltório `.vitrine-tema` de um HTML renderizado. */
const themeOf = (html) => declarationsOf(attributesOf(html, "div").style);

describe("RootLayout: estático, sem banco e sem cores (ADR-030)", () => {
  const render = () => renderToStaticMarkup(RootLayout({ children: "conteúdo da página" }));

  it("define só o idioma, as fontes e as classes de estrutura, sem `style` no <html>", () => {
    const html = render();

    expect(attributesOf(html, "html")).toEqual({
      lang: "pt-BR",
      class: "fonte-sans-de-teste fonte-mono-de-teste h-full antialiased",
    });
    expect(attributesOf(html, "html")).not.toHaveProperty("style");
    expect(attributesOf(html, "body")).toEqual({ class: "min-h-full flex flex-col" });
    expect(html).toContain("conteúdo da página");
  });

  it("não lê o banco: nenhuma consulta, nem no build", () => {
    render();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    render();

    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("o script do modo de cor está no <head>, antes do <body>, com o conteúdo fixo (CT47)", () => {
    const html = render();

    const head = html.match(/<head>(.*?)<\/head>/s)?.[1] ?? "";
    expect(head).toContain(`<script>${COLOR_MODE_SCRIPT}</script>`);
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<body"));
    expect(html.match(/<script/g)).toHaveLength(1);
    // O script aplica a classe dark antes da primeira pintura, lendo a escolha do leitor.
    expect(COLOR_MODE_SCRIPT).toContain('classList.add("dark")');
    expect(COLOR_MODE_SCRIPT).toContain("vitrine:modo");
  });

  it("o <html> leva suppressHydrationWarning: a classe dark muda antes da hidratação (CT47)", () => {
    const html = RootLayout({ children: null });

    expect(html.type).toBe("html");
    expect(html.props.suppressHydrationWarning).toBe(true);
    expect(html.props.lang).toBe("pt-BR");
  });

  it("os metadados padrão não consultam o banco: o nome 'Vitrine' e a descrição padrão; o metadataBase é a URL pública", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://vitrine.exemplo.test/");
    const metadata = rootMetadata();

    expect(metadata.title).toEqual({ default: "Vitrine", template: "%s | Vitrine" });
    expect(metadata.description).toBe(DEFAULT_SITE_DESCRIPTION);
    expect(metadata.metadataBase?.href).toBe("https://vitrine.exemplo.test/");
    expect(getConfiguration).not.toHaveBeenCalled();

    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(rootMetadata()).not.toHaveProperty("metadataBase");
  });
});

describe("PortalLayout: o título e a descrição do site (a paleta é da página, no SpaceLayout)", () => {
  it("devolve o filho sem envoltório e não consulta o banco ao renderizar", async () => {
    expect(PortalLayout({ children: "FILHO" })).toBe("FILHO");
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("generateMetadata usa o nome e a descrição do site, com o modelo '%s | nome'", async () => {
    await updateConfiguration({ siteName: "Notas de Aula", siteDescription: "Material didático de Cálculo" });

    expect(await portalMetadata()).toMatchObject({
      title: { absolute: "Notas de Aula", template: "%s | Notas de Aula" },
      description: "Material didático de Cálculo",
      alternates: { canonical: "/" },
      openGraph: { type: "website", title: "Notas de Aula", url: "/" },
    });
  });

  it("sem configuração (banco indisponível), usa os padrões; no build, nem consulta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));
    expect(await portalMetadata()).toMatchObject({
      title: { absolute: "Vitrine", template: "%s | Vitrine" },
      description: DEFAULT_SITE_DESCRIPTION,
    });

    vi.mocked(getConfiguration).mockClear();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect((await portalMetadata()).title.absolute).toBe("Vitrine");
    expect(getConfiguration).not.toHaveBeenCalled();
  });
});

describe.each([
  // O login tem o título completo "Entrar | nome" (o modelo do layout não vale para o título da página do
  // mesmo segmento).
  ["LoginLayout", LoginLayout, loginMetadata, (name) => ({ absolute: `Entrar | ${name}` })],
])("%s: a aparência do site no envoltório .vitrine-tema", (_name, Layout, metadataOf, titleOf) => {
  const render = async () => renderToStaticMarkup(await Layout({ children: "conteúdo da página" }));

  it("envolve o conteúdo em .vitrine-tema, com as variáveis das DUAS paletas gravadas", async () => {
    await updateConfiguration(PALETTES);

    const html = await render();
    const wrapper = attributesOf(html, "div");

    expect(wrapper.class).toBe("vitrine-tema flex flex-1 flex-col");
    expect(themeOf(html)).toEqual({
      "--vitrine-light-primary": "#1d4ed8",
      "--vitrine-light-secondary": "#0f172a",
      "--vitrine-light-accent": "#b45309",
      "--vitrine-light-on-primary": textColorsOf(PALETTES, "light").onPrimary,
      "--vitrine-light-on-secondary": textColorsOf(PALETTES, "light").onSecondary,
      "--vitrine-dark-primary": "#93c5fd",
      "--vitrine-dark-secondary": "#e2e8f0",
      "--vitrine-dark-accent": "#fcd34d",
      "--vitrine-dark-on-primary": textColorsOf(PALETTES, "dark").onPrimary,
      "--vitrine-dark-on-secondary": textColorsOf(PALETTES, "dark").onSecondary,
    });
    expect(html).toContain("conteúdo da página");
  });

  it("o texto sobre as cores é calculado por modo: a secundária clara pede branco; a noturna, preto", async () => {
    await updateConfiguration(PALETTES);

    const style = themeOf(await render());

    expect(style["--vitrine-light-on-secondary"]).toBe("#FFFFFF");
    expect(style["--vitrine-dark-on-secondary"]).toBe("#000000");
  });

  it("sem registro gravado, usa as paletas padrão do esquema (ADR-031) nos dois modos", async () => {
    const style = themeOf(await render());

    expect(style["--vitrine-light-primary"]).toBe("#2563eb");
    expect(style["--vitrine-dark-primary"]).toBe("#60a5fa");
    expect(style["--vitrine-dark-on-secondary"]).toBe("#000000");
  });

  it("uma paleta nova gravada aparece na renderização seguinte, por modo", async () => {
    await updateConfiguration(PALETTES);
    expect(themeOf(await render())["--vitrine-dark-primary"]).toBe("#93c5fd");

    await updateConfiguration({ darkPrimaryColor: "#1e3a8a" });
    const style = themeOf(await render());

    expect(style["--vitrine-dark-primary"]).toBe("#1e3a8a");
    expect(style["--vitrine-dark-on-primary"]).toBe(
      textColorsOf({ darkPrimaryColor: "#1e3a8a", darkSecondaryColor: "#e2e8f0" }, "dark").onPrimary,
    );
    expect(style["--vitrine-light-primary"]).toBe("#1d4ed8"); // o outro modo não mudou
  });

  it("com o banco indisponível, renderiza o envoltório sem style e sem lançar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));

    const html = await render();

    expect(attributesOf(html, "div")).toEqual({ class: "vitrine-tema flex flex-1 flex-col" });
    expect(html).toContain("conteúdo da página");
  });

  it("no next build não consulta o banco e sai sem style", async () => {
    await updateConfiguration(PALETTES);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    const html = await render();

    expect(attributesOf(html, "div")).not.toHaveProperty("style");
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("uma cor inválida lida do banco não chega ao HTML nem derruba a página", async () => {
    // Gravação direta, sem passar pela validação da API (RN09).
    await prisma.configuration.create({
      data: {
        id: "default",
        primaryColor: "red; background:url(x)",
        secondaryColor: "#0f172a",
        accentColor: "#12345",
        darkPrimaryColor: "javascript:alert(1)",
      },
    });

    const html = await render();
    const style = themeOf(html);

    expect(style["--vitrine-light-secondary"]).toBe("#0f172a");
    expect(style["--vitrine-light-on-secondary"]).toBe("#FFFFFF");
    expect(style).not.toHaveProperty("--vitrine-light-primary");
    expect(style).not.toHaveProperty("--vitrine-light-on-primary");
    expect(style).not.toHaveProperty("--vitrine-light-accent");
    expect(style).not.toHaveProperty("--vitrine-dark-primary");
    expect(html).not.toContain("url(x)");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("#12345");
  });

  it("generateMetadata usa o nome e a descrição do site, com o modelo '%s | nome'", async () => {
    await updateConfiguration({ siteName: "Notas de Aula", siteDescription: "Material didático de Cálculo" });

    expect(await metadataOf()).toEqual({
      title: titleOf("Notas de Aula"),
      description: "Material didático de Cálculo",
    });
  });

  it("generateMetadata sem descrição gravada usa a descrição padrão", async () => {
    await updateConfiguration({ siteName: "Notas de Aula" });

    expect((await metadataOf()).description).toBe(DEFAULT_SITE_DESCRIPTION);
  });

  it("generateMetadata sem configuração (banco indisponível) usa os padrões", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));

    expect(await metadataOf()).toEqual({
      title: titleOf("Vitrine"),
      description: DEFAULT_SITE_DESCRIPTION,
    });
  });

  it("generateMetadata com nome em branco no banco usa o nome padrão", async () => {
    await prisma.configuration.create({ data: { id: "default", siteName: "   " } });

    expect((await metadataOf()).title).toEqual(titleOf("Vitrine"));
  });
});

describe("AdminLayout", () => {
  const render = async () => renderToStaticMarkup(await AdminLayout({ children: "conteúdo do painel" }));

  it("valida a sessão antes de ler a configuração", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(getConfiguration).not.toHaveBeenCalled();
    // O layout envolve a página da troca de senha: só a sessão conta, a senha provisória é de cada página.
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin", allowTemporaryPassword: true });
  });

  it("aplica a configuração do site no envoltório .vitrine-tema, em volta da casca do painel", async () => {
    await updateConfiguration(PALETTES);

    const html = await render();

    expect(attributesOf(html, "div").class).toBe("vitrine-tema flex flex-1 flex-col");
    expect(themeOf(html)["--vitrine-dark-primary"]).toBe("#93c5fd");
    expect(themeOf(html)["--vitrine-light-primary"]).toBe("#1d4ed8");
    expect(html.indexOf("vitrine-tema")).toBeLessThan(html.indexOf("conteúdo do painel"));
  });

  it("entrega ao AdminShell o nome do site gravado, e só ele", async () => {
    await updateConfiguration({ siteName: "  Notas de Aula  ", ...PALETTES });

    const wrapper = await AdminLayout({ children: "conteúdo do painel" });
    const shell = wrapper.props.children;

    expect(shell.props.siteName).toBe("Notas de Aula");
    expect(Object.keys(shell.props).sort()).toEqual(["children", "signOutAction", "siteName", "user"]);
    expect(shell.props.user).toEqual({ name: "Ada Fictícia", email: "ada@exemplo.test" });
  });

  it("o cabeçalho renderizado mostra o nome gravado", async () => {
    await updateConfiguration({ siteName: "Notas de Aula" });

    const html = await render();

    expect(html).toContain("Notas de Aula");
    expect(html).toContain("conteúdo do painel");
    expect(html).toContain("ada@exemplo.test");
    expect(html).not.toContain(">Vitrine<");
  });

  it("nome em branco ou banco indisponível: \"Vitrine\"", async () => {
    await prisma.configuration.create({ data: { id: "default", siteName: "  " } });
    expect((await AdminLayout({ children: null })).props.children.props.siteName).toBe("Vitrine");

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));
    expect((await AdminLayout({ children: null })).props.children.props.siteName).toBe("Vitrine");
  });

  it("generateMetadata: título do painel com o nome do site, modelo para as páginas e noindex", async () => {
    await updateConfiguration({ siteName: "Notas de Aula" });

    expect(await adminMetadata()).toEqual({
      title: { absolute: "Painel administrativo | Notas de Aula", template: "%s | Notas de Aula" },
      robots: { index: false, follow: false },
    });
  });
});

describe("página 404 (not-found.js)", () => {
  const html = () => renderToStaticMarkup(NotFound());

  it("está em português, com título próprio e link para o início", () => {
    expect(notFoundMetadata).toEqual({ title: "Página não encontrada" });
    expect(html()).toContain("Página não encontrada");
    expect(html()).toContain("Voltar ao início");
    expect(html()).toMatch(/<a[^>]*href="\/"[^>]*>Voltar ao início<\/a>/);
    expect(html()).not.toMatch(/not found|could not be found/i);
  });

  it("a mensagem é única e não revela se o conteúdo existe em rascunho (RN15)", () => {
    expect(html()).not.toMatch(/rascunho|publicad|draft/i);
  });

  it("usa só os tokens de tema: nenhuma cor fixa do Tailwind nem cor embutida", () => {
    const classes = [...html().matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/));
    const fixedColor =
      /(^|:)(bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret)(-[trblxyse])?-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d+)?(\/\d+)?$/;

    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((name) => fixedColor.test(name))).toEqual([]);
    expect(classes.filter((name) => name.startsWith("dark:"))).toEqual([]);
    expect(html()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|style=/);
    // E usa de fato os tokens do tema
    expect(classes).toEqual(expect.arrayContaining(["bg-surface", "bg-background", "border-border", "text-muted", "bg-primary", "text-on-primary"]));
  });
});
