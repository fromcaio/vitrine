// Ajustes de UI pós-v1 sobre a aplicação de PRODUÇÃO (P-027 e P-028; RF07, RF33, RF39, RN04, RN34), escritos pelo
// Arquiteto na integração (decisão do Engenheiro Chefe, sem sessão extra do Core):
//  - o sino de notificações nas PÁGINAS PÚBLICAS só existe para quem está logado (o anônimo não faz uma única
//    chamada a /api/notifications);
//  - renomear uma coleção muda o endereço de tudo o que está dentro dela: o endereço novo abre (200) e o antigo
//    responde 404.
// Contas e conteúdo FICTÍCIOS; a guarda de CSP de ./support/test.js vale em todo o fluxo.
import { signIn } from "./support/auth.js";
import { adminLogin, apiLogin, createAccount, createContent, nextIp } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const DONO = { email: "dono-posv1-e2e@exemplo.test", name: "Dono Pós V1", handle: "posv1-dono", password: "senha-dono-posv1-9" };

async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

test.describe.serial("ajustes de UI pós-v1", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  const ids = { aeds: "", intro: "", moderated: "" };

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(180_000);
    admin = await adminLogin(playwright);
    const dono = await createAccount(playwright, admin, DONO);
    const owner = await apiLogin(playwright, dono);
    const aeds = await createContent(owner, { title: "AEDS I", slug: "aeds-i", type: "COLLECTION" });
    const p1 = await createContent(owner, { title: "P1", slug: "p1", type: "COLLECTION", parentId: aeds.id });
    ids.aeds = aeds.id;
    ids.intro = (await createContent(owner, { title: "Introdução", slug: "introducao", type: "DOCUMENT", parentId: p1.id, body: "Texto da introdução." })).id;
    ids.moderated = (await createContent(owner, { title: "Aula moderada", slug: "moderada", type: "DOCUMENT", body: "Texto moderado." })).id;
    await owner.dispose();
    // Uma moderação do administrador gera uma notificação não lida para o dono.
    expect((await admin.patch(`/api/contents/${ids.moderated}`, { data: { status: "DRAFT", reason: "texto repetido" } })).status()).toBe(200);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("o anônimo não vê o sino nem faz chamada alguma à API de notificações na página pública", async ({ page }) => {
    const calls = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/notifications") || pathname.startsWith("/api/auth/get-session")) calls.push(pathname);
    });
    await page.goto(`/${DONO.handle}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page.getByRole("button", { name: /Notificações/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("o logado vê o sino com o contador na página pública, ao lado de Administração", async ({ page }) => {
    await login(page, DONO);
    await page.goto(`/${DONO.handle}`);
    await expect(page.getByRole("link", { name: "Administração" })).toBeVisible();
    const bell = page.getByRole("button", { name: /Notificações, \d+ não lida/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  test("renomear uma coleção muda o endereço de tudo dentro dela: o novo abre, o antigo dá 404", async ({ page }) => {
    await login(page, DONO);
    await page.goto("/admin/conteudo");
    const dialog = page.getByRole("dialog");
    // Antes de a página hidratar o clique não faz nada: repete até o diálogo abrir.
    await expect(async () => {
      await page.getByRole("button", { name: "Renomear: AEDS I" }).click();
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await dialog.getByLabel("Título").fill("AEDS II");
    // O endereço acompanha o título enquanto não foi editado à mão.
    await expect(dialog.getByLabel(/Slug/)).toHaveValue("aeds-ii");
    await expect(dialog.getByTestId("aviso-endereco")).toContainText("deixam de funcionar");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    const novo = `/${DONO.handle}/aeds-ii/p1/introducao`;
    const antigo = `/${DONO.handle}/aeds-i/p1/introducao`;
    await expect.poll(async () => (await page.request.get(novo)).status(), { timeout: 20_000 }).toBe(200);
    await expect.poll(async () => (await page.request.get(antigo)).status(), { timeout: 20_000 }).toBe(404);
    await expect.poll(async () => (await page.request.get(`/${DONO.handle}/aeds-i`)).status(), { timeout: 20_000 }).toBe(404);
  });
});
