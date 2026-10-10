// Teste de fumaça (D-12, ADR-017): o fluxo mínimo que prova que a aplicação de PRODUÇÃO
// (`next build` + `next start`) sobe, hidrata e autentica. Cobre a CSP (ADR-022), UC08 (entrar),
// RF20 (sair) e RF21 (a API exige sessão).
import { signIn, signOut, waitForHydration } from "./support/auth.js";
import { expect, test } from "./support/test.js";

test.describe("fumaça", () => {
  test("/login envia a CSP, hidrata o formulário e não registra violações", async ({ page, cspViolations }) => {
    const response = await page.goto("/login");
    // Prova de que o servidor roda em produção: sem NODE_ENV=production a CSP não é enviada e o
    // teste de violações seria vazio.
    const csp = response?.headers()["content-security-policy"];
    expect(csp, "Content-Security-Policy da página de login").toContain("script-src 'self' 'unsafe-inline'");

    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    expect(cspViolations).toEqual([]);
  });

  test("entra, vê o painel e sai", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    await signOut(page);
    // A sessão acabou: o Proxy devolve o painel ao login, com o destino guardado (UC08).
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fadmin$/);
  });

  test("credenciais erradas mostram uma única mensagem genérica", async ({ page }) => {
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByLabel("E-mail").fill("ninguem@exemplo.test");
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("E-mail ou senha inválidos.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("o otimizador /_next/image está desligado (404, não 200 nem 400) e o favicon segue servido", async ({ page, request, cspViolations }) => {
    // O projeto não usa `next/image`; `images.unoptimized` faz o servidor responder 404 à rota (RNF03, P-023).
    const params = "url=%2Ffavicon.ico&w=64&q=75";
    const optimizer = await request.get(`/_next/image?${params}`);
    expect(optimizer.status()).toBe(404);
    // Parâmetros inválidos também dão 404 (com o otimizador ligado seriam 400).
    expect((await request.get("/_next/image")).status()).toBe(404);
    expect((await request.get("/_next/image?url=https%3A%2F%2Fexemplo.com%2Fa.png&w=64&q=75")).status()).toBe(404);

    // No navegador, sem violação de CSP; os cabeçalhos de segurança seguem na resposta.
    const navigated = await page.goto(`/_next/image?${params}`);
    expect(navigated?.status()).toBe(404);
    expect(navigated?.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(cspViolations).toEqual([]);

    const favicon = await request.get("/favicon.ico");
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()["content-type"]).toContain("image/x-icon");
  });

  test("/api/configuration sem sessão responde 401", async ({ request }) => {
    const response = await request.get("/api/configuration");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.data).toBeUndefined();
  });
});
