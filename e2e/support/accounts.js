// Contas e sessões dos specs e2e das páginas públicas (A-014 Parte 3b): criar uma conta pelo
// administrador, trocar a senha provisória e abrir sessões de API e de navegador, cada uma com o seu
// IP (o limite de login do better-auth é por IP: 5 por minuto). Dados FICTÍCIOS.
import { expect } from "@playwright/test";
import { signIn } from "./auth.js";
import { ADMIN, e2eEnvironment } from "./env.js";
import { newGuardedContext } from "./test.js";

const { baseURL } = e2eEnvironment();

let ipCounter = 0;
/** Um IP novo a cada chamada (faixa própria deste módulo). */
export const nextIp = () => `10.80.90.${++ipCounter}`;

/**
 * Contexto de requisições com o próprio jar de cookies, já autenticado.
 * @param {import("@playwright/test").PlaywrightWorkerArgs["playwright"]} playwright
 * @param {{ email: string, password: string }} credentials
 */
export async function apiLogin(playwright, credentials) {
  const context = await playwright.request.newContext({ baseURL });
  const response = await context.post("/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": nextIp() },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status(), `login de ${credentials.email}`).toBe(200);
  return context;
}

/**
 * O administrador de teste, com a sessão de API aberta. Os métodos de escrita esperam o `Retry-After` de
 * um 429 e tentam de novo: o grupo `users` do limite de escritas (20 por minuto, RN25) é por usuário, e
 * os specs, em série, criam contas, suspendem e excluem em nome do mesmo administrador.
 * @param {import("@playwright/test").PlaywrightWorkerArgs["playwright"]} playwright
 */
export async function adminLogin(playwright) {
  const context = await apiLogin(playwright, ADMIN);
  for (const method of /** @type {const} */ (["post", "put", "patch", "delete"])) {
    const original = context[method].bind(context);
    context[method] = async (...args) => {
      let response = await original(...args);
      for (let attempt = 0; attempt < 3 && response.status() === 429; attempt++) {
        const seconds = Number(response.headers()["retry-after"]) || 5;
        await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
        response = await original(...args);
      }
      return response;
    };
  }
  return context;
}

/**
 * Cria a conta pelo administrador e troca a senha provisória: devolve o identificador e as credenciais.
 * @param {import("@playwright/test").APIRequestContext} admin
 * @param {{ email: string, name: string, handle?: string | null, password: string }} account
 */
export async function createAccount(playwright, admin, account) {
  const body = { email: account.email, name: account.name, ...(account.handle ? { handle: account.handle } : {}) };
  const created = await admin.post("/api/users", { data: body });
  expect(created.status(), `criar ${account.email}`).toBe(201);
  const { data } = await created.json();
  const context = await apiLogin(playwright, { email: account.email, password: data.temporaryPassword });
  const changed = await context.post("/api/users/me/password", { data: { current: data.temporaryPassword, next: account.password } });
  expect(changed.status()).toBe(200);
  await context.dispose();
  return { id: data.id, email: account.email, password: account.password };
}

/**
 * Cria um conteúdo pela API da conta e devolve o registro.
 * @param {import("@playwright/test").APIRequestContext} owner
 * @param {Record<string, unknown>} body
 */
export async function createContent(owner, body) {
  const response = await owner.post("/api/contents", { data: body });
  expect(response.status(), `criar ${body.slug}`).toBe(201);
  return (await response.json()).data;
}

/**
 * Sessão de navegador (contexto novo, COM a guarda de CSP) já autenticada, com IP próprio.
 * @param {import("@playwright/test").Browser} browser
 * @param {{ email: string, password: string }} credentials
 */
export async function openSession(browser, credentials) {
  const context = await newGuardedContext(browser, { baseURL, locale: "pt-BR", extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
  const page = await context.newPage();
  await signIn(page, credentials);
  return { context, page };
}

/**
 * Busca a página até o texto aparecer (a regeneração do ISR acontece na visita seguinte à revalidação).
 * @param {import("@playwright/test").APIRequestContext} client
 * @param {string} url
 * @param {(body: string, response: import("@playwright/test").APIResponse) => boolean} done
 */
export async function fetchUntil(client, url, done, { attempts = 15, delay = 300 } = {}) {
  let response = await client.get(url, { maxRedirects: 0 });
  let body = await response.text();
  for (let attempt = 1; attempt < attempts && !done(body, response); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    response = await client.get(url, { maxRedirects: 0 });
    body = await response.text();
  }
  return { response, body };
}

/** Valor de `x-nextjs-cache` de uma resposta, ou `(sem cabeçalho)`. */
export const cacheState = (response) => response.headers()["x-nextjs-cache"] ?? "(sem cabeçalho)";
