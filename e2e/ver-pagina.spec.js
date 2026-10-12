// "Ver página pública" no editor, sobre a aplicação de PRODUÇÃO (P-025; RF08, RN15): um documento publicado
// mostra o link no editor e ele abre a página pública (200, nova aba); um rascunho mostra a dica e não o link;
// na moderação, o link leva ao espaço do DONO. Contas e conteúdo FICTÍCIOS; a guarda de CSP vale em todo o fluxo.
import { signIn } from "./support/auth.js";
import { ADMIN } from "./support/env.js";
import { adminLogin, apiLogin, createAccount, createContent, nextIp } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const DONA = { email: "dona-ver-e2e@exemplo.test", name: "Dona do Ver", handle: "ver-dona", password: "senha-dona-ver-9" };

async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

test.describe.serial("ver a página pública", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  const ids = { owner: "", published: "", draft: "" };

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(180_000);
    admin = await adminLogin(playwright);
    const dona = await createAccount(playwright, admin, DONA);
    ids.owner = dona.id;
    const owner = await apiLogin(playwright, dona);
    const pasta = await createContent(owner, { title: "Pasta", slug: "pasta", type: "COLLECTION" });
    ids.published = (await createContent(owner, { title: "Aula publicada", slug: "aula", type: "DOCUMENT", parentId: pasta.id, body: "Texto publicado." })).id;
    ids.draft = (await createContent(owner, { title: "Aula rascunho", slug: "rascunho", type: "DOCUMENT", status: "DRAFT", body: "Segredo." })).id;
    await owner.dispose();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("publicado: o link abre a página pública em nova aba (200)", async ({ page }) => {
    await login(page, DONA);
    await page.goto(`/admin/conteudo/${ids.published}`);
    const link = page.getByRole("link", { name: "Ver página pública" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/ver-dona/pasta/aula");
    await expect(link).toHaveAttribute("target", "_blank");

    const popup = page.waitForEvent("popup");
    await link.click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(new URL(opened.url()).pathname).toBe("/ver-dona/pasta/aula");
    await expect(opened.getByText("Texto publicado.")).toBeVisible();
  });

  test("rascunho: a dica no lugar do link", async ({ page }) => {
    await login(page, DONA);
    await page.goto(`/admin/conteudo/${ids.draft}`);
    await expect(page.getByText("Publique o documento para ver a página pública.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver página pública" })).toHaveCount(0);
  });

  test("moderação: o link leva ao espaço do dono", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`/admin/usuarios/${ids.owner}/conteudo/${ids.published}`);
    const link = page.getByRole("link", { name: "Ver página pública" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/ver-dona/pasta/aula");
    const response = await page.request.get("/ver-dona/pasta/aula");
    expect(response.status()).toBe(200);
  });
});
