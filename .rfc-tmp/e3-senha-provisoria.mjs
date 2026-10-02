// Proposta 3: senha provisória e troca no primeiro acesso.
import { PASSWORD, boot, brief, cookieOf, log, request, signIn, tryApi, withCookie } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e3", { plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })] });
await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } });
const admin = await signIn(auth, "admin@exemplo.test");

// 3.1 o administrador cria a conta com a senha provisória e a marca para troca
const PROVISORIA = "provisoria-Tr0ca-1";
const created = await request(auth, "/admin/create-user", { cookie: admin.cookie, body: { email: "ana@exemplo.test", name: "Ana", password: PROVISORIA, data: { handle: "ana", mustChangePassword: true } } });
const ana = (await created.json()).user;
log("3.1 create-user com data.mustChangePassword = true", { status: created.status, mustChangePassword: ana.mustChangePassword, naTabela: (await prisma.user.findUnique({ where: { id: ana.id } })).mustChangePassword });

// 3.2 primeiro acesso: o login funciona (precisa funcionar) e a sessão carrega o marcador
const s1 = await signIn(auth, "ana@exemplo.test", PROVISORIA);
const sess1 = await auth.api.getSession({ headers: withCookie(s1.cookie) });
log("3.2 login com a provisória e getSession", { login: s1.status, "session.user.mustChangePassword": sess1.user.mustChangePassword, cookies: s1.response.headers.getSetCookie().map((c) => c.split("=")[0]) });

// 3.3 a rota bruta change-password do better-auth: validações
const cp = (cookie, body) => request(auth, "/change-password", { cookie, body });
const s2 = await signIn(auth, "ana@exemplo.test", PROVISORIA); // uma segunda sessão (outro dispositivo)
log("3.3 change-password com a senha atual errada", await brief(await cp(s1.cookie, { currentPassword: "errada-1234567", newPassword: "nova-senha-segura-1" })));
log("3.3b nova senha curta (3)", await brief(await cp(s1.cookie, { currentPassword: PROVISORIA, newPassword: "123" })));
log("3.3c nova senha igual à provisória", await brief(await cp(s1.cookie, { currentPassword: PROVISORIA, newPassword: PROVISORIA })));
const sessionsBefore = await prisma.session.count({ where: { userId: ana.id } });
const ok = await cp(s1.cookie, { currentPassword: PROVISORIA, newPassword: "nova-senha-segura-1", revokeOtherSessions: true });
log("3.3d change-password válido com revokeOtherSessions", { ...(await brief(ok)), sessoesAntes: sessionsBefore, sessoesDepois: await prisma.session.count({ where: { userId: ana.id } }), novoCookie: ok.headers.getSetCookie().map((c) => c.split("=")[0]), tokenMudou: cookieOf(ok) !== s1.cookie });
log("3.3e a segunda sessão (outro dispositivo) ainda vale?", await (await request(auth, "/get-session", { method: "GET", cookie: s2.cookie })).json());
log("3.3f login com a senha antiga e com a nova", { antiga: (await signIn(auth, "ana@exemplo.test", PROVISORIA)).status, nova: (await signIn(auth, "ana@exemplo.test", "nova-senha-segura-1")).status });
log("3.3g o marcador depois de trocar a senha pela rota BRUTA (não é limpo sozinho)", (await prisma.user.findUnique({ where: { id: ana.id } })).mustChangePassword);

// 3.4 padrão proposto: a nossa rota troca a senha e DEPOIS limpa o marcador (falha fecha: marcador preso, nunca liberado)
async function changeMyPassword(cookie, current, next) {
  const r = await tryApi(() => auth.api.changePassword({ headers: withCookie(cookie), body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, asResponse: false }));
  if (!r.ok) return r;
  await prisma.user.update({ where: { id: ana.id }, data: { mustChangePassword: false } });
  return { ok: true };
}
const s3 = await signIn(auth, "ana@exemplo.test", "nova-senha-segura-1");
log("3.4 auth.api.changePassword (servidor) + limpeza do marcador", { resultado: await changeMyPassword(s3.cookie, "nova-senha-segura-1", "outra-senha-segura-2"), marcador: (await prisma.user.findUnique({ where: { id: ana.id } })).mustChangePassword });

// 3.5 redefinição pelo administrador
const s4 = await signIn(auth, "ana@exemplo.test", "outra-senha-segura-2");
const reset = await request(auth, "/admin/set-user-password", { cookie: admin.cookie, body: { userId: ana.id, newPassword: "redefinida-pelo-admin-3" } });
log("3.5 set-user-password pelo administrador", await brief(reset));
log("3.5b a sessão que a Ana já tinha continua valendo depois da redefinição?", { sessaoAnterior: !!(await (await request(auth, "/get-session", { method: "GET", cookie: s4.cookie })).json()), sessoesDaAna: await prisma.session.count({ where: { userId: ana.id } }) });
log("3.5c admin/set-user-password com senha curta (mínimo configurado 8)", await brief(await request(auth, "/admin/set-user-password", { cookie: admin.cookie, body: { userId: ana.id, newPassword: "123" } })));
const rev = await request(auth, "/admin/revoke-user-sessions", { cookie: admin.cookie, body: { userId: ana.id } });
log("3.5d revoke-user-sessions (a nossa rota deve chamar depois do set-user-password)", { ...(await brief(rev)), sessoesDaAna: await prisma.session.count({ where: { userId: ana.id } }) });
await prisma.user.update({ where: { id: ana.id }, data: { mustChangePassword: true } });
const s5 = await signIn(auth, "ana@exemplo.test", "redefinida-pelo-admin-3");
log("3.5e login com a senha redefinida e marcador", { login: s5.status, marcador: (await auth.api.getSession({ headers: withCookie(s5.cookie) })).user.mustChangePassword });
process.exit(0);
