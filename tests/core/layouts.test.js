// Renderização no servidor dos arquivos de rota que leem a configuração (M11, parte do Core):
// layout raiz (tema no <html> e metadados), layout do painel (nome do site) e página 404. Os
// componentes são renderizados de verdade, com react-dom/server, sobre o SQLite temporário do
// setup; não leem o .env. São substituídos só os módulos que dependem do servidor do Next.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As fontes do next/font são geradas no build; aqui bastam os nomes das variáveis CSS.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "fonte-sans-de-teste" }),
  Geist_Mono: () => ({ variable: "fonte-mono-de-teste" }),
}));
// A sessão do painel depende dos cabeçalhos da requisição: aqui, um usuário fictício.
vi.mock("@/app/admin/_lib/session", () => ({
  requireAdminSession: vi.fn(async () => ({ user: { name: "Ada Fictícia", email: "ada@exemplo.test" } })),
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
import { requireAdminSession } from "@/app/admin/_lib/session";
import AdminLayout from "@/app/admin/layout";
import RootLayout, { generateMetadata } from "@/app/layout";
import NotFound, { metadata as notFoundMetadata } from "@/app/not-found";
import { DEFAULT_SITE_DESCRIPTION } from "@/app/_lib/site";
import { getConfiguration, prisma, updateConfiguration } from "@/lib/db";
import { readableTextOn } from "@/lib/theme";

const PALETTE = { primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#b45309" };

beforeEach(async () => {
  await prisma.configuration.deleteMany();
  vi.mocked(getConfiguration).mockClear();
  vi.mocked(requireAdminSession).mockClear();
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

async function renderRootLayout() {
  return renderToStaticMarkup(await RootLayout({ children: "conteúdo da página" }));
}

describe("RootLayout", () => {
  it("injeta no <html> as quatro variáveis da paleta gravada", async () => {
    await updateConfiguration(PALETTE);

    const html = await renderRootLayout();
    const attributes = attributesOf(html, "html");

    expect(attributes.lang).toBe("pt-BR");
    expect(declarationsOf(attributes.style)).toEqual({
      "--vitrine-primary": "#1d4ed8",
      "--vitrine-on-primary": readableTextOn("#1d4ed8"),
      "--vitrine-secondary": "#0f172a",
      "--vitrine-accent": "#b45309",
    });
  });

  it("o style fica no <html>, não no <body>, e a estrutura do layout é preservada", async () => {
    await updateConfiguration(PALETTE);

    const html = await renderRootLayout();

    expect(attributesOf(html, "html").class).toBe("fonte-sans-de-teste fonte-mono-de-teste h-full antialiased");
    expect(attributesOf(html, "body")).toEqual({ class: "min-h-full flex flex-col" });
    expect(html).toContain("conteúdo da página");
  });

  it("sem registro gravado, usa a paleta padrão da RN08", async () => {
    const style = declarationsOf(attributesOf(await renderRootLayout(), "html").style);

    expect(style).toEqual({
      "--vitrine-primary": "#3b82f6",
      "--vitrine-on-primary": readableTextOn("#3b82f6"),
      "--vitrine-secondary": "#1e293b",
      "--vitrine-accent": "#f59e0b",
    });
  });

  it("uma nova paleta gravada aparece na renderização seguinte", async () => {
    await updateConfiguration(PALETTE);
    expect(declarationsOf(attributesOf(await renderRootLayout(), "html").style)["--vitrine-primary"]).toBe("#1d4ed8");

    await updateConfiguration({ primaryColor: "#fde68a" });
    const style = declarationsOf(attributesOf(await renderRootLayout(), "html").style);

    expect(style["--vitrine-primary"]).toBe("#fde68a");
    expect(style["--vitrine-on-primary"]).toBe(readableTextOn("#fde68a"));
    expect(style["--vitrine-secondary"]).toBe("#0f172a");
  });

  it("com o banco indisponível, renderiza sem style e sem lançar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));

    const html = await renderRootLayout();

    expect(attributesOf(html, "html")).toEqual({
      lang: "pt-BR",
      class: "fonte-sans-de-teste fonte-mono-de-teste h-full antialiased",
    });
    expect(html).toContain("conteúdo da página");
  });

  it("no next build não consulta o banco e sai sem style", async () => {
    await updateConfiguration(PALETTE);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    const html = await renderRootLayout();

    expect(attributesOf(html, "html")).not.toHaveProperty("style");
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("uma cor inválida lida do banco não chega ao HTML nem derruba a página", async () => {
    // Gravação direta, sem passar pela validação da API (RN09).
    await prisma.configuration.create({
      data: { id: "default", primaryColor: "red; background:url(x)", secondaryColor: "#0f172a", accentColor: "#12345" },
    });

    const html = await renderRootLayout();

    expect(declarationsOf(attributesOf(html, "html").style)).toEqual({ "--vitrine-secondary": "#0f172a" });
    expect(html).not.toContain("url(x)");
    expect(html).not.toContain("#12345");
  });
});

describe("generateMetadata", () => {
  it("usa o nome e a descrição da configuração", async () => {
    await updateConfiguration({ siteName: "Notas de Aula", siteDescription: "Material didático de Cálculo" });

    expect(await generateMetadata()).toEqual({
      title: { default: "Notas de Aula", template: "%s | Notas de Aula" },
      description: "Material didático de Cálculo",
    });
  });

  it("sem descrição gravada, usa a descrição padrão", async () => {
    await updateConfiguration({ siteName: "Notas de Aula" });

    expect((await generateMetadata()).description).toBe(DEFAULT_SITE_DESCRIPTION);
  });

  it("sem configuração (banco indisponível), usa os padrões", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));

    expect(await generateMetadata()).toEqual({
      title: { default: "Vitrine", template: "%s | Vitrine" },
      description: DEFAULT_SITE_DESCRIPTION,
    });
  });

  it("nome em branco no banco vira o nome padrão", async () => {
    await prisma.configuration.create({ data: { id: "default", siteName: "   " } });

    expect((await generateMetadata()).title).toEqual({ default: "Vitrine", template: "%s | Vitrine" });
  });
});

describe("AdminLayout", () => {
  it("entrega ao AdminShell o nome do site gravado, e só ele", async () => {
    await updateConfiguration({ siteName: "  Notas de Aula  ", ...PALETTE });

    const element = await AdminLayout({ children: "conteúdo do painel" });

    expect(element.props.siteName).toBe("Notas de Aula");
    expect(Object.keys(element.props).sort()).toEqual(["children", "signOutAction", "siteName", "user"]);
    expect(element.props.user).toEqual({ name: "Ada Fictícia", email: "ada@exemplo.test" });
  });

  it("o cabeçalho renderizado mostra o nome gravado", async () => {
    await updateConfiguration({ siteName: "Notas de Aula" });

    const html = renderToStaticMarkup(await AdminLayout({ children: "conteúdo do painel" }));

    expect(html).toContain("Notas de Aula");
    expect(html).toContain("conteúdo do painel");
    expect(html).toContain("ada@exemplo.test");
    expect(html).not.toContain(">Vitrine<");
  });

  it("nome em branco ou banco indisponível: \"Vitrine\"", async () => {
    await prisma.configuration.create({ data: { id: "default", siteName: "  " } });
    expect((await AdminLayout({ children: null })).props.siteName).toBe("Vitrine");

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getConfiguration).mockRejectedValueOnce(new Error("banco indisponível"));
    expect((await AdminLayout({ children: null })).props.siteName).toBe("Vitrine");
  });

  it("valida a sessão antes de ler a configuração", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(getConfiguration).not.toHaveBeenCalled();
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
