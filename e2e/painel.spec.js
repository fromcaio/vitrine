// Aparência, configuração e portal pela interface, sobre a aplicação de PRODUÇÃO (A-014 Parte 3c, itens 1 e
// 2; RF18, RF31, RN19, RN25; CT23, CT24, CT44): o dono salva a aparência dele (aviso por modo, a
// notificação CONTRAST, o espaço dele regenerado sem tocar o de outro dono); o administrador salva a
// configuração e o portal regenera; o usuário comum recebe 404 em /admin/configuracoes; o portal tem a
// rede de segurança de 60 s. Contas FICTÍCIAS; a guarda de CSP de ./support/test.js vale em todo teste.
import { waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, cacheState, createAccount, createContent, fetchUntil, openSession } from "./support/accounts.js";
import { ADMIN } from "./support/env.js";
import { expect, test } from "./support/test.js";

const ANA = { email: "ana-painel-e2e@exemplo.test", name: "Ana do Painel", handle: "pnl-ana", password: "senha-ana-pnl-9" };
const BETO = { email: "beto-painel-e2e@exemplo.test", name: "Beto do Painel", handle: "pnl-beto", password: "senha-beto-pnl-9" };

test.describe.serial("aparência, configuração e portal", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  /** @type {import("@playwright/test").APIRequestContext} */
  let beto;

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    const anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    ana = await apiLogin(playwright, anaAccount);
    beto = await apiLogin(playwright, betoAccount);
    await createContent(ana, { title: "Início da Ana", slug: "inicio", type: "DOCUMENT", body: "Texto da Ana." });
    await createContent(beto, { title: "Início do Beto", slug: "inicio", type: "DOCUMENT", body: "Texto do Beto." });
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
    await beto?.dispose();
  });

  test("CT23, CT24: o dono salva a aparência pela interface; o aviso por modo, a notificação CONTRAST e o espaço dele regenerado, sem tocar o de outro", async ({ browser, request }) => {
    // Aquece os dois espaços: a segunda visita é HIT.
    for (const path of ["/pnl-ana/inicio", "/pnl-beto/inicio"]) {
      await request.get(path);
      expect(cacheState((await fetchUntil(request, path, (_b, r) => cacheState(r) === "HIT", { attempts: 5 })).response), path).toBe("HIT");
    }

    const { context, page } = await openSession(browser, ANA);
    await page.goto("/admin/aparencia");
    await expect(page.getByRole("heading", { name: "Aparência do seu espaço", level: 1 })).toBeVisible();
    await waitForHydration(page);
    // A aparência é a do usuário da sessão: o nome padrão é o dele.
    await expect(page.getByLabel("Nome do espaço")).toHaveValue("Ana do Painel");

    await page.getByLabel("Nome do espaço").fill("Espaço do painel e2e");
    await page.getByRole("group", { name: "Paleta clara" }).getByLabel("Primária", { exact: true }).fill("#7c3aed");
    const dark = page.getByRole("group", { name: "Paleta noturna" });
    await dark.getByLabel("Primária", { exact: true }).fill("#222222"); // quase o fundo noturno: contraste insuficiente
    await page.getByRole("button", { name: "Salvar a aparência" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Aparência salva" })).toBeVisible();
    // O aviso do servidor, só no modo noturno, e a gravação não foi bloqueada.
    await expect(dark.getByText("Contraste na última gravação (servidor)")).toBeVisible();
    await expect(dark.locator('[data-field="darkPrimaryColor"]')).toBeVisible();
    await expect(page.getByRole("group", { name: "Paleta clara" }).locator('[data-field="primaryColor"]')).toHaveCount(0);

    // A notificação CONTRAST do modo noturno, ao dono, em português.
    const listed = (await (await ana.get("/api/notifications")).json()).data;
    const notice = listed.find((item) => item.type === "CONTRAST" && item.data.mode === "dark");
    expect(notice, JSON.stringify(listed)).toBeTruthy();
    expect(notice).toMatchObject({ title: "Contraste insuficiente no modo noturno", resolvedAt: null });
    expect(notice.data.scope).toBe("appearance");

    // O espaço da Ana regenerou com a paleta nova e o nome novo; o do Beto não foi tocado.
    const regenerated = await fetchUntil(request, "/pnl-ana/inicio", (html) => html.includes("--vitrine-dark-primary:#222222"));
    expect(regenerated.body).toContain("--vitrine-light-primary:#7c3aed");
    expect(regenerated.body).toContain("Espaço do painel e2e");
    const untouched = await request.get("/pnl-beto/inicio");
    expect(cacheState(untouched)).toBe("HIT");
    expect(await untouched.text()).not.toContain("#7c3aed");

    // Corrigir a paleta noturna resolve a notificação.
    await dark.getByLabel("Primária", { exact: true }).fill("#60a5fa");
    await page.getByRole("button", { name: "Salvar a aparência" }).click();
    await expect(dark.getByText("O servidor não encontrou problemas de contraste.")).toBeVisible();
    const after = (await (await ana.get("/api/notifications")).json()).data;
    expect(after.find((item) => item.type === "CONTRAST" && item.data.mode === "dark").resolvedAt).not.toBeNull();
    await context.close();
  });

  test("RF31: a página de aparência de cada usuário é a dele (o administrador vê a dele, não a de outro)", async ({ browser }) => {
    const { context, page } = await openSession(browser, ADMIN);
    await page.goto("/admin/aparencia");
    await waitForHydration(page);

    await expect(page.getByLabel("Nome do espaço")).toHaveValue(ADMIN.name);
    await expect(page.getByLabel("Nome do espaço")).not.toHaveValue("Espaço do painel e2e");
    await context.close();
  });

  test("CT23: o administrador salva a configuração pela interface e o portal regenera", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ADMIN);
    await page.goto("/admin/configuracoes");
    await expect(page.getByRole("heading", { name: "Configurações do site", level: 1 })).toBeVisible();
    await waitForHydration(page);

    await page.getByLabel("Nome do site").fill("Portal do painel e2e");
    await page.getByLabel("Texto do portal (Markdown)").fill("Texto **do painel** e2e.");
    await page.getByRole("button", { name: "Salvar a aparência do sistema" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aparência do sistema salva" })).toBeVisible();
    await page.getByRole("button", { name: "Salvar o portal" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Portal salvo" })).toBeVisible();

    const { body } = await fetchUntil(request, "/", (html) => html.includes("Texto <strong>do painel</strong> e2e."));
    expect(body).toContain("Portal do painel e2e");
    await context.close();
  });

  test("RN19: o usuário comum recebe 404 em /admin/configuracoes; sem sessão, vai ao login; as duas páginas têm noindex", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ANA);
    const response = await page.goto("/admin/configuracoes");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();

    // O painel marca as duas páginas como noindex.
    await page.goto("/admin/aparencia");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await context.close();

    for (const path of ["/admin/configuracoes", "/admin/aparencia"]) {
      const anon = await request.get(path, { maxRedirects: 0 });
      expect(anon.status(), path).toBe(307);
      expect(anon.headers().location, path).toContain("/login?redirectTo=");
    }
  });

  test("R-016: o portal tem a rede de segurança de 60 s (a regeneração sem PUT depois do prazo)", async ({ request }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("s-maxage=60");
  });
});
