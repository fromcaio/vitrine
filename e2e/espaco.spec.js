// Espaço público e portal sobre a aplicação de PRODUÇÃO (A-014 Parte 3b, itens 1 a 3 e 7; RF14, RF29,
// RF30, RN14, RN15, RN20, RN23, RN28; CT14, CT21, CT31, CT43, CT44, CT46, CT47): o `build` e o `start`
// reais, o banco temporário, a API real e a guarda de CSP de `./support/test.js`. Contas e conteúdo
// FICTÍCIOS; o administrador de teste é o de `npm run admin:create`.
import { ADMIN, e2eEnvironment } from "./support/env.js";
import { adminLogin, apiLogin, cacheState, createAccount, createContent, fetchUntil } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();

const ANA = { email: "ana-espaco-e2e@exemplo.test", name: "Ana E2E", handle: "esp-ana", password: "senha-ana-e2e-9" };
const BETO = { email: "beto-espaco-e2e@exemplo.test", name: "Beto E2E", handle: "esp-beto", password: "senha-beto-e2e-9" };
const SUSP = { email: "susp-espaco-e2e@exemplo.test", name: "Susp E2E", handle: "esp-susp", password: "senha-susp-e2e-9" };
const REMOVIDA = { email: "removida-espaco-e2e@exemplo.test", name: "Removida E2E", handle: "esp-removida", password: "senha-rem-e2e-9" };
const SEM_HANDLE = { email: "semhandle-espaco-e2e@exemplo.test", name: "Sem Handle E2E", handle: null, password: "senha-sem-e2e-9" };

/** A mensagem única do 404 (RF14): a mesma para tudo o que não é público. */
const NOT_FOUND_TEXT = "O endereço que você abriu não existe ou não está disponível.";

test.describe.serial("espaço público e portal", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  /** @type {import("@playwright/test").APIRequestContext} */
  let beto;
  const ids = { susp: "", removida: "" };
  let limitesId = "";
  let sobreId = "";
  let sobreUpdatedAt = "";

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    const anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    ids.susp = (await createAccount(playwright, admin, SUSP)).id;
    ids.removida = (await createAccount(playwright, admin, REMOVIDA)).id;
    const semHandle = await createAccount(playwright, admin, SEM_HANDLE);
    ana = await apiLogin(playwright, anaAccount);
    beto = await apiLogin(playwright, betoAccount);

    // O espaço da Ana: uma coleção com documentos, um rascunho e uma subcoleção; um documento solto;
    // uma coleção sem documento publicado; uma coleção em rascunho com um filho publicado.
    const calculo = await createContent(ana, { title: "Cálculo", slug: "calculo", type: "COLLECTION" });
    const limites = await createContent(ana, {
      title: "Limites", slug: "limites", type: "DOCUMENT", parentId: calculo.id, body: "## Definição\n\nTexto **forte** de limites.",
    });
    limitesId = limites.id;
    await createContent(ana, { title: "Derivadas", slug: "derivadas", type: "DOCUMENT", parentId: calculo.id, body: "Texto de derivadas." });
    await createContent(ana, { title: "Anotação privada", slug: "rascunho", type: "DOCUMENT", parentId: calculo.id, status: "DRAFT", body: "x" });
    const avancado = await createContent(ana, { title: "Avançado", slug: "avancado", type: "COLLECTION", parentId: calculo.id });
    await createContent(ana, { title: "Séries", slug: "series", type: "DOCUMENT", parentId: avancado.id, body: "Texto de séries." });
    const sobre = await createContent(ana, { title: "Sobre", slug: "sobre", type: "DOCUMENT", body: "Texto antigo do sobre." });
    sobreId = sobre.id;
    sobreUpdatedAt = sobre.updatedAt;
    const vazia = await createContent(ana, { title: "Vazia", slug: "vazia", type: "COLLECTION" });
    await createContent(ana, { title: "Só rascunho", slug: "so-rascunho", type: "DOCUMENT", parentId: vazia.id, status: "DRAFT", body: "x" });
    const oculta = await createContent(ana, { title: "Oculta", slug: "oculta", type: "COLLECTION", status: "DRAFT" });
    await createContent(ana, { title: "Filho da oculta", slug: "filho", type: "DOCUMENT", parentId: oculta.id, body: "x" });

    await createContent(beto, { title: "Início do Beto", slug: "inicio", type: "DOCUMENT", body: "Texto do Beto." });
    const suspCtx = await apiLogin(playwright, { email: SUSP.email, password: SUSP.password });
    await createContent(suspCtx, { title: "Página da suspensa", slug: "pagina", type: "DOCUMENT", body: "Texto da suspensa." });
    await suspCtx.dispose();
    const remCtx = await apiLogin(playwright, { email: REMOVIDA.email, password: REMOVIDA.password });
    await createContent(remCtx, { title: "Página da removida", slug: "x", type: "DOCUMENT", body: "Texto da removida." });
    await remCtx.dispose();
    const semCtx = await apiLogin(playwright, semHandle);
    await createContent(semCtx, { title: "Documento sem handle", slug: "doc", type: "DOCUMENT", body: "x" });
    await semCtx.dispose();
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
    await beto?.dispose();
  });

  test("CT14: a coleção redireciona ao primeiro documento publicado, na ordem da árvore; a vazia mostra o estado vazio", async ({ request, page }) => {
    // Na primeira geração o Next.js escreve o `Location` duas vezes, com o mesmo valor (os navegadores
    // aceitam); por isso a comparação é pelos valores distintos.
    const locations = (response) => [...new Set(response.headersArray().filter((h) => h.name.toLowerCase() === "location").map((h) => h.value))];
    const redirect = await request.get("/esp-ana/calculo", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(locations(redirect)).toEqual(["/esp-ana/calculo/limites"]);

    // A subcoleção redireciona dentro do seu ramo.
    const inner = await request.get("/esp-ana/calculo/avancado", { maxRedirects: 0 });
    expect(inner.status()).toBe(307);
    expect(locations(inner)).toEqual(["/esp-ana/calculo/avancado/series"]);

    // A coleção sem documento publicado: estado vazio, 200 (não é 404).
    const empty = await request.get("/esp-ana/vazia");
    expect(empty.status()).toBe(200);
    expect(await empty.text()).toContain("Esta coleção ainda não tem documentos publicados.");

    // No navegador, o clique na coleção termina no documento.
    await page.goto("/esp-ana/calculo");
    await expect(page).toHaveURL(/\/esp-ana\/calculo\/limites$/);
    await expect(page.getByRole("heading", { name: "Limites", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação entre documentos" }).getByRole("link", { name: /Derivadas/ })).toBeVisible();
  });

  test("o documento mostra o texto em Markdown, a sidebar da coleção e a aparência efetiva do dono (a dele sobre a do sistema)", async ({ request }) => {
    const system = (await (await admin.get("/api/configuration")).json()).data;
    const response = await request.get("/esp-ana/calculo/limites");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain("Texto <strong>forte</strong> de limites.");
    expect(html).toContain("Derivadas"); // a sidebar da coleção raiz
    expect(html).toContain('href="/esp-ana/calculo/derivadas"');
    // A Ana não personalizou: o nome e a paleta dela são nulos e herdam os do sistema (ADR-038, itens 2 e 8).
    expect(html).toContain(`<title>Limites | ${system.siteName}</title>`);
    expect(html).not.toContain("Ana E2E");
    expect(html).toContain(`--vitrine-light-primary:${system.primaryColor}`);
    expect(html).toContain(`--vitrine-dark-primary:${system.darkPrimaryColor}`);
  });

  test("CT31: rascunho, coleção em rascunho e descendente dela: o mesmo 404, e fora da sidebar, da barra e do início", async ({ request }) => {
    for (const path of ["/esp-ana/calculo/rascunho", "/esp-ana/oculta", "/esp-ana/oculta/filho", "/esp-ana/calculo/nao-existe"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      const html = await response.text();
      expect(html, path).toContain(NOT_FOUND_TEXT);
      // O 404 não revela o conteúdo: nem o título do rascunho nem o do filho de uma coleção em rascunho.
      expect(html, path).not.toContain("Anotação privada");
      expect(html, path).not.toContain("Filho da oculta");
    }

    for (const path of ["/esp-ana", "/esp-ana/calculo/limites", "/esp-ana/sobre"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toContain("Anotação privada");
      expect(html, path).not.toContain("Filho da oculta");
      expect(html, path).not.toMatch(/href="\/esp-ana\/(oculta|calculo\/rascunho)/);
    }
    // O painel continua listando tudo, com o estado (RF26).
    const tree = (await (await ana.get("/api/contents")).json()).data;
    expect(JSON.stringify(tree)).toContain("rascunho");
  });

  test("CT43: suspenso, removido ou sem handle respondem 404, o mesmo de qualquer caminho inexistente; o reservado nunca existe", async ({ request }) => {
    expect((await request.get("/esp-susp/pagina")).status()).toBe(200);
    expect((await request.get("/esp-removida/x")).status()).toBe(200);

    // Suspender: o espaço some (as páginas em cache são revalidadas por caminhos literais).
    expect((await admin.post(`/api/users/${ids.susp}/ban`, { data: { reason: "Teste e2e de espaço" } })).status()).toBe(200);
    const suspended = await fetchUntil(request, "/esp-susp/pagina", (_body, response) => response.status() === 404);
    expect(suspended.response.status()).toBe(404);
    expect(suspended.body).toContain(NOT_FOUND_TEXT);
    expect((await fetchUntil(request, "/esp-susp", (_body, response) => response.status() === 404)).response.status()).toBe(404);

    // Reativar: volta.
    expect((await admin.delete(`/api/users/${ids.susp}/ban`)).status()).toBe(200);
    expect((await fetchUntil(request, "/esp-susp/pagina", (_body, response) => response.status() === 200)).response.status()).toBe(200);

    // Remover a conta: o espaço some.
    expect((await admin.delete(`/api/users/${ids.removida}?content=delete`)).status()).toBe(200);
    const removed = await fetchUntil(request, "/esp-removida/x", (_body, response) => response.status() === 404);
    expect(removed.response.status()).toBe(404);
    expect(removed.body).toContain(NOT_FOUND_TEXT);

    // Handle reservado, inexistente e sem espaço: o mesmo 404.
    for (const path of ["/logout", "/esp-ninguem", "/esp-ninguem/qualquer/coisa"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text(), path).toContain(NOT_FOUND_TEXT);
    }
  });

  test("CT21: publicar uma nova versão atualiza a página pública", async ({ request }) => {
    expect(await (await request.get("/esp-ana/sobre")).text()).toContain("Texto antigo do sobre.");

    const patched = await ana.patch(`/api/contents/${sobreId}`, { data: { body: "Texto NOVO do sobre.", version: sobreUpdatedAt } });
    expect(patched.status()).toBe(200);

    const { body } = await fetchUntil(request, "/esp-ana/sobre", (html) => html.includes("Texto NOVO do sobre."));
    expect(body).toContain("Texto NOVO do sobre.");
    expect(body).not.toContain("Texto antigo do sobre.");
  });

  test("CT46: o portal mostra o texto do administrador e, com o diretório ligado, só espaços ativos com raiz publicada, em ordem alfabética", async ({ request }) => {
    // O Beto troca o nome do espaço por um nome com acento: a ordem ignora acento e caixa.
    expect((await beto.put("/api/appearance", { data: { siteName: "Ângelo E2E" } })).status()).toBe(200);
    const saved = await admin.put("/api/configuration", {
      data: { siteName: "Portal e2e do espaço", homeBody: "# Portal\n\nTexto **do portal e2e**.", directoryEnabled: true },
    });
    expect(saved.status()).toBe(200);

    const { body } = await fetchUntil(request, "/", (html) => html.includes("Texto <strong>do portal e2e</strong>.") && html.includes("Ângelo E2E"));
    expect(body).toContain("Portal e2e do espaço");
    const order = ["Ana E2E", "Ângelo E2E", "Susp E2E"].map((name) => body.indexOf(name));
    expect(order.every((position) => position > -1), JSON.stringify(order)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(body).toContain('href="/esp-ana"');
    // Removida, sem handle e quem só tem rascunho não aparecem.
    for (const absent of ["Removida E2E", "Sem Handle E2E", 'href="/esp-removida"']) expect(body, absent).not.toContain(absent);

    // Com o diretório desligado, a lista some e o texto fica.
    expect((await admin.put("/api/configuration", { data: { directoryEnabled: false } })).status()).toBe(200);
    const off = await fetchUntil(request, "/", (html) => !html.includes('href="/esp-ana"'));
    expect(off.body).not.toContain('href="/esp-ana"');
    expect(off.body).toContain("Texto <strong>do portal e2e</strong>.");
    expect((await admin.put("/api/configuration", { data: { directoryEnabled: true } })).status()).toBe(200);
  });

  test("CT44: um evento estrutural invalida o espaço inteiro do autor (as irmãs e a sidebar) e não toca o de outro", async ({ request }) => {
    // Aquece os dois espaços: a segunda visita é HIT.
    for (const path of ["/esp-ana/calculo/derivadas", "/esp-beto/inicio"]) {
      await request.get(path);
      const warm = await fetchUntil(request, path, (_body, response) => cacheState(response) === "HIT", { attempts: 5 });
      expect(cacheState(warm.response), path).toBe("HIT");
    }

    // A Ana renomeia OUTRO documento do espaço dela (o título aparece na sidebar das irmãs).
    const renamed = await ana.patch(`/api/contents/${limitesId}`, { data: { title: "Limites e continuidade" } });
    expect(renamed.status()).toBe(200);

    // O Beto, que nada fez: continua HIT, na hora.
    expect(cacheState(await request.get("/esp-beto/inicio"))).toBe("HIT");

    // A página irmã da Ana foi invalidada: deixou de ser HIT e já traz o título novo na sidebar.
    const sibling = await request.get("/esp-ana/calculo/derivadas");
    expect(cacheState(sibling), "irmã logo depois do evento").not.toBe("HIT");
    const { body } = await fetchUntil(request, "/esp-ana/calculo/derivadas", (html) => html.includes("Limites e continuidade"));
    expect(body).toContain("Limites e continuidade");
    // E volta a ser servida do cache.
    const again = await fetchUntil(request, "/esp-ana/calculo/derivadas", (_html, response) => cacheState(response) === "HIT", { attempts: 5 });
    expect(cacheState(again.response)).toBe("HIT");
  });

  test("CT47 no espaço: o modo noturno antes da primeira pintura e a paleta do dono por modo, sem violação de CSP", async ({ page }) => {
    // A Ana escolhe uma paleta para cada modo.
    const saved = await ana.put("/api/appearance", {
      // A paleta de cada modo vai inteira (as três cores; ADR-038).
      data: {
        primaryColor: "#7c3aed", secondaryColor: "#1e293b", accentColor: "#b45309",
        darkPrimaryColor: "#c4b5fd", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24",
        siteName: "Espaço da Ana",
      },
    });
    expect(saved.status()).toBe(200);
    const request = page.request;
    await fetchUntil(request, "/esp-ana/sobre", (html) => html.includes("--vitrine-light-primary:#7c3aed"));

    const classAtDomContentLoaded = async (scheme) => {
      await page.emulateMedia({ colorScheme: scheme });
      // O modo vem do cookie `vitrine-modo` (ADR-036), e já não do sistema operacional.
      await page.context().clearCookies({ name: "vitrine-modo" });
      if (scheme === "dark") await page.context().addCookies([{ name: "vitrine-modo", value: "dark", url: baseURL }]);
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          // @ts-expect-error variável de ensaio
          window.__classAtDcl = document.documentElement.className;
        });
      });
      await page.goto("/esp-ana/sobre");
      // @ts-expect-error variável de ensaio
      return page.evaluate(() => window.__classAtDcl);
    };
    const wrapperVariable = () =>
      page.locator(".vitrine-tema").first().evaluate((element) => getComputedStyle(element).getPropertyValue("--vitrine-primary").trim());

    expect((await classAtDomContentLoaded("dark")).split(/\s+/)).toContain("dark");
    expect(await wrapperVariable()).toBe("#c4b5fd");

    expect((await classAtDomContentLoaded("light")).split(/\s+/)).not.toContain("dark");
    expect(await wrapperVariable()).toBe("#7c3aed");
    await expect(page).toHaveTitle("Sobre | Espaço da Ana");

    // O espaço do Beto não herda a paleta da Ana nem a do site.
    const betoHtml = await (await request.get("/esp-beto/inicio")).text();
    expect(betoHtml).not.toContain("#7c3aed");
    expect(betoHtml).not.toContain("--vitrine-light-primary:"); // o Beto não personalizou: paleta nula (herda)
    expect(baseURL).toBeTruthy();
    expect(ADMIN.email).toBeTruthy();
  });
});
