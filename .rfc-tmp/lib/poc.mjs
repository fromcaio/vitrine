// Biblioteca das provas de conceito do RFC do Core (A-012). DESCARTÁVEL: não vai para a main.
// Reproduz a configuração de produção do better-auth (src/lib/auth.js) sobre um banco temporário
// DENTRO do worktree (.rfc-tmp/db), copiado do banco-modelo, e acrescenta os plugins em teste.
// Executar com:  node node_modules/tsx/dist/cli.mjs --tsconfig jsconfig.json .rfc-tmp/eN-*.mjs
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const BASE = "http://localhost:3000";
export const PASSWORD = "senha-ficticia-123";

/** Copia o banco-modelo para um banco novo e devolve o caminho absoluto. */
export function freshDb(name) {
  const target = path.join(ROOT, "db", `${name}.db`);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) fs.rmSync(target + suffix, { force: true });
  fs.copyFileSync(path.join(ROOT, "db", "template.db"), target);
  return target;
}

/**
 * Sobe o better-auth como em produção + plugins pedidos.
 * @param {string} name nome do banco temporário
 * @param {{ plugins?: (mods: any) => any[], authOptions?: object, noRateLimit?: boolean }} [options]
 */
export async function boot(name, { plugins, authOptions = {}, noRateLimit = false } = {}) {
  const dbFile = freshDb(name);
  process.env.DATABASE_URL = `file:${dbFile.replaceAll("\\", "/")}`;
  process.env.BETTER_AUTH_SECRET = "segredo-ficticio-do-rfc-core-0001-somente-para-provas";
  process.env.BETTER_AUTH_URL = BASE;
  delete globalThis.prisma;

  const { prisma } = await import("../../src/lib/db.js");
  const { betterAuth } = await import("better-auth");
  const { prismaAdapter } = await import("better-auth/adapters/prisma");
  const { nextCookies } = await import("better-auth/next-js");
  const adminMod = await import("better-auth/plugins");
  const accessMod = await import("better-auth/plugins/access");
  const adminAccess = await import("better-auth/plugins/admin/access");
  const mods = { ...adminMod, ...accessMod, ...adminAccess, prisma, betterAuth };

  const auth = betterAuth({
    appName: "Vitrine",
    database: prismaAdapter(prisma, { provider: "sqlite" }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128 },
    session: { expiresIn: 7 * 86400, updateAge: 86400 },
    rateLimit: noRateLimit
      ? { enabled: false }
      : { enabled: true, window: 60, max: 100, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    telemetry: { enabled: false },
    logger: { level: "error" },
    // campos próprios do Vitrine (propostas 2 e 3): nunca graváveis pela API pública do better-auth
    user: {
      additionalFields: {
        handle: { type: "string", required: false, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    ...authOptions,
    plugins: [...(plugins ? plugins(mods) : []), nextCookies()],
  });
  return { auth, prisma, dbFile, mods };
}

let ipSeq = 0;
export const nextIp = () => `10.1.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

/** Requisição às rotas do better-auth, como o navegador faria. */
export function request(auth, urlPath, { method = "POST", body, cookie, ip = nextIp(), origin = BASE } = {}) {
  const headers = new Headers({ "x-forwarded-for": ip });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return auth.handler(
    new Request(`${BASE}/api/auth${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

export const cookieOf = (response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

export async function signIn(auth, email, password = PASSWORD, extra = {}) {
  const response = await request(auth, "/sign-in/email", { body: { email, password }, ...extra });
  return { response, cookie: cookieOf(response), status: response.status, json: await response.clone().json().catch(() => null) };
}

/** Resume uma resposta em { status, code, message } para as tabelas do RFC. */
export async function brief(response) {
  const text = await response.clone().text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, code: json?.code ?? json?.error?.code ?? null, message: json?.message ?? json?.error?.message ?? (json ? undefined : text.slice(0, 80)) };
}

/** Executa uma chamada de auth.api.* e devolve { ok, status, code, message } sem lançar. */
export async function tryApi(fn) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, status: error?.statusCode ?? error?.status, code: error?.body?.code, message: error?.body?.message ?? error?.message };
  }
}

// textos longos viram "início…(N caracteres)" e BigInt vira número, para a saída ficar legível
const clip = (key, value) => {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "string" && value.length > 120 ? `${value.slice(0, 40)}…(${value.length} caracteres)` : value;
};
export const log = (title, value) => console.log(`\n### ${title}\n${typeof value === "string" ? value : JSON.stringify(value, clip, 2)}`);

/** Cria um administrador diretamente (bootstrap), sem passar por rota. */
export async function bootstrapAdmin(auth, email = "admin@exemplo.test", extra = {}) {
  const result = await auth.api.createUser({ body: { email, name: "Admin Fictício", password: PASSWORD, role: "admin", ...extra } });
  return result.user;
}

/** Cabeçalhos de uma requisição autenticada pelo cookie. */
export const withCookie = (cookie) => new Headers({ cookie });
