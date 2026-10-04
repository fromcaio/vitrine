// Servidor de autenticação do Vitrine: better-auth 1.7.x com o adaptador do Prisma (ADR-004;
// Cap. 5 §5.6). E-mail e senha, sessão persistida no banco e cadastro público desabilitado. Com o
// M16 (ADR-029), o plugin `admin` dá os papéis `admin` e `user`, mas só o Vitrine decide quem pode
// o quê: as rotas brutas do plugin ficam fechadas (src/app/api/_lib/auth-guard.js) e as operações
// sobre usuários passam por /api/users, que autorizam primeiro (src/lib/authz.js).
//
// Variáveis de ambiente lidas pelo próprio better-auth (nomes conferidos na versão instalada):
//   BETTER_AUTH_SECRET  segredo que assina os cookies de sessão (obrigatório em produção)
//   BETTER_AUTH_URL     URL pública base do site (origem confiável das requisições)
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { createAccessControl } from "better-auth/plugins/access";
import { admin as adminPlugin } from "better-auth/plugins/admin";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { isSuspended } from "@/lib/authz";
import { countActiveAdmins, getUserByHandle, prisma } from "@/lib/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, handleError, normalizeHandle } from "@/lib/validators";

const DAY_IN_SECONDS = 60 * 60 * 24;

// Papéis personalizados (ADR-029, item 1): o administrador não tem `impersonate`, `impersonate-admins`
// nem `set-email` (a personificação fica desligada e nenhuma rota troca o e-mail); o usuário comum
// não tem nenhuma permissão do plugin.
const accessControl = createAccessControl(defaultStatements);
const roles = {
  admin: accessControl.newRole({
    user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
    session: ["list", "revoke", "delete"],
  }),
  user: accessControl.newRole({ user: [], session: [] }),
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

/**
 * Mensagem de quem tenta entrar com a conta suspensa (RN23): o motivo e o prazo, se houver. Só é
 * mostrada quando a senha está correta (o plugin cria a sessão depois de verificá-la), de modo que
 * uma senha errada continua recebendo a mensagem genérica e não revela a suspensão (UC08, A4).
 * @param {{ banReason?: string | null, banExpires?: Date | string | null }} user
 */
export function bannedUserMessage(user) {
  const reason = user.banReason ? ` Motivo: ${user.banReason}` : "";
  const until = user.banExpires ? ` A suspensão vai até ${dateFormat.format(new Date(user.banExpires))} (UTC).` : "";
  return `Sua conta está suspensa.${reason}${until}`;
}

/**
 * Normaliza e valida o handle de um usuário em qualquer criação ou atualização que passe pelo
 * adaptador interno do better-auth (rota de usuários, `admin:create`): um só ponto (ADR-029, item 10).
 * Os campos que o hook não conhece passam sem alteração.
 * @template {Record<string, any>} T
 * @param {T} data
 * @returns {{ data: T }}
 */
function withValidHandle(data) {
  if (!("handle" in data) || data.handle === undefined) return { data };
  const handle = normalizeHandle(data.handle);
  const message = handle === null ? null : handleError(handle);
  if (message) throw APIError.from("BAD_REQUEST", { code: "INVALID_HANDLE", message });
  return { data: { ...data, handle } };
}

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
    // Sem cache de cookie (ADR-029, item 7): com ele, um usuário suspenso continuaria autenticado
    // até o cookie vencer. O custo é uma consulta por requisição, aceita no perfil de uso.
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      // `input: false`: nenhuma rota do better-auth grava estes campos; só o Vitrine (RN20, RN21).
      handle: { type: "string", required: false, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: { before: async (user) => withValidHandle(user) },
      update: { before: async (data) => withValidHandle(data) },
    },
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
  plugins: [
    adminPlugin({
      ac: accessControl,
      roles,
      defaultRole: "user",
      adminRoles: ["admin"],
      bannedUserMessage,
    }),
    // Grava os cookies de sessão quando a API é chamada em Server Functions; deve ser o último.
    nextCookies(),
  ],
});

/**
 * Usuário da sessão, com os campos do plugin `admin` e do Vitrine.
 * @typedef {{
 *   id: string, name: string, email: string, role: string, handle: string | null,
 *   banned: boolean | null, banReason: string | null, banExpires: Date | null,
 *   mustChangePassword: boolean
 * }} SessionUser
 */

/**
 * Sessão corrente, validada no banco (RF21), ou `null` se ausente, inválida, expirada (RN12) ou do
 * usuário suspenso (RN23): a suspensão é conferida aqui, com o prazo vencido a `banExpires`, para
 * que nenhuma rota nem página dependa de a sessão ter sido revogada.
 * @param {Headers} headers cabeçalhos da requisição (`request.headers` ou `await headers()`)
 * @returns {Promise<{ session: { id: string, userId: string, expiresAt: Date }, user: SessionUser } | null>}
 */
export async function getSession(headers) {
  const current = /** @type {any} */ (await auth.api.getSession({ headers }));
  if (!current || isSuspended(current.user)) return null;
  return current;
}

/**
 * Resultado de `ensureInitialAdmin`:
 * - `created`: o administrador foi criado;
 * - `exists`: o e-mail já é de um administrador ativo (nada foi alterado, nem a senha);
 * - `repaired`: o administrador existia sem credencial (execução interrompida) e ela foi criada;
 * - `recovered`: não restava administrador ativo e este e-mail (de um usuário comum ou suspenso) foi
 *   promovido (RN22);
 * - `conflict`: já existe administrador ativo e o e-mail é outro, ou o e-mail é de um não
 *   administrador (`reason`: `admin-exists` | `not-admin` | `handle-taken`);
 * - `invalid`: o handle não passa na RN20 (`message`).
 * @typedef {{
 *   status: "created" | "exists" | "repaired" | "recovered" | "conflict" | "invalid",
 *   user: { id: string, email: string, name: string } | null,
 *   reason?: "admin-exists" | "not-admin" | "handle-taken", message?: string
 * }} InitialAdminResult
 */

/** @param {any} error */
const isUniqueViolation = (error) =>
  error?.code === "P2002" || /Unique constraint/i.test(String(error?.message ?? error?.cause?.message ?? ""));

/**
 * Cria o primeiro administrador de forma idempotente (RF22, D-03, ADR-029 item 8) e recupera o
 * acesso quando não resta administrador ativo (RN22). Não passa pela rota de cadastro, que está
 * desabilitada: usa o adaptador interno do better-auth, com o mesmo algoritmo de hash de senha do
 * login e os mesmos ganchos do handle. A validação de formato das credenciais é de
 * `adminBootstrapSchema`. É o único código que cria usuário sem sessão de administrador.
 * @param {{ email: string, password: string, name: string, handle?: string | null }} input
 * @returns {Promise<InitialAdminResult>}
 */
export async function ensureInitialAdmin({ email, password, name, handle }) {
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

  const wantedHandle = normalizeHandle(handle);
  if (wantedHandle !== null) {
    const message = handleError(wantedHandle);
    if (message) return { status: "invalid", user: null, message };
  }

  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, { includeAccounts: true });
  if (existing?.user) {
    const found = /** @type {any} */ (existing.user);
    const hasCredential = existing.accounts.some((account) => account.providerId === "credential");
    const activeAdmin = found.role === "admin" && !isSuspended(found);
    if (!activeAdmin) {
      // Um usuário comum ou suspenso só é promovido quando não resta nenhum administrador ativo.
      if ((await countActiveAdmins()) > 0) return { status: "conflict", reason: "not-admin", user: publicUser(found) };
      await ctx.internalAdapter.updateUser(found.id, { role: "admin", banned: false, banReason: null, banExpires: null });
      if (!hasCredential) await linkCredential(found.id);
      return { status: "recovered", user: publicUser(found) };
    }
    if (!hasCredential) {
      await linkCredential(found.id);
      return { status: "repaired", user: publicUser(found) };
    }
    return { status: "exists", user: publicUser(found) };
  }

  if ((await countActiveAdmins()) > 0) return { status: "conflict", reason: "admin-exists", user: null };
  if (wantedHandle !== null && (await getUserByHandle(wantedHandle, { includeSuspended: true }))) {
    return { status: "conflict", reason: "handle-taken", user: null };
  }

  try {
    const user = await ctx.internalAdapter.createUser({
      name,
      email: normalizedEmail,
      // Não há envio de e-mail nesta versão; o administrador é criado por quem instala o sistema.
      emailVerified: true,
      role: "admin",
      mustChangePassword: false,
      ...(wantedHandle === null ? {} : { handle: wantedHandle }),
    });
    await linkCredential(user.id);
    return { status: "created", user: publicUser(user) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Outra execução criou o mesmo usuário entre a consulta e a criação: o comando é idempotente.
    const again = await ctx.internalAdapter.findUserByEmail(normalizedEmail);
    if (again?.user) return { status: "exists", user: publicUser(again.user) };
    throw error;
  }
}

/**
 * Define a senha de uma conta pelo terminal (`npm run admin:reset-password`; ADR-029, item 8):
 * grava o novo hash (cria a credencial se faltar), revoga todas as sessões da conta e liga o
 * marcador de senha provisória, de modo que a conta tem de trocá-la no próximo acesso (RN21). Não
 * muda a suspensão: devolve `suspended` para o comando avisar. A senha nunca é impressa.
 * @param {{ email: string, password: string }} input
 * @returns {Promise<
 *   { status: "not-found" } | { status: "reset", user: { id: string, email: string }, sessionsRevoked: number, suspended: boolean }
 * >}
 */
export async function resetUserPassword({ email, password }) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase(), { includeAccounts: true });
  if (!found?.user) return { status: "not-found" };
  const user = /** @type {any} */ (found.user);

  const hash = await ctx.password.hash(password);
  if (found.accounts.some((account) => account.providerId === "credential")) {
    await ctx.internalAdapter.updatePassword(user.id, hash);
  } else {
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  }
  const sessionsRevoked = (await ctx.internalAdapter.listSessions(user.id)).length;
  await ctx.internalAdapter.deleteUserSessions(user.id);
  await ctx.internalAdapter.updateUser(user.id, { mustChangePassword: true });
  return { status: "reset", user: { id: user.id, email: user.email }, sessionsRevoked, suspended: isSuspended(user) };
}
