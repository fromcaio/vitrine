// A página inicial editável pela interface, sobre a aplicação de PRODUÇÃO (P-033; M26, ADR-040; RF42 a RF44, RN35 a
// RN38; UC23, UC24; CT72 a CT79): o usuário edita, publica e vê o texto em `/{handle}` (o interruptor desliga a
// lista; o rascunho mostra a descrição); o administrador edita o portal (texto e diretório) e o passa a rascunho;
// o administrador despublica e exclui o texto de um usuário pela árvore de moderação, e o dono vê os avisos no
// sino; o usuário comum não alcança o alvo do sistema; `/admin/configuracoes` redireciona; o botão "Ver página
// pública". Contas FICTÍCIAS; a guarda de CSP de ./support/test.js vale em todo teste (fixture `page`).
import { signIn, waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, createAccount, createAdminAccount, createContent, fetchUntil, nextIp, removeAccount } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const DONA = { email: "dona-inicio-e2e@exemplo.test", name: "Dona do Início", handle: "ini-dona", password: "senha-dona-ini-9" };
const ADMIN_UI = { email: "admin-inicio-e2e@exemplo.test", name: "Admin do Início", password: "senha-admin-ini-9" };
const DESCRICAO = "Descrição do espaço da dona";
const BODY_LABEL = "Texto da página inicial (Markdown)";
/** Um motivo hostil: nada disto pode virar marcação nem executar. */
const HOSTILE_REASON = "<b>negrito</b><script>window.__xss = 1</script>";

/** Sessão de navegador com IP próprio, pela fixture `page` (a guarda de CSP vale). */
async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

/** O conteúdo principal (`<main>`) de uma página pública, sem a moldura (menu, barra lateral, rodapé). */
const mainOf = (html) => html.match(/<main[\s\S]*<\/main>/)?.[0] ?? "";

/** Abre o editor, espera a hidratação e devolve o campo do texto. */
async function openEditor(page, path) {
  await page.goto(path);
  await expect(page.getByLabel(BODY_LABEL)).toBeVisible();
  await waitForHydration(page);
  return page.getByLabel(BODY_LABEL);
}

const save = async (page) => {
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Página inicial salva" })).toBeVisible();
};

test.describe.serial("a página inicial editável", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let dona;
  let donaId = "";
  let adminUiId = "";

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(180_000);
    admin = await adminLogin(playwright);
    const account = await createAccount(playwright, admin, DONA);
    donaId = account.id;
    adminUiId = (await createAdminAccount(playwright, admin, ADMIN_UI)).id;
    dona = await apiLogin(playwright, DONA);
    await createContent(dona, { title: "Aula da dona", slug: "aula", type: "DOCUMENT", body: "Texto da aula." });
    expect((await dona.put("/api/appearance", { data: { siteDescription: DESCRICAO } })).status()).toBe(200);
  });

  test.afterAll(async () => {
    // O portal volta ao estado de antes: outros specs supõem o diretório com o título padrão.
    await admin?.put("/api/configuration", { data: { homeBody: "", homeStatus: "PUBLISHED", directoryEnabled: true, directoryTitle: "Espaços" } });
    if (admin && adminUiId) await removeAccount(admin, adminUiId);
    await dona?.dispose();
    await admin?.dispose();
  });

  test("o usuário comum não vê o seletor de alvo; edita, publica e vê o texto em /{handle}, com os títulos em h2", async ({ page, request }) => {
    await login(page, DONA);
    const menu = page.locator('nav[aria-label="Navegação do painel"]:visible');
    await expect(menu.getByRole("link", { name: "Página inicial" })).toBeVisible();
    await expect(menu.getByText("Configurações")).toHaveCount(0);

    const body = await openEditor(page, "/admin/pagina-inicial");
    await expect(page.getByRole("heading", { name: "Página inicial", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Página inicial a editar" })).toHaveCount(0);
    await expect(page.getByLabel("Título do diretório")).toHaveCount(0); // as opções do sistema não existem aqui
    // Sem texto: a página pública mostra a descrição e a lista.
    const before = await fetchUntil(request, `/${DONA.handle}`, (html) => html.includes(DESCRICAO));
    expect(mainOf(before.body)).toContain(DESCRICAO);
    expect(mainOf(before.body)).toContain(`href="/${DONA.handle}/aula"`);

    await body.fill("# Seção de boas-vindas\n\nOlá **mundo** da dona.");
    await save(page);

    const after = await fetchUntil(request, `/${DONA.handle}`, (html) => html.includes("Olá <strong>mundo</strong> da dona."));
    const main = mainOf(after.body);
    expect(main).toContain("Olá <strong>mundo</strong> da dona.");
    expect(main).toMatch(/<h2[^>]*>Seção de boas-vindas<\/h2>/);
    expect(main.match(/<h1/g)).toHaveLength(1);
    expect(main).not.toContain(DESCRICAO); // com texto publicado, a descrição some da página
    expect(main).toContain(`href="/${DONA.handle}/aula"`); // a lista continua sob o texto
  });

  test("o interruptor desliga a lista de coleções e documentos (o texto fica)", async ({ page, request }) => {
    await login(page, DONA);
    await openEditor(page, "/admin/pagina-inicial");
    await page.getByLabel("Mostrar as coleções e os documentos").uncheck();
    await save(page);

    const off = await fetchUntil(request, `/${DONA.handle}`, (html) => !mainOf(html).includes(`href="/${DONA.handle}/aula"`));
    expect(mainOf(off.body)).toContain("Olá <strong>mundo</strong> da dona.");
    expect(mainOf(off.body)).not.toContain(`href="/${DONA.handle}/aula"`);

    await page.getByLabel("Mostrar as coleções e os documentos").check();
    await save(page);
    const on = await fetchUntil(request, `/${DONA.handle}`, (html) => mainOf(html).includes(`href="/${DONA.handle}/aula"`));
    expect(mainOf(on.body)).toContain(`href="/${DONA.handle}/aula"`);
  });

  test("Ver página pública: o botão no editor abre /{handle} em nova aba; em rascunho, a página mostra a descrição e o botão some", async ({ page, request }) => {
    await login(page, DONA);
    await openEditor(page, "/admin/pagina-inicial");
    const link = page.getByRole("link", { name: "Ver página pública" });
    await expect(link).toHaveAttribute("href", `/${DONA.handle}`);
    await expect(link).toHaveAttribute("target", "_blank");
    const popup = page.waitForEvent("popup");
    await link.click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(new URL(opened.url()).pathname).toBe(`/${DONA.handle}`);
    await expect(opened.getByText("Olá mundo da dona.")).toBeVisible();
    await opened.close();

    await page.getByRole("button", { name: "Passar para rascunho" }).click();
    await save(page);
    await expect(page.getByRole("link", { name: "Ver página pública" })).toHaveCount(0);
    await expect(page.getByText("O texto está em rascunho: a página pública mostra a descrição.")).toBeVisible();

    const draft = await fetchUntil(request, `/${DONA.handle}`, (html) => mainOf(html).includes(DESCRICAO));
    expect(mainOf(draft.body)).toContain(DESCRICAO);
    expect(mainOf(draft.body)).not.toContain("Olá <strong>mundo</strong>");
    expect(draft.body).not.toContain("Olá <strong>mundo</strong>");

    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await save(page);
    const back = await fetchUntil(request, `/${DONA.handle}`, (html) => html.includes("Olá <strong>mundo</strong> da dona."));
    expect(mainOf(back.body)).not.toContain(DESCRICAO);
  });

  test("a árvore do conteúdo: a primeira linha é a Página inicial, com Editar e Ver página pública", async ({ page }) => {
    await login(page, DONA);
    await page.goto("/admin/conteudo");
    const row = page.getByTestId("home-row");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("home-status")).toHaveText(/Publicado/);
    await expect(row.getByRole("link", { name: "Editar: Página inicial" })).toHaveAttribute("href", "/admin/pagina-inicial");
    await expect(row.getByRole("link", { name: /Ver página pública/ })).toHaveAttribute("href", `/${DONA.handle}`);
  });

  test("o administrador edita o portal (texto e diretório) e o passa a rascunho e de volta", async ({ page, request }) => {
    await login(page, ADMIN_UI);
    const body = await openEditor(page, "/admin/pagina-inicial");
    await expect(page.getByRole("heading", { name: "Página inicial do sistema", level: 1 })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Página inicial a editar" });
    await expect(tabs.getByRole("link", { name: /Página inicial do sistema/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Ver página pública" })).toHaveAttribute("href", "/");

    await body.fill("# Boas-vindas ao portal\n\nPortal **e2e** da página inicial.");
    await page.getByLabel("Título do diretório").fill("Gente do portal");
    await save(page);

    const portal = await fetchUntil(request, "/", (html) => html.includes("Portal <strong>e2e</strong> da página inicial.") && html.includes("Gente do portal"));
    expect(portal.body).toContain("Portal <strong>e2e</strong> da página inicial.");
    expect(portal.body).toContain("Gente do portal");
    expect(mainOf(portal.body)).toMatch(/<h2[^>]*>Boas-vindas ao portal<\/h2>/);

    await page.getByRole("button", { name: "Passar para rascunho" }).click();
    await save(page);
    const draft = await fetchUntil(request, "/", (html) => !html.includes("Portal <strong>e2e</strong> da página inicial."));
    expect(draft.body).not.toContain("Portal <strong>e2e</strong> da página inicial.");
    expect(draft.body).toContain("Gente do portal"); // o diretório segue o interruptor dele (RN28)

    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await save(page);
    await fetchUntil(request, "/", (html) => html.includes("Portal <strong>e2e</strong> da página inicial."));
  });

  test("o administrador alterna para a PRÓPRIA página pelo seletor (?alvo=pagina) e edita a dele", async ({ page }) => {
    await login(page, ADMIN_UI);
    await openEditor(page, "/admin/pagina-inicial");
    await page.getByRole("navigation", { name: "Página inicial a editar" }).getByRole("link", { name: /Minha página inicial/ }).click();
    await expect(page).toHaveURL(/alvo=pagina$/);
    await expect(page.getByLabel("Mostrar as coleções e os documentos")).toBeVisible();
    await expect(page.getByLabel("Título do diretório")).toHaveCount(0);
    await expect(page.getByLabel(BODY_LABEL)).toBeVisible();
  });

  test("moderação: o administrador despublica e exclui o texto de um usuário pela árvore, com motivo; o dono vê os avisos no sino", async ({ page, request }) => {
    test.setTimeout(120_000);
    expect((await dona.put("/api/home", { data: { homeBody: "Texto moderável da dona.", homeStatus: "PUBLISHED" } })).status()).toBe(200);
    await fetchUntil(request, `/${DONA.handle}`, (html) => html.includes("Texto moderável da dona."));

    await login(page, ADMIN_UI);
    await page.goto(`/admin/usuarios/${donaId}/conteudo`);
    await page.waitForFunction(() => {
      const section = document.querySelector('section[aria-label^="Conteúdo de"]');
      return !!section && Object.keys(section).some((key) => key.startsWith("__reactProps$"));
    });
    const row = page.getByTestId("home-row");
    await expect(row.getByTestId("home-status")).toHaveText(/Publicado/);
    await expect(row.getByRole("link", { name: /Ver página pública/ })).toHaveAttribute("href", `/${DONA.handle}`);

    // Despublicar: o motivo vazio é recusado e nada muda.
    await row.getByRole("button", { name: "Despublicar: Página inicial" }).click();
    const unpublish = page.getByRole("dialog", { name: "Despublicar a página inicial?" });
    await unpublish.getByRole("button", { name: "Despublicar" }).click();
    await expect(unpublish).toBeVisible();
    expect((await (await dona.get("/api/home")).json()).data.homeStatus).toBe("PUBLISHED");
    await unpublish.getByLabel("Motivo").fill(HOSTILE_REASON);
    await unpublish.getByRole("button", { name: "Despublicar" }).click();
    await expect(page.getByText("A página inicial passou para rascunho.", { exact: false }).first()).toBeVisible();
    expect((await (await dona.get("/api/home")).json()).data.homeStatus).toBe("DRAFT");
    await expect(row.getByTestId("home-status")).toHaveText(/Rascunho/);
    const draft = await fetchUntil(request, `/${DONA.handle}`, (html) => !html.includes("Texto moderável da dona."));
    expect(draft.body).not.toContain("Texto moderável da dona.");

    // Excluir o texto, com o motivo.
    await row.getByRole("button", { name: "Excluir: Página inicial" }).click();
    const remove = page.getByRole("dialog", { name: "Excluir o texto da página inicial?" }).or(page.getByRole("alertdialog", { name: "Excluir o texto da página inicial?" }));
    await remove.getByLabel("Motivo").fill("excluída por duplicidade");
    await remove.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("O texto da página inicial foi excluído.", { exact: false }).first()).toBeVisible();
    expect((await (await dona.get("/api/home")).json()).data.homeBody).toBeNull();
    await expect(row.getByTestId("home-status")).toHaveText(/Sem texto/);
  });

  test("o dono vê os avisos da moderação no sino, com o motivo ESCAPADO (nunca vira marcação)", async ({ page }) => {
    await login(page, DONA);
    await expect(page.getByRole("button", { name: "Notificações, 2 não lidas" })).toBeVisible();
    await page.goto("/admin/notificacoes");
    const list = page.getByRole("region", { name: "Notificações" });
    await expect(list.getByText("Página inicial despublicada")).toBeVisible();
    await expect(list.getByText("Página inicial excluída")).toBeVisible();
    await expect(list.getByText(`Motivo: ${HOSTILE_REASON}`, { exact: false })).toBeVisible();
    await expect(list.getByText("Motivo: excluída por duplicidade", { exact: false })).toBeVisible();
    await expect(list.locator("b, script")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });

  test("a moderação nunca é sobre a PRÓPRIA página (403) e só o administrador a faz; outros métodos, 405", async () => {
    const self = (await (await admin.get("/api/users/me")).json()).data.id;
    expect((await admin.patch(`/api/users/${self}/home`, { data: { status: "DRAFT", reason: "x" } })).status()).toBe(403);
    expect((await admin.delete(`/api/users/${self}/home?reason=x`)).status()).toBe(403);
    expect((await dona.patch(`/api/users/${donaId}/home`, { data: { status: "DRAFT", reason: "x" } })).status()).toBe(403);
    expect((await dona.delete(`/api/users/${donaId}/home?reason=x`)).status()).toBe(403);
    // Sem o motivo: 422; sem texto (já excluído): 404; o texto de outro nunca é lido nem reescrito: 405.
    expect((await admin.patch(`/api/users/${donaId}/home`, { data: { status: "DRAFT" } })).status()).toBe(422);
    expect((await admin.delete(`/api/users/${donaId}/home?reason=x`)).status()).toBe(404);
    expect((await admin.get(`/api/users/${donaId}/home`)).status()).toBe(405);
    expect((await admin.put(`/api/users/${donaId}/home`, { data: { homeBody: "do admin" } })).status()).toBe(405);
    expect((await admin.post(`/api/users/${donaId}/home`, { data: {} })).status()).toBe(405);
  });

  test("o usuário comum não alcança o alvo do sistema: 404 na página, 403 na API", async ({ page }) => {
    await login(page, DONA);
    const response = await page.goto("/admin/pagina-inicial?alvo=sistema");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();

    const put = await dona.put("/api/configuration", { data: { homeStatus: "DRAFT" } });
    expect(put.status()).toBe(403);
    expect((await dona.get("/api/configuration")).status()).toBe(403);
    // A página inicial do portal segue publicada.
    expect((await (await admin.get("/api/configuration")).json()).data.homeStatus).toBe("PUBLISHED");
  });

  test("/admin/configuracoes redireciona com 308 para /admin/pagina-inicial; o painel marca a nova página como noindex", async ({ page, request }) => {
    const response = await dona.get("/admin/configuracoes", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location, "http://localhost").pathname).toBe("/admin/pagina-inicial");

    // Sem sessão, o Proxy do painel (que vem antes da página) leva ao login, preservando o destino antigo; depois
    // do login, o 308 da página leva à nova.
    const anonymous = await request.get("/admin/configuracoes", { maxRedirects: 0 });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers().location).toContain("/login?redirectTo=%2Fadmin%2Fconfiguracoes");

    await login(page, DONA);
    await page.goto("/admin/configuracoes");
    await expect(page).toHaveURL(/\/admin\/pagina-inicial$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
