// SEO sobre a aplicação de PRODUÇÃO (A-014 Parte 3c, item 3; RF25, RNF07, RN15; CT25, CT31,
// CT44): os metadados no HTML pré-renderizado de cada página, o `robots.txt`, o índice no portal e o mapa
// do site por espaço (só publicados, sempre em dia, o mesmo 404). Contas e conteúdo FICTÍCIOS; a guarda de
// CSP de `./support/test.js` vale em todo teste. A URL pública é a do `next start` da rodada
// (`BETTER_AUTH_URL`), então as URLs absolutas começam por ela.
import { readdirSync } from "node:fs";
import path from "node:path";
import { adminLogin, apiLogin, createAccount, createContent } from "./support/accounts.js";
import { e2eEnvironment, projectRoot } from "./support/env.js";
import { expect, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();

const ANA = { email: "ana-seo-e2e@exemplo.test", name: "Ana do SEO", handle: "seo-ana", password: "senha-ana-seo-9" };
const BETO = { email: "beto-seo-e2e@exemplo.test", name: "Beto do SEO", handle: "seo-beto", password: "senha-beto-seo-9" };
const SUSP = { email: "susp-seo-e2e@exemplo.test", name: "Susp do SEO", handle: "seo-susp", password: "senha-susp-seo-9" };
const VAZIO = { email: "vazio-seo-e2e@exemplo.test", name: "Vazio do SEO", handle: "seo-vazio", password: "senha-vazio-seo-9" };

const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc);
/** Conteúdo de uma tag <meta> do HTML, pelo atributo e valor (`name` ou `property`). */
const metaOf = (html, attribute, value) =>
  html.match(new RegExp(`<meta ${attribute}="${value}" content="([^"]*)"`))?.[1] ?? null;
/** Quantos arquivos o servidor tem em `.next/server/app` (onde o ISR grava as páginas). */
const serverFiles = () => readdirSync(path.join(projectRoot, ".next", "server", "app"), { recursive: true }).length;

test.describe.serial("SEO", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  const ids = { susp: "" };
  let draftId = "";

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    const anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    const suspAccount = await createAccount(playwright, admin, SUSP);
    ids.susp = suspAccount.id;
    await createAccount(playwright, admin, VAZIO);
    ana = await apiLogin(playwright, anaAccount);
    const beto = await apiLogin(playwright, betoAccount);
    const susp = await apiLogin(playwright, suspAccount);

    await ana.put("/api/appearance", { data: { siteName: "Notas da Ana", siteDescription: "Material de Cálculo da Ana" } });
    const calculo = await createContent(ana, { title: "Cálculo", slug: "calculo", type: "COLLECTION" });
    await createContent(ana, {
      title: "Limites", slug: "limites", type: "DOCUMENT", parentId: calculo.id,
      body: "# Limites\n\nO **limite** de $f(x)$ quando $x \\to 0$ é [definido](/x) por uma ![figura](https://exemplo.test/a.png) e por `epsilon`.\n\n```js\nconst segredo = 1;\n```\n\nTexto final do documento.",
    });
    const avancado = await createContent(ana, { title: "Avançado", slug: "avancado", type: "COLLECTION", parentId: calculo.id });
    await createContent(ana, { title: "Séries", slug: "series", type: "DOCUMENT", parentId: avancado.id, body: "Texto de séries." });
    const rascunho = await createContent(ana, { title: "Anotação privada", slug: "rascunho", type: "DOCUMENT", status: "DRAFT", body: "Segredo do rascunho." });
    draftId = rascunho.id;
    const oculta = await createContent(ana, { title: "Oculta", slug: "oculta", type: "COLLECTION", status: "DRAFT" });
    await createContent(ana, { title: "Filho da oculta", slug: "filho", type: "DOCUMENT", parentId: oculta.id, body: "Filho publicado sob um rascunho." });
    await createContent(ana, { title: "Sobre", slug: "sobre", type: "DOCUMENT", body: "Texto do sobre." });
    await createContent(beto, { title: "Início do Beto", slug: "inicio", type: "DOCUMENT", body: "Texto do Beto." });
    await createContent(susp, { title: "Página da suspensa", slug: "pagina", type: "DOCUMENT", body: "Texto da suspensa." });
    await beto.dispose();
    await susp.dispose();
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
  });

  test("CT25: o documento traz título, descrição SEM marcação, canônico e Open Graph no HTML pré-renderizado", async ({ request }) => {
    const response = await request.get("/seo-ana/calculo/limites");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain("<title>Limites | Notas da Ana</title>");
    const description = metaOf(html, "name", "description");
    expect(description).toBe("Limites O limite de quando é definido por uma e por epsilon. Texto final do documento.");
    expect(description).not.toMatch(/[*`$#\[\]<>]|segredo/);
    expect(html).toContain(`<link rel="canonical" href="${baseURL}/seo-ana/calculo/limites"/>`);
    expect(metaOf(html, "property", "og:title")).toBe("Limites");
    expect(metaOf(html, "property", "og:type")).toBe("article");
    expect(metaOf(html, "property", "og:site_name")).toBe("Notas da Ana");
    expect(metaOf(html, "property", "og:url")).toBe(`${baseURL}/seo-ana/calculo/limites`);
    expect(metaOf(html, "property", "og:description")).toBe(description);
    expect(html).toMatch(/<meta property="article:modified_time" content="\d{4}-\d{2}-\d{2}T/);
  });

  test("CT25: o início do espaço e o portal também têm descrição, canônico e Open Graph", async ({ request }) => {
    const home = await (await request.get("/seo-ana")).text();
    expect(metaOf(home, "name", "description")).toBe("Material de Cálculo da Ana");
    expect(home).toContain(`<link rel="canonical" href="${baseURL}/seo-ana"/>`);
    expect(metaOf(home, "property", "og:type")).toBe("website");
    expect(home).toContain("<title>Notas da Ana</title>");

    const portal = await (await request.get("/")).text();
    expect(metaOf(portal, "name", "description")).toBeTruthy();
    // O Next tira a barra final da raiz: o canônico do portal é a própria origem.
    expect(portal).toContain(`<link rel="canonical" href="${baseURL}"/>`);
    expect(metaOf(portal, "property", "og:type")).toBe("website");
  });

  test("robots.txt: libera os espaços, bloqueia o painel, a API e o login, e aponta para o índice", async ({ request }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(body).toMatch(/User-Agent: \*/i);
    expect(body).toMatch(/Allow: \/\n/);
    for (const blocked of ["/admin", "/api", "/login"]) expect(body).toContain(`Disallow: ${blocked}`);
    expect(body).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test("CT31: o mapa do espaço só tem o início e os documentos publicados, com a data; rascunho e subárvore nunca", async ({ request }) => {
    const response = await request.get("/seo-ana/sitemap.xml");
    const xml = await response.text();

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    expect(locs(xml)).toEqual([
      `${baseURL}/seo-ana`,
      `${baseURL}/seo-ana/calculo/limites`,
      `${baseURL}/seo-ana/calculo/avancado/series`,
      `${baseURL}/seo-ana/sobre`,
    ]);
    expect(xml).toMatch(/<loc>[^<]*\/limites<\/loc><lastmod>\d{4}-\d{2}-\d{2}T[^<]*<\/lastmod>/);
    for (const hidden of ["rascunho", "oculta", "filho", "Segredo"]) expect(xml, hidden).not.toContain(hidden);
    // O de outro autor não vaza.
    expect(xml).not.toContain("seo-beto");
  });

  test("CT44: o mapa acompanha o espaço na hora (nada em cache): publicar e despublicar", async ({ request }) => {
    const before = await request.get("/seo-ana/sitemap.xml");
    expect(before.headers()["x-nextjs-cache"]).toBeUndefined(); // dinâmico: sempre em dia

    // Publica o rascunho: já está no mapa na primeira leitura depois.
    expect((await ana.patch(`/api/contents/${draftId}`, { data: { status: "PUBLISHED" } })).status()).toBe(200);
    expect(locs(await (await request.get("/seo-ana/sitemap.xml")).text())).toContain(`${baseURL}/seo-ana/rascunho`);

    // Despublica: some na primeira leitura depois.
    expect((await ana.patch(`/api/contents/${draftId}`, { data: { status: "DRAFT" } })).status()).toBe(200);
    expect(locs(await (await request.get("/seo-ana/sitemap.xml")).text())).not.toContain(`${baseURL}/seo-ana/rascunho`);
  });

  test("RF14: espaço inexistente, reservado, em maiúsculas e suspenso respondem o MESMO 404, e a reativação traz o mapa de volta", async ({ request }) => {
    const reference = await request.get("/seo-ninguem/sitemap.xml");
    expect(reference.status()).toBe(404);
    const referenceBody = await reference.text();

    for (const handle of ["logout", "SEO-Ana", "seo-vazio-nao-existe"]) {
      const response = await request.get(`/${handle}/sitemap.xml`);
      expect(response.status(), handle).toBe(404);
      expect(await response.text(), handle).toBe(referenceBody);
    }

    expect((await request.get("/seo-susp/sitemap.xml")).status()).toBe(200);
    expect((await admin.post(`/api/users/${ids.susp}/ban`, { data: { reason: "Teste e2e do mapa" } })).status()).toBe(200);
    const suspended = await request.get("/seo-susp/sitemap.xml");
    expect(suspended.status()).toBe(404);
    expect(await suspended.text()).toBe(referenceBody);

    expect((await admin.delete(`/api/users/${ids.susp}/ban`)).status()).toBe(200);
    expect((await request.get("/seo-susp/sitemap.xml")).status()).toBe(200);
  });

  test("RNF07: 50 mapas de espaços inexistentes não deixam arquivo em .next/", async ({ request }) => {
    await request.get("/seo-aquecimento/sitemap.xml");
    const before = serverFiles();

    for (let i = 0; i < 50; i++) {
      const response = await request.get(`/aleatorio-${Math.random().toString(36).slice(2, 10)}/sitemap.xml`);
      expect(response.status()).toBe(404);
    }

    expect(serverFiles() - before, "arquivos novos em .next/server/app").toBe(0);
  });

  test("o índice do portal lista só os espaços do diretório, e nenhum com o diretório desligado", async ({ request }) => {
    const index = await request.get("/sitemap.xml");
    const xml = await index.text();

    expect(index.status()).toBe(200);
    expect(index.headers()["content-type"]).toContain("application/xml");
    const listed = locs(xml);
    expect(listed).toContain(`${baseURL}/seo-ana/sitemap.xml`);
    expect(listed).toContain(`${baseURL}/seo-beto/sitemap.xml`);
    // Sem conteúdo publicado, e suspenso, não entram (nem quem só tem rascunho).
    expect(listed).not.toContain(`${baseURL}/seo-vazio/sitemap.xml`);

    // O administrador desliga o diretório: o índice fica vazio (o espaço segue público).
    expect((await admin.put("/api/configuration", { data: { directoryEnabled: false } })).status()).toBe(200);
    expect(locs(await (await request.get("/sitemap.xml")).text())).toEqual([]);
    expect((await request.get("/seo-ana/sitemap.xml")).status()).toBe(200);
    expect((await admin.put("/api/configuration", { data: { directoryEnabled: true } })).status()).toBe(200);
  });

  test("custo do mapa dinâmico: 40 leituras do mapa do espaço", async ({ request }) => {
    const times = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      const response = await request.get("/seo-ana/sitemap.xml");
      await response.text();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(`DIAG mapa do espaço (dinâmico, HTTP local): mediana ${times[20].toFixed(1)} ms, p95 ${times[37].toFixed(1)} ms, pior ${times[39].toFixed(1)} ms`);
    expect(times[20]).toBeLessThan(250);
  });
});
