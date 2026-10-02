// Proposta 6: páginas e Proxy. O que o cookie traz, o custo do cache de cookie e o requireSession com papel.
import { getSessionCookie } from "better-auth/cookies";
import { PASSWORD, boot, log, request, signIn, withCookie } from "./lib/poc.mjs";
import { CHANGE_PASSWORD_PATH, outcome, requireSession } from "./lib/pages.mjs";

const withCache = process.argv.includes("--cache");
const { auth, prisma } = await boot(withCache ? "e6-cache" : "e6", {
  plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  authOptions: withCache ? { session: { expiresIn: 7 * 86400, updateAge: 86400, cookieCache: { enabled: true, maxAge: 300 } } } : {},
});
await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } });
const ana = (await auth.api.createUser({ body: { email: "ana@exemplo.test", name: "Ana", password: PASSWORD } })).user;
const sAdmin = await signIn(auth, "admin@exemplo.test");
const sAna = await signIn(auth, "ana@exemplo.test");

const cookieNames = sAna.response.headers.getSetCookie().map((c) => c.split("=")[0]);
log(`6.1 cookies gravados no login (cookieCache ${withCache ? "LIGADO" : "desligado, como hoje"})`, cookieNames);
log("6.1b o que o Proxy enxerga pelo cookie (getSessionCookie): só o token, sem papel", { temToken: !!getSessionCookie(new Request("http://localhost:3000/admin", { headers: { cookie: sAna.cookie } })), valorContemPapel: /role|admin/i.test(decodeURIComponent(sAna.cookie)) });

if (withCache) {
  // com cache de cookie, o papel e a suspensão ficam "congelados" no cookie até o prazo (maxAge)
  const before = await auth.api.getSession({ headers: withCookie(sAna.cookie) });
  await prisma.user.update({ where: { id: ana.id }, data: { role: "admin" } });
  const afterRole = await auth.api.getSession({ headers: withCookie(sAna.cookie) });
  log("6.2 rebaixar/promover no banco com cookieCache: o papel que o servidor enxerga", { antes: before.user.role, depoisDeMudarNoBanco: afterRole.user.role });
  await prisma.user.update({ where: { id: ana.id }, data: { role: "user" } });
  await request(auth, "/admin/ban-user", { cookie: sAdmin.cookie, body: { userId: ana.id, banReason: "teste" } });
  const afterBan = await auth.api.getSession({ headers: withCookie(sAna.cookie) });
  log("6.2b depois de SUSPENDER a Ana (as sessões do banco foram apagadas): a sessão ainda vale?", { sessoesNoBanco: await prisma.session.count({ where: { userId: ana.id } }), getSessionDevolve: afterBan ? `usuário ${afterBan.user.email}` : null });
  process.exit(0);
}

// 6.3 o requireSession proposto, por cenário
const getSession = (headers) => auth.api.getSession({ headers });
const run = (cookie, opts) => outcome(() => requireSession({ getSession, headers: cookie ? withCookie(cookie) : new Headers(), ...opts }));
const out = {};
out["sem cookie em /admin"] = await run(null, { path: "/admin" });
out["sem cookie em /admin/usuarios (redirectTo)"] = await run(null, { path: "/admin/usuarios", role: "admin" });
out["cookie forjado"] = await run("better-auth.session_token=forjado.assinatura", { path: "/admin" });
out["usuário comum em /admin"] = await run(sAna.cookie, { path: "/admin" });
out["usuário comum em /admin/usuarios (role admin)"] = await run(sAna.cookie, { path: "/admin/usuarios", role: "admin" });
out["admin em /admin/usuarios"] = await run(sAdmin.cookie, { path: "/admin/usuarios", role: "admin" });
await prisma.user.update({ where: { id: ana.id }, data: { mustChangePassword: true } });
out["senha provisória em /admin/conteudo"] = await run(sAna.cookie, { path: "/admin/conteudo" });
out[`senha provisória em ${CHANGE_PASSWORD_PATH}`] = await run(sAna.cookie, { path: CHANGE_PASSWORD_PATH });
await prisma.user.update({ where: { id: ana.id }, data: { mustChangePassword: false, banned: true } });
out["suspensa, sessão ainda no banco"] = await run(sAna.cookie, { path: "/admin" });
log("6.3 requireSession por cenário", out);
process.exit(0);
