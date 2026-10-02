// Helpers de autenticação dos testes e2e: criar o administrador pelo comando real
// (`npm run admin:create`, RF22), entrar e sair pela interface (UC08, RF20).
import { execSync } from "node:child_process";
import { expect } from "@playwright/test";
import { ADMIN, e2eEnvironment, projectRoot } from "./env.js";

/**
 * Cria o administrador de teste com `npm run admin:create`, o único caminho de criação de usuário
 * (cadastro público desabilitado). Idempotente, como o comando. A saída do comando não é
 * repassada: ela só traz o e-mail, mas o hábito de não imprimir credenciais vale para os testes.
 * Requer as migrações já aplicadas (feito por `prepare-database.mjs`).
 */
export function createAdmin() {
  const { serverEnv } = e2eEnvironment();
  try {
    execSync("npm run admin:create", {
      cwd: projectRoot,
      env: { ...process.env, ...serverEnv },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    // `error.stderr` traz as mensagens do script (nunca a senha); `error.message` repete o comando.
    throw new Error(`npm run admin:create falhou (código ${error.status}):\n${error.stderr ?? error.message}`);
  }
}

/**
 * Entra pelo formulário de `/login` e espera o painel. Falha com mensagem clara se o formulário
 * não hidratar (o envio nativo, por POST, recarregaria `/login`).
 * @param {import("@playwright/test").Page} page
 * @param {{ email: string, password: string }} [credentials]
 */
export async function signIn(page, credentials = ADMIN) {
  await page.goto("/login");
  await waitForHydration(page);
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
}

/**
 * Encerra a sessão pelo botão "Sair" do painel e espera a página de login.
 * @param {import("@playwright/test").Page} page
 */
export async function signOut(page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Espera o React hidratar o formulário: o React 19 grava `__reactProps$…` nos elementos do DOM
 * que ele controla. Sem hidratação, `onSubmit` não existe e o envio cairia no POST nativo.
 * @param {import("@playwright/test").Page} page
 */
export async function waitForHydration(page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
  });
}
