// Utilitários dos testes do Core: requisições à API com sessão REAL do better-auth, criada no
// banco temporário do arquivo de teste (tests/setup/per-file.js). Dados fictícios.
import "./env";
import { resetRateLimits } from "@/app/api/_lib/rate-limit";
import { auth, ensureInitialAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const BASE_URL = "http://localhost:3000";

/** Administrador fictício. */
export const ADMIN = { name: "Ada Fictícia", email: "admin@exemplo.test", password: "senha-ficticia-123" };

/** Senha fictícia comum aos usuários de teste. */
export const PASSWORD = "senha-ficticia-123";

/** Remove conteúdos e configuração, mantendo usuários e sessões. */
export async function resetContent() {
  resetRateLimits();
  await prisma.content.deleteMany();
  await prisma.configuration.deleteMany();
}

/** Remove tudo, inclusive usuários (sessões e contas saem em cascata). */
export async function resetDatabase() {
  await resetContent();
  await prisma.verification.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.appearance.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Recua o `updatedAt` (a `version` da RN18) de um conteúdo recém-criado para o passado, e devolve a linha
 * já recuada. A `version` é o `updatedAt` com precisão de milissegundo: um teste que cria o conteúdo e o
 * atualiza em seguida pode cair no MESMO milissegundo, e a versão "velha" fica igual à atual (sem
 * conflito; o teste falhava de vez em quando, A-014 Parte 3d, item 2). Com a criação no passado, a
 * atualização seguinte muda a versão de forma determinística, sem esperar o relógio.
 * @param {{ id: string }} content
 * @param {number} [ms] quanto recuar
 */
export function aged(content, ms = 60_000) {
  return prisma.content.update({ where: { id: content.id }, data: { updatedAt: new Date(Date.now() - ms) } });
}

// O limitador de tentativas conta por IP e por rota: cada chamada usa um IP próprio, salvo
// quando o teste quer justamente esgotar o limite.
let ipCounter = 0;
export function nextIp() {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

/**
 * Requisição às rotas do better-auth (/api/auth/*), como o navegador faria.
 * @param {string} path ex.: "/sign-in/email"
 * @param {{ method?: string, body?: unknown, cookie?: string, ip?: string }} [options]
 */
export function authRequest(path, { method = "POST", body, cookie, ip = nextIp() } = {}) {
  const headers = new Headers({ origin: BASE_URL, "x-forwarded-for": ip });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/**
 * Converte os cabeçalhos Set-Cookie de uma resposta no cabeçalho Cookie da próxima requisição.
 * @param {Response} response
 */
export function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Login pela rota real do better-auth.
 * @param {{ email: string, password: string }} [credentials]
 * @param {{ ip?: string }} [options]
 */
export async function signIn(credentials = ADMIN, options = {}) {
  const response = await authRequest("/sign-in/email", {
    body: { email: credentials.email, password: credentials.password },
    ...options,
  });
  return { response, cookie: cookieFrom(response) };
}

/** Cria o administrador (idempotente) e devolve o cabeçalho Cookie de uma sessão válida. */
export async function createAdminSession() {
  const { user } = await ensureInitialAdmin(ADMIN);
  const { response, cookie } = await signIn();
  if (response.status !== 200) throw new Error(`Login de teste falhou: ${response.status}`);
  return { cookie, userId: /** @type {{ id: string }} */ (user).id };
}

/**
 * Cria um usuário de teste diretamente (sem sessão de administrador), com credencial de senha. Só
 * para preparar o cenário: nenhuma rota do produto chama `auth.api.*` sem `headers`.
 * @param {{
 *   email: string, name?: string, role?: "admin" | "user", handle?: string | null, password?: string,
 *   mustChangePassword?: boolean, banned?: boolean, banReason?: string | null, banExpires?: Date | null
 * }} spec
 * @returns {Promise<{ id: string, email: string, password: string }>}
 */
export async function createTestUser(spec) {
  const { email, name = spec.email.split("@")[0], role = "user", handle, password = PASSWORD } = spec;
  /** @type {Record<string, unknown>} */
  const data = {};
  if (handle) data.handle = handle;
  if (spec.mustChangePassword) data.mustChangePassword = true;
  if (spec.banned) {
    data.banned = true;
    data.banReason = spec.banReason ?? null;
    data.banExpires = spec.banExpires ?? null;
  }
  const { user } = await auth.api.createUser({ body: { email, name, password, role, data } });
  return { id: user.id, email, password };
}

/**
 * Cria um usuário de teste e entra com ele pela rota real do better-auth.
 * @param {Parameters<typeof createTestUser>[0]} spec
 * @returns {Promise<{ id: string, email: string, password: string, cookie: string }>}
 */
export async function createUserSession(spec) {
  const user = await createTestUser(spec);
  const { response, cookie } = await signIn({ email: user.email, password: user.password });
  if (response.status !== 200) throw new Error(`Login de teste falhou (${spec.email}): ${response.status}`);
  return { ...user, cookie };
}

/**
 * Requisição a um Route Handler da API. Em mutações, envia a origem do próprio site, como o
 * navegador; `body` em texto é enviado sem alteração (para testar JSON malformado).
 * @param {string} path ex.: "/api/contents"
 * @param {{ method?: string, body?: unknown, cookie?: string, headers?: Record<string, string> }} [options]
 */
export function apiRequest(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const all = new Headers(method === "GET" ? {} : { origin: BASE_URL });
  if (body !== undefined) all.set("content-type", "application/json");
  if (cookie) all.set("cookie", cookie);
  for (const [name, value] of Object.entries(headers)) all.set(name, value);
  return new Request(`${BASE_URL}${path}`, {
    method,
    headers: all,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

/**
 * Segundo argumento de um Route Handler com segmento dinâmico (`params` é assíncrono no Next.js 16).
 * @param {Record<string, string>} params
 */
export function routeContext(params) {
  return { params: Promise.resolve(params) };
}
