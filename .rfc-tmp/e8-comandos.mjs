// Proposta 8: contrato de admin:create e de admin:reset-password, verificado cenário a cenário.
import { PASSWORD, boot, log, signIn, withCookie } from "./lib/poc.mjs";
import { ensureInitialAdmin, resetPassword } from "./lib/cli.mjs";

const { auth, prisma } = await boot("e8", { plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })] });
const create = (extra = {}) => ensureInitialAdmin(auth, prisma, { email: "admin@exemplo.test", password: PASSWORD, name: "Administrador", handle: "portal", ...extra });
const row = async (email) => prisma.user.findUnique({ where: { email }, select: { role: true, handle: true, banned: true, mustChangePassword: true, emailVerified: true } });
const loginOk = async (email, pw) => (await signIn(auth, email, pw)).status;

log("8.1 admin:create em banco vazio", { resultado: (await create()).status, linha: await row("admin@exemplo.test"), login: await loginOk("admin@exemplo.test", PASSWORD) });
log("8.2 repetir (mesmo e-mail, OUTRA senha): nada muda, nem a senha", { resultado: (await create({ password: "outra-senha-qualquer-9" })).status, loginComASenhaOriginal: await loginOk("admin@exemplo.test", PASSWORD), loginComANova: await loginOk("admin@exemplo.test", "outra-senha-qualquer-9"), usuarios: await prisma.user.count() });
log("8.3 e-mail diferente com administrador ativo: recusa (saída 1)", { resultado: await create({ email: "outro@exemplo.test" }), usuarios: await prisma.user.count() });
log("8.4 handle inválido no bootstrap", await ensureInitialAdmin(auth, prisma, { email: "x@exemplo.test", password: PASSWORD, name: "X", handle: "Admin!" }));

// 8.5 recuperação: o último administrador foi rebaixado (o plugin permite) e ninguém mais entra no painel
await prisma.user.update({ where: { email: "admin@exemplo.test" }, data: { role: "user" } });
log("8.5 sem administrador ativo (rebaixado): admin:create com o mesmo e-mail promove", { resultado: (await create()).status, linha: await row("admin@exemplo.test") });
// 8.6 recuperação: todos os administradores suspensos, e-mail novo
await prisma.user.update({ where: { email: "admin@exemplo.test" }, data: { banned: true, banExpires: null } });
log("8.6 todos os administradores suspensos: e-mail novo cria um administrador", { resultado: (await create({ email: "novo-admin@exemplo.test", handle: undefined })).status, administradoresAtivos: await prisma.user.count({ where: { role: "admin", OR: [{ banned: false }, { banned: null }] } }) });
log("8.6b e o mesmo e-mail do administrador suspenso, com outro ativo existindo: recusa", (await create()).status);
await prisma.user.update({ where: { email: "admin@exemplo.test" }, data: { banned: false } });

// 8.7 credencial ausente (execução interrompida)
await prisma.account.deleteMany({ where: { user: { email: "admin@exemplo.test" } } });
log("8.7 administrador sem credencial: reparado", { resultado: (await create()).status, login: await loginOk("admin@exemplo.test", PASSWORD) });

// 8.8 corrida: duas execuções ao mesmo tempo em banco vazio
await prisma.session.deleteMany();
await prisma.account.deleteMany();
await prisma.user.deleteMany();
const race = await Promise.allSettled([create(), create(), create()]);
log("8.8 três execuções simultâneas em banco vazio", { resultados: race.map((r) => (r.status === "fulfilled" ? r.value.status : `ERRO: ${String(r.reason?.message).slice(0, 60)}`)), usuarios: await prisma.user.count() });

// ---------- admin:reset-password ----------
const ana = (await auth.api.createUser({ body: { email: "ana@exemplo.test", name: "Ana", password: "senha-antiga-segura-1", data: { handle: "ana" } } })).user;
const s1 = await signIn(auth, "ana@exemplo.test", "senha-antiga-segura-1");
await signIn(auth, "ana@exemplo.test", "senha-antiga-segura-1");
const r = await resetPassword(auth, prisma, { email: "Ana@Exemplo.test", password: "senha-nova-do-terminal-2" });
log("8.9 admin:reset-password (e-mail com caixa diferente)", { r, sessoesDepois: await prisma.session.count({ where: { userId: ana.id } }), cookieAntigoValeAinda: !!(await auth.api.getSession({ headers: withCookie(s1.cookie) })), loginAntiga: await loginOk("ana@exemplo.test", "senha-antiga-segura-1"), loginNova: await loginOk("ana@exemplo.test", "senha-nova-do-terminal-2"), mustChangePassword: (await row("ana@exemplo.test")).mustChangePassword });
log("8.9b repetir (idempotente: mesmo efeito)", await resetPassword(auth, prisma, { email: "ana@exemplo.test", password: "senha-nova-do-terminal-2" }));
log("8.9c e-mail inexistente", await resetPassword(auth, prisma, { email: "ninguem@exemplo.test", password: PASSWORD }));
await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "teste" } });
log("8.9d conta suspensa: a senha muda, e o comando avisa que ela segue suspensa", await resetPassword(auth, prisma, { email: "ana@exemplo.test", password: "senha-nova-do-terminal-3" }));
process.exit(0);
