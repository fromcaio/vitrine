// Servidor de autenticação do Vitrine: better-auth 1.7.x com o adaptador do Prisma (ADR-004;
// Cap. 5 §5.6). E-mail e senha, sessão persistida no banco e cadastro público desabilitado: o
// único caminho para criar um usuário é `ensureInitialAdmin`, chamado por `npm run admin:create`.
//
// Variáveis de ambiente lidas pelo próprio better-auth (nomes conferidos na versão instalada):
//   BETTER_AUTH_SECRET  segredo que assina os cookies de sessão (obrigatório em produção)
//   BETTER_AUTH_URL     URL pública base do site (origem confiável das requisições)
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validators";

const DAY_IN_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "Vitrine",
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // RF22 (D-03): sem cadastro público; POST /api/auth/sign-up/email é recusado.
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  session: {
    // RN12: a sessão expira em 7 dias; em uso, é renovada no máximo uma vez por dia.
    expiresIn: 7 * DAY_IN_SECONDS,
    updateAge: DAY_IN_SECONDS,
  },
  rateLimit: {
    // RNF03: limitação de tentativas em todos os ambientes (o padrão seria só em produção).
    // Contadores em memória, por IP (cabeçalho x-forwarded-for) e por rota: a implantação é de
    // instância única (ADR-011).
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  // RNF15: nenhum dado de uso é enviado a terceiros.
  telemetry: { enabled: false },
  // Grava os cookies de sessão quando a API é chamada em Server Functions; deve ser o último.
  plugins: [nextCookies()],
});

/**
 * Sessão corrente, validada no banco (RF21), ou `null` se ausente, inválida ou expirada (RN12).
 * @param {Headers} headers cabeçalhos da requisição (`request.headers` ou `await headers()`)
 * @returns {Promise<{ session: { id: string, userId: string, expiresAt: Date }, user: { id: string, name: string, email: string } } | null>}
 */
export async function getSession(headers) {
  return /** @type {any} */ (await auth.api.getSession({ headers }));
}

/**
 * Resultado de `ensureInitialAdmin`:
 * - `created`: o administrador foi criado;
 * - `exists`: já havia um usuário com este e-mail (nada foi alterado, nem a senha);
 * - `repaired`: o usuário existia sem credencial (execução anterior interrompida) e ela foi criada;
 * - `conflict`: já existe outro usuário; nesta versão há um único administrador (D-13).
 * @typedef {{ status: "created" | "exists" | "repaired" | "conflict", user: { id: string, email: string, name: string } | null }} InitialAdminResult
 */

/**
 * Cria o administrador inicial de forma idempotente (RF22, D-03). Não passa pela rota de
 * cadastro, que está desabilitada: usa o adaptador interno do better-auth, com o mesmo algoritmo
 * de hash de senha do login. A validação de formato das credenciais é de `adminBootstrapSchema`.
 * @param {{ email: string, password: string, name: string }} input
 * @returns {Promise<InitialAdminResult>}
 */
export async function ensureInitialAdmin({ email, password, name }) {
  const ctx = await auth.$context;
  const normalizedEmail = email.trim().toLowerCase();
  const publicUser = (/** @type {any} */ user) => ({ id: user.id, email: user.email, name: user.name });
  const linkCredential = async (/** @type {string} */ userId) =>
    ctx.internalAdapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: await ctx.password.hash(password),
    });

  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, { includeAccounts: true });
  if (existing?.user) {
    if (existing.accounts.some((account) => account.providerId === "credential")) {
      return { status: "exists", user: publicUser(existing.user) };
    }
    await linkCredential(existing.user.id);
    return { status: "repaired", user: publicUser(existing.user) };
  }

  if ((await ctx.internalAdapter.countTotalUsers()) > 0) {
    return { status: "conflict", user: null };
  }

  const user = await ctx.internalAdapter.createUser({
    name,
    email: normalizedEmail,
    // Não há envio de e-mail nesta versão; o administrador é criado por quem instala o sistema.
    emailVerified: true,
  });
  await linkCredential(user.id);
  return { status: "created", user: publicUser(user) };
}
