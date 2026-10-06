// Rotas e metadados de SEO (A-014 Parte 3c, item 3; RF25, RNF07, RN15, RN23; CT25, CT31, CT43): o mapa do
// site por espaço (só publicados, espaço ativo, o mesmo 404), o índice no portal (só o diretório), o
// `robots`, o `metadataBase` e os metadados de cada página. Renderizados de verdade sobre o SQLite
// temporário; a navegação do Next.js é substituída (`notFound` lança); o banco é espiado para provar o
// que o `next build` NÃO consulta.
import "./env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As fontes do next/font são geradas no build; o layout raiz só as importa.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "fonte-sans-de-teste" }),
  Geist_Mono: () => ({ variable: "fonte-mono-de-teste" }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getUserByHandle: vi.fn(actual.getUserByHandle),
    listPublicSpaces: vi.fn(actual.listPublicSpaces),
    getConfiguration: vi.fn(actual.getConfiguration),
  };
});

import { GET as indexSitemap } from "@/app/sitemap.xml/route";
import { GET as spaceSitemap } from "@/app/[handle]/sitemap.xml/route";
import { generateMetadata as contentMetadata } from "@/app/[handle]/[...slug]/page";
import { generateMetadata as spaceHomeMetadataOf } from "@/app/[handle]/page";
import { generateMetadata as portalLayoutMetadata } from "@/app/(portal)/layout";
import { generateMetadata as rootMetadata } from "@/app/layout";
import robots from "@/app/robots";
import { createContent, getUserByHandle, listPublicSpaces, updateAppearance, updateConfiguration } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(getUserByHandle).mockClear();
  vi.mocked(listPublicSpaces).mockClear();
  vi.stubEnv("BETTER_AUTH_URL", "https://vitrine.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function user(handle, extra = {}) {
  const created = await createTestUser({ email: `${handle ?? "sem-handle"}@exemplo.test`, name: `Nome de ${handle}`, handle, ...extra });
  return created.id;
}
const doc = (authorId, slug, extra = {}) =>
  createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: `Corpo de ${slug}`, ...extra });
const collection = (authorId, slug, extra = {}) =>
  createContent({ title: `Coleção ${slug}`, slug, type: "COLLECTION", authorId, ...extra });

const mapOf = (handle) => spaceSitemap(new Request(`https://vitrine.test/${handle}/sitemap.xml`), { params: Promise.resolve({ handle }) });
const locs = async (response) => [...(await response.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc);
const outcomeOf = async (promise) => {
  try {
    await promise;
    return "RENDERIZOU";
  } catch (error) {
    return /** @type {Error} */ (error).message;
  }
};

describe("/{handle}/sitemap.xml: o mapa do espaço (RF25, RN15; CT31)", () => {
  it("é XML, com o início e cada documento publicado, em URLs absolutas e com a data", async () => {
    const ana = await user("ana");
    const calculo = await collection(ana, "calculo");
    const limites = await doc(ana, "limites", { parentId: calculo.id });
    await doc(ana, "sobre");

    const response = await mapOf("ana");
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect((xml.match(/<loc>([^<]*)<\/loc>/g) ?? []).map((tag) => tag.replace(/<\/?loc>/g, ""))).toEqual([
      "https://vitrine.test/ana",
      "https://vitrine.test/ana/calculo/limites",
      "https://vitrine.test/ana/sobre",
    ]);
    expect(xml).toContain(`<loc>https://vitrine.test/ana/calculo/limites</loc><lastmod>${limites.updatedAt.toISOString()}</lastmod>`);
  });

  it("rascunho e toda a subárvore de rascunho NUNCA aparecem; as coleções também não (redirecionam) (CT31)", async () => {
    const ana = await user("ana");
    await doc(ana, "documento-rascunho", { status: "DRAFT" });
    const oculta = await collection(ana, "oculta", { status: "DRAFT" });
    await doc(ana, "filho-publicado", { parentId: oculta.id });
    const publica = await collection(ana, "publica");
    await doc(ana, "bom", { parentId: publica.id });
    await doc(ana, "escondido", { parentId: publica.id, status: "DRAFT" });

    const urls = await locs(await mapOf("ana"));

    expect(urls).toEqual(["https://vitrine.test/ana", "https://vitrine.test/ana/publica/bom"]);
    for (const hidden of ["documento-rascunho", "oculta", "filho-publicado", "escondido"]) {
      expect(urls.join(" "), hidden).not.toContain(hidden);
    }
  });

  it("só o conteúdo do DONO do espaço: o de outro usuário não vaza, nem com o mesmo slug", async () => {
    const ana = await user("ana");
    const beto = await user("beto");
    await doc(ana, "comum");
    await doc(beto, "comum");
    await doc(beto, "so-do-beto");

    const urls = await locs(await mapOf("ana"));

    expect(urls).toEqual(["https://vitrine.test/ana", "https://vitrine.test/ana/comum"]);
  });

  it("o espaço sem conteúdo publicado: só o início", async () => {
    await user("ana");

    expect(await locs(await mapOf("ana"))).toEqual(["https://vitrine.test/ana"]);
  });

  it("sem URL pública (BETTER_AUTH_URL), o mapa traz só caminhos", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    const ana = await user("ana");
    await doc(ana, "sobre");

    expect(await locs(await mapOf("ana"))).toEqual(["/ana", "/ana/sobre"]);
  });

  it("reflete o espaço na hora (nada em cache): publicar e despublicar mudam o mapa", async () => {
    const ana = await user("ana");
    const sobre = await doc(ana, "sobre", { status: "DRAFT" });
    expect(await locs(await mapOf("ana"))).toEqual(["https://vitrine.test/ana"]);

    const { updateContent } = await import("@/lib/db");
    await updateContent(sobre.id, { status: "PUBLISHED" });
    expect(await locs(await mapOf("ana"))).toContain("https://vitrine.test/ana/sobre");

    await updateContent(sobre.id, { status: "DRAFT" });
    expect(await locs(await mapOf("ana"))).not.toContain("https://vitrine.test/ana/sobre");
  });

  describe("o mesmo 404 de qualquer caminho inexistente (RF14, RN23; CT43)", () => {
    it.each([
      ["inexistente", "ninguem"],
      ["reservado", "logout"],
      ["em maiúsculas", "Ana"],
      ["vazio", ""],
    ])("espaço %s", async (_label, handle) => {
      await user("ana");

      expect(await outcomeOf(mapOf(handle))).toBe("NOT_FOUND");
    });

    it("suspenso (sem prazo ou vigente): 404, mesmo com conteúdo publicado; prazo vencido: o mapa volta", async () => {
      const a = await user("suspensa", { banned: true, banReason: "x" });
      await doc(a, "limites");
      await user("temporaria", { banned: true, banReason: "x", banExpires: new Date(Date.now() + 3_600_000) });
      await user("vencida", { banned: true, banReason: "x", banExpires: new Date(Date.now() - 3_600_000) });

      expect(await outcomeOf(mapOf("suspensa"))).toBe("NOT_FOUND");
      expect(await outcomeOf(mapOf("temporaria"))).toBe("NOT_FOUND");
      expect(await outcomeOf(mapOf("vencida"))).toBe("RENDERIZOU");
    });

    it("conta sem handle (o conteúdo existe, mas não há espaço): 404", async () => {
      const id = await user(null);
      await doc(id, "limites");

      expect(await outcomeOf(mapOf("sem-handle"))).toBe("NOT_FOUND");
    });

    it("no next build não consulta o banco (ADR-021)", async () => {
      await user("ana");
      vi.stubEnv("NEXT_PHASE", "phase-production-build");

      expect(await outcomeOf(mapOf("ana"))).toBe("NOT_FOUND");
      expect(getUserByHandle).not.toHaveBeenCalled();
    });
  });
});

describe("/sitemap.xml: o índice no portal (RF25, RN28)", () => {
  const index = () => indexSitemap();

  it("lista o mapa de cada espaço do diretório: ativo e com ao menos uma raiz publicada", async () => {
    const ana = await user("ana");
    await doc(ana, "inicio");
    const beto = await user("beto");
    await doc(beto, "inicio");
    await user("sem-conteudo");
    const rascunho = await user("so-rascunho");
    await doc(rascunho, "x", { status: "DRAFT" });
    const suspensa = await user("suspensa", { banned: true, banReason: "x" });
    await doc(suspensa, "inicio");

    const response = await index();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(await locs(new Response(xml))).toEqual(["https://vitrine.test/ana/sitemap.xml", "https://vitrine.test/beto/sitemap.xml"]);
  });

  it("com o diretório desligado, o índice sai vazio e nem consulta os espaços", async () => {
    const ana = await user("ana");
    await doc(ana, "inicio");
    await updateConfiguration({ directoryEnabled: false });

    const xml = await (await index()).text();

    expect(xml).toContain("<sitemapindex");
    expect(xml).not.toContain("<sitemap>");
    expect(listPublicSpaces).not.toHaveBeenCalled();
  });

  it("no next build, sai vazio sem consultar a configuração nem o diretório", async () => {
    const ana = await user("ana");
    await doc(ana, "inicio");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    const xml = await (await index()).text();

    expect(xml).not.toContain("<sitemap>");
    expect(listPublicSpaces).not.toHaveBeenCalled();
  });
});

describe("robots.txt (RF25, RNF07)", () => {
  it("libera os espaços públicos, bloqueia o painel, a API e o login, e aponta para o índice", () => {
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/login"] }],
      sitemap: "https://vitrine.test/sitemap.xml",
    });
  });

  it("sem URL pública, não traz a linha do mapa (um caminho relativo não vale ali)", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");

    const result = robots();

    expect(result).not.toHaveProperty("sitemap");
    expect(result.rules[0].disallow).toEqual(["/admin", "/api", "/login"]);
  });

  it("não consulta o banco", () => {
    robots();

    expect(getUserByHandle).not.toHaveBeenCalled();
    expect(listPublicSpaces).not.toHaveBeenCalled();
  });
});

describe("metadados: o metadataBase e as páginas (RF25, RNF07; CT25)", () => {
  it("o layout raiz leva o metadataBase da URL pública, lida na hora; sem ela, nenhum", () => {
    expect(rootMetadata().metadataBase?.href).toBe("https://vitrine.test/");
    expect(rootMetadata().title).toEqual({ default: "Vitrine", template: "%s | Vitrine" });

    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(rootMetadata()).not.toHaveProperty("metadataBase");
  });

  it("o documento: título, descrição SEM marcação, canônico e Open Graph (article, com a data)", async () => {
    const ana = await user("ana");
    await updateAppearance(ana, { siteName: "Notas da Ana", siteDescription: "Material de Cálculo" });
    const calculo = await collection(ana, "calculo");
    const limites = await doc(ana, "limites", { parentId: calculo.id, body: "# Limites\n\nO **limite** de $f(x)$ é [definido](/x).\n\n```js\ncodigo\n```" });

    const metadata = await contentMetadata({ params: Promise.resolve({ handle: "ana", slug: ["calculo", "limites"] }) });

    expect(metadata).toEqual({
      title: "Título limites",
      description: "Limites O limite de é definido.",
      alternates: { canonical: "/ana/calculo/limites" },
      openGraph: {
        type: "article",
        title: "Título limites",
        siteName: "Notas da Ana",
        url: "/ana/calculo/limites",
        description: "Limites O limite de é definido.",
        modifiedTime: limites.updatedAt.toISOString(),
      },
    });
    expect(metadata.description).not.toMatch(/[*`$#\[\]<>]/);
  });

  it("o documento sem texto não leva description (vale a do espaço, herdada do layout)", async () => {
    const ana = await user("ana");
    await doc(ana, "vazio", { body: null });
    await doc(ana, "so-codigo", { body: "```js\ncódigo\n```" });

    for (const slug of ["vazio", "so-codigo"]) {
      const metadata = await contentMetadata({ params: Promise.resolve({ handle: "ana", slug: [slug] }) });
      expect(metadata).not.toHaveProperty("description");
      expect(metadata.openGraph).not.toHaveProperty("description");
    }
  });

  it("a descrição do documento tem no máximo 160 caracteres e termina em palavra inteira", async () => {
    const ana = await user("ana");
    await doc(ana, "longo", { body: "palavra ".repeat(100) });

    const { description } = await contentMetadata({ params: Promise.resolve({ handle: "ana", slug: ["longo"] }) });

    expect(Array.from(description).length).toBeLessThanOrEqual(160);
    expect(description.endsWith("…")).toBe(true);
  });

  it("uma página que não é pública (rascunho, espaço suspenso, inexistente) não gera metadados", async () => {
    const ana = await user("ana");
    await doc(ana, "rascunho", { status: "DRAFT" });
    const suspensa = await user("suspensa", { banned: true, banReason: "x" });
    await doc(suspensa, "limites");

    for (const [handle, slug] of [["ana", ["rascunho"]], ["suspensa", ["limites"]], ["ninguem", ["x"]]]) {
      expect(await contentMetadata({ params: Promise.resolve({ handle, slug }) }), `${handle}/${slug}`).toEqual({});
    }
  });

  it("o início do espaço: canônico e Open Graph (website), com a descrição do espaço", async () => {
    const ana = await user("ana");
    await updateAppearance(ana, { siteName: "Notas da Ana", siteDescription: "Material de Cálculo" });

    expect(await spaceHomeMetadataOf({ params: Promise.resolve({ handle: "ana" }) })).toEqual({
      alternates: { canonical: "/ana" },
      openGraph: { type: "website", title: "Notas da Ana", siteName: "Notas da Ana", url: "/ana", description: "Material de Cálculo" },
    });
    expect(await spaceHomeMetadataOf({ params: Promise.resolve({ handle: "ninguem" }) })).toEqual({});
  });

  it("o portal: título e descrição do site, canônico e Open Graph", async () => {
    await updateConfiguration({ siteName: "Vitrine da Turma", siteDescription: "Espaços da turma" });

    const metadata = await portalLayoutMetadata();

    expect(metadata.title).toEqual({ absolute: "Vitrine da Turma", template: "%s | Vitrine da Turma" });
    expect(metadata.description).toBe("Espaços da turma");
    expect(metadata.alternates).toEqual({ canonical: "/" });
    expect(metadata.openGraph).toMatchObject({ type: "website", title: "Vitrine da Turma", url: "/" });
  });
});
