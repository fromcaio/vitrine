// Senha provisória no navegador, sobre a aplicação de PRODUÇÃO (A-014 Parte 3b, itens 5 e 7; UC14, RN21;
// CT40): quem entra com a senha provisória é levado a /admin/senha, de qualquer página do painel, e
// depois da troca volta ao que pediu; a própria /admin/senha abre sem laço; sem a senha provisória, o
// painel abre normalmente. Contas FICTÍCIAS.
import { signIn, waitForHydration } from "./support/auth.js";
import { adminLogin, nextIp } from "./support/accounts.js";
import { e2eEnvironment } from "./support/env.js";
import { expect, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();

/** Cria a conta pelo administrador e devolve a senha provisória (a que o servidor gerou). */
async function createWithTemporaryPassword(admin, account) {
  const created = await admin.post("/api/users", { data: { email: account.email, name: account.name, handle: account.handle } });
  expect(created.status()).toBe(201);
  return (await created.json()).data.temporaryPassword;
}

/** Entra pelo formulário, SEM esperar o painel (a senha provisória o desvia). */
async function submitLogin(page, credentials) {
  await page.goto("/login");
  await waitForHydration(page);
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function newSession(browser) {
  const context = await browser.newContext({ baseURL, locale: "pt-BR", extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
  return { context, page: await context.newPage() };
}

test.describe.serial("senha provisória", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  const ACCOUNT = { email: "senha-e2e@exemplo.test", name: "Quem Troca a Senha", handle: "senha-e2e" };
  const NEW_PASSWORD = "senha-definitiva-e2e-9";
  let temporary = "";

  test.beforeAll(async ({ playwright }) => {
    admin = await adminLogin(playwright);
    temporary = await createWithTemporaryPassword(admin, ACCOUNT);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("com a senha provisória, o painel leva a /admin/senha, e a própria página abre sem laço", async ({ browser }) => {
    const { context, page } = await newSession(browser);
    await submitLogin(page, { email: ACCOUNT.email, password: temporary });

    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin$/);
    await expect(page.getByRole("heading", { name: "Trocar a senha", level: 1 })).toBeVisible();
    await expect(page.getByText("senha provisória", { exact: false }).first()).toBeVisible();

    // Qualquer página do painel, inclusive o editor com a consulta, leva à troca e guarda o destino.
    await page.goto("/admin/conteudo/novo?pai=qualquer");
    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin%2Fconteudo%2Fnovo%3Fpai%3Dqualquer$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin$/);

    // A página da troca se recarrega sem se redirecionar a si mesma.
    await page.goto("/admin/senha");
    await expect(page).toHaveURL(/\/admin\/senha$/);
    await expect(page.getByRole("heading", { name: "Trocar a senha", level: 1 })).toBeVisible();

    // E a API continua recusando, até a troca (CT40).
    const blocked = await context.request.get("/api/contents");
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    await context.close();
  });

  test("a troca devolve o usuário à página que ele pediu, e o painel passa a abrir", async ({ browser }) => {
    const { context, page } = await newSession(browser);
    await submitLogin(page, { email: ACCOUNT.email, password: temporary });
    // Espera o login terminar (a senha provisória o leva à troca) antes de pedir outra página.
    await expect(page).toHaveURL(/\/admin\/senha/);
    await page.goto("/admin/conteudo/novo");
    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin%2Fconteudo%2Fnovo$/);
    await waitForHydration(page);

    await page.getByLabel("Senha provisória").fill(temporary);
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmar a nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Definir nova senha" }).click();

    // Volta ao editor, que agora abre.
    await expect(page).toHaveURL(/\/admin\/conteudo\/novo$/);
    await expect(page.getByRole("heading", { name: "Novo conteúdo", level: 1 })).toBeVisible();
    expect((await context.request.get("/api/contents")).status()).toBe(200);
    await context.close();
  });

  test("com a senha definitiva, /admin e /admin/senha abrem; a troca deixa de ser obrigatória", async ({ browser }) => {
    const { context, page } = await newSession(browser);
    await signIn(page, { email: ACCOUNT.email, password: NEW_PASSWORD });

    await page.goto("/admin/senha");
    await expect(page).toHaveURL(/\/admin\/senha$/);
    await expect(page.getByLabel("Senha atual")).toBeVisible(); // a troca voluntária, não a obrigatória
    await expect(page.getByText("Você entrou com uma senha provisória")).toHaveCount(0);
    await context.close();
  });

  test("um redirectTo de outro site é descartado: a página abre e a sessão fica no site", async ({ browser }) => {
    const { context, page } = await newSession(browser);
    await signIn(page, { email: ACCOUNT.email, password: NEW_PASSWORD });

    await page.goto("/admin/senha?redirectTo=https%3A%2F%2Fmalicioso.test%2F");
    await expect(page.getByLabel("Senha atual")).toBeVisible();
    // O destino é validado no servidor (`passwordRedirectTarget`, com testes de unidade): aqui, só a prova de que a página abre e não sai do site.
    expect(new URL(page.url()).origin).toBe(baseURL);
    await context.close();
  });
});
