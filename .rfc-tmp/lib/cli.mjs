// Proposta 8: código proposto para os comandos de terminal (src/lib/auth.js: ensureInitialAdmin e resetPassword).
import { handleError } from "./handle.mjs";

const ACTIVE = [{ banned: false }, { banned: null }];
const isUniqueViolation = (e) => e?.code === "P2002" || /Unique constraint/i.test(String(e?.message ?? e?.cause?.message ?? ""));

/**
 * admin:create. Resultados:
 *  created   - primeiro administrador criado (ou recriado, se não restava nenhum ativo);
 *  exists    - o e-mail já é de um administrador ativo: nada muda, nem a senha;
 *  repaired  - o administrador existia sem credencial (execução interrompida): a senha foi definida;
 *  recovered - o e-mail era de um usuário comum ou suspenso e NÃO restava administrador ativo: promovido;
 *  conflict  - já existe administrador ativo e o e-mail é outro, ou o e-mail é de um não administrador.
 */
export async function ensureInitialAdmin(auth, prisma, { email, password, name, handle }) {
  const ctx = await auth.$context;
  const normalized = email.trim().toLowerCase();
  const pub = (u) => ({ id: u.id, email: u.email });
  if (handle !== undefined && handle !== null) {
    const problem = handleError(handle);
    if (problem) return { status: "invalid", message: problem };
  }
  const link = async (userId) => ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: await ctx.password.hash(password) });
  const activeAdmins = () => prisma.user.count({ where: { role: "admin", OR: ACTIVE } });

  const existing = await ctx.internalAdapter.findUserByEmail(normalized, { includeAccounts: true });
  if (existing?.user) {
    const u = existing.user;
    const isActiveAdmin = u.role === "admin" && !(u.banned && (!u.banExpires || new Date(u.banExpires) > new Date()));
    if (!isActiveAdmin) {
      if ((await activeAdmins()) > 0) return { status: "conflict", reason: "not-admin", user: pub(u) };
      await ctx.internalAdapter.updateUser(u.id, { role: "admin", banned: false, banReason: null, banExpires: null });
      if (!existing.accounts.some((a) => a.providerId === "credential")) await link(u.id);
      return { status: "recovered", user: pub(u) };
    }
    if (!existing.accounts.some((a) => a.providerId === "credential")) {
      await link(u.id);
      return { status: "repaired", user: pub(u) };
    }
    return { status: "exists", user: pub(u) };
  }
  if ((await activeAdmins()) > 0) return { status: "conflict", reason: "admin-exists" };
  try {
    const user = await ctx.internalAdapter.createUser({ name, email: normalized, emailVerified: true, role: "admin", ...(handle ? { handle } : {}), mustChangePassword: false });
    await link(user.id);
    return { status: "created", user: pub(user) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // outra execução criou o mesmo usuário entre a consulta e a criação: idempotente
    const again = await ctx.internalAdapter.findUserByEmail(normalized);
    if (again?.user) return { status: "exists", user: pub(again.user) };
    throw error;
  }
}

/** admin:reset-password: define nova senha, revoga as sessões e exige troca no próximo acesso. */
export async function resetPassword(auth, prisma, { email, password }) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase(), { includeAccounts: true });
  if (!found?.user) return { status: "not-found" };
  const hash = await ctx.password.hash(password);
  if (found.accounts.some((a) => a.providerId === "credential")) await ctx.internalAdapter.updatePassword(found.user.id, hash);
  else await ctx.internalAdapter.linkAccount({ userId: found.user.id, providerId: "credential", accountId: found.user.id, password: hash });
  const sessions = await prisma.session.count({ where: { userId: found.user.id } });
  await ctx.internalAdapter.deleteUserSessions(found.user.id);
  await ctx.internalAdapter.updateUser(found.user.id, { mustChangePassword: true });
  const suspended = !!found.user.banned && (!found.user.banExpires || new Date(found.user.banExpires) > new Date());
  return { status: "reset", user: { id: found.user.id, email: found.user.email }, sessionsRevoked: sessions, suspended };
}
