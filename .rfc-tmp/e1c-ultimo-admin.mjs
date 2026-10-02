// Proposta 1/4 (cont.): o que o plugin admin NÃO protege em relação ao último administrador.
import { PASSWORD, boot, bootstrapAdmin, brief, log, request, signIn } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e1c", { plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })] });
const activeAdmins = () => prisma.user.count({ where: { role: "admin", OR: [{ banned: false }, { banned: null }] } });

const first = await bootstrapAdmin(auth, "admin1@exemplo.test");
const second = await bootstrapAdmin(auth, "admin2@exemplo.test");
const a1 = await signIn(auth, "admin1@exemplo.test");
const a2 = await signIn(auth, "admin2@exemplo.test");
log("administradores ativos no começo", await activeAdmins());

log("1. admin1 suspende a si mesmo", await brief(await request(auth, "/admin/ban-user", { cookie: a1.cookie, body: { userId: first.id } })));
log("2. admin1 remove a si mesmo", await brief(await request(auth, "/admin/remove-user", { cookie: a1.cookie, body: { userId: first.id } })));
log("3. admin1 suspende admin2 (outro administrador)", await brief(await request(auth, "/admin/ban-user", { cookie: a1.cookie, body: { userId: second.id, banReason: "teste" } })));
log("3b. administradores ativos", await activeAdmins());
log("4. admin1 (único ativo) rebaixa a si mesmo para user (set-role)", await brief(await request(auth, "/admin/set-role", { cookie: a1.cookie, body: { userId: first.id, role: "user" } })));
log("4b. administradores ativos: nenhum sobra", await activeAdmins());

// remoção de outro admin e atomicidade da remoção
const third = await bootstrapAdmin(auth, "admin3@exemplo.test");
await prisma.user.update({ where: { id: second.id }, data: { role: "admin", banned: false } });
const a2b = await signIn(auth, "admin2@exemplo.test");
log("5. admin2 remove o admin3 (outro admin)", await brief(await request(auth, "/admin/remove-user", { cookie: a2b.cookie, body: { userId: third.id } })));
log("5b. usuário existe depois?", !!(await prisma.user.findUnique({ where: { id: third.id } })));

// remove-user com conteúdo: a FK Restrict (RNF10) bloqueia, e as sessões já foram apagadas antes?
const victim = await auth.api.createUser({ body: { email: "autor@exemplo.test", name: "Autor", password: PASSWORD } });
const v = await signIn(auth, "autor@exemplo.test");
await prisma.content.create({ data: { title: "T", slug: "t", type: "DOCUMENT", authorId: victim.user.id } });
const sessionsBefore = await prisma.session.count({ where: { userId: victim.user.id } });
const rm = await request(auth, "/admin/remove-user", { cookie: a2b.cookie, body: { userId: victim.user.id } });
log("6. remove-user de quem tem conteúdo (FK Restrict)", { ...(await brief(rm)), sessoesAntes: sessionsBefore, sessoesDepois: await prisma.session.count({ where: { userId: victim.user.id } }), usuarioAindaExiste: !!(await prisma.user.findUnique({ where: { id: victim.user.id } })) });
log("6b. o cookie antigo do autor ainda vale (sessões foram apagadas ANTES da falha)?", await (await request(auth, "/get-session", { method: "GET", cookie: v.cookie })).json());
process.exit(0);
