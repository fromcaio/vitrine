// Proposta 1: plugin admin com o cadastro público desabilitado.
import { PASSWORD, boot, brief, log, request, signIn, tryApi, withCookie } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e1", {
  plugins: ({ admin }) => [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      bannedUserMessage: (user) =>
        `Conta suspensa. Motivo: ${user.banReason}.${user.banExpires ? ` Até ${new Date(user.banExpires).toISOString().slice(0, 10)}.` : ""}`,
    }),
  ],
});

// --- 1.1 bootstrap do primeiro administrador por chamada de servidor, sem sessão e sem cabeçalhos
const first = await tryApi(() => auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } }));
log("1.1 auth.api.createUser sem headers (servidor, sem sessão), role admin", { ok: first.ok, role: first.value?.user?.role, erro: first.ok ? undefined : first });
const adminId = first.value.user.id;

// --- 1.2 o cadastro público continua recusado
const signUp = await request(auth, "/sign-up/email", { body: { name: "Intruso", email: "intruso@exemplo.test", password: PASSWORD } });
log("1.2 POST /sign-up/email com o plugin admin carregado", await brief(signUp));
log("1.2b usuários no banco", await prisma.user.count());

// --- 1.3 admin cria usuário pela rota bruta e pelo servidor
const admin = await signIn(auth, "admin@exemplo.test");
log("1.3 login do admin", { status: admin.status });
const rawCreate = await request(auth, "/admin/create-user", {
  cookie: admin.cookie,
  body: { email: "ana@exemplo.test", name: "Ana", password: "senha-provisoria-1", data: { handle: "ana" } },
});
const rawCreateJson = await rawCreate.json();
log("1.3 POST /admin/create-user (admin) -> role padrão e handle via data", { status: rawCreate.status, role: rawCreateJson.user?.role, handle: rawCreateJson.user?.handle, banned: rawCreateJson.user?.banned, chaves: Object.keys(rawCreateJson.user ?? {}) });

// senha curta: o create-user NÃO aplica o mínimo de 8 (o set-user-password aplica)
const shortPw = await tryApi(() => auth.api.createUser({ headers: withCookie(admin.cookie), body: { email: "curta@exemplo.test", name: "Curta", password: "123" } }));
log("1.3b create-user com senha de 3 caracteres (mínimo configurado: 8)", { aceita: shortPw.ok, erro: shortPw.ok ? undefined : shortPw });

// --- 1.4 autorização do próprio plugin
const ana = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
log("1.4 login da usuária comum", { status: ana.status });
const cases = [
  ["usuário comum cria usuário", () => request(auth, "/admin/create-user", { cookie: ana.cookie, body: { email: "x1@exemplo.test", name: "X", password: PASSWORD } })],
  ["usuário comum define o próprio papel", () => request(auth, "/admin/set-role", { cookie: ana.cookie, body: { userId: rawCreateJson.user.id, role: "admin" } })],
  ["usuário comum lista usuários", () => request(auth, "/admin/list-users", { method: "GET", cookie: ana.cookie })],
  ["sem sessão cria usuário", () => request(auth, "/admin/create-user", { body: { email: "x2@exemplo.test", name: "X", password: PASSWORD } })],
  ["admin cria usuário com role admin", () => request(auth, "/admin/create-user", { cookie: admin.cookie, body: { email: "adm2@exemplo.test", name: "Adm2", password: PASSWORD, role: "admin" } })],
];
const out = {};
for (const [label, fn] of cases) out[label] = await brief(await fn());
log("1.4 rotas brutas do plugin por papel", out);

// --- 1.5 escalada de privilégio por update-user (rota do núcleo) e por create-user via server com headers de usuário comum
const escalate = {};
for (const body of [{ role: "admin" }, { banned: false }, { handle: "ana-2" }, { mustChangePassword: false }, { name: "Ana Souza", role: "admin" }, { name: "Ana Souza", banned: false, handle: "ana-2" }, { name: "Ana Souza" }, { image: "https://exemplo.test/a.png" }, { image: "javascript:alert(1)" }, { name: "x".repeat(5000) }]) {
  const r = await request(auth, "/update-user", { cookie: ana.cookie, body });
  escalate[JSON.stringify(body, (k, v) => (typeof v === "string" && v.length > 40 ? v.slice(0, 10) + "…(" + v.length + " caracteres)" : v))] = await brief(r);
}
log("1.5 POST /update-user da usuária comum", escalate);
const anaRow = await prisma.user.findUnique({ where: { email: "ana@exemplo.test" } });
log("1.5b estado de ana depois", { role: anaRow.role, handle: anaRow.handle, tamanhoDoNome: anaRow.name.length, image: anaRow.image, mustChangePassword: anaRow.mustChangePassword });
const viaServerAsUser = await tryApi(() => auth.api.createUser({ headers: withCookie(ana.cookie), body: { email: "x3@exemplo.test", name: "X", password: PASSWORD } }));
log("1.5c auth.api.createUser com os cabeçalhos de um usuário comum", viaServerAsUser.ok ? "ACEITA (!)" : viaServerAsUser);
const viaServerNoHeaders = await tryApi(() => auth.api.createUser({ body: { email: "x4@exemplo.test", name: "X", password: PASSWORD } }));
log("1.5d auth.api.createUser SEM cabeçalhos (sem verificação nenhuma)", viaServerNoHeaders.ok ? "ACEITA: a rota que chama sem headers pula a autorização do plugin" : viaServerNoHeaders);

// --- 1.6 personificação: ligada por padrão; desligar por papéis customizados
const imp = await request(auth, "/admin/impersonate-user", { cookie: admin.cookie, body: { userId: rawCreateJson.user.id } });
log("1.6 impersonate-user com a configuração padrão (admin)", { status: imp.status, impersonatedBy: (await imp.json()).session?.impersonatedBy ?? null });

// --- 1.7 suspensão: login, mensagem, sessões, prazo
const bia = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
const sessionsBefore = await prisma.session.count({ where: { userId: rawCreateJson.user.id } });
const ban = await request(auth, "/admin/ban-user", { cookie: admin.cookie, body: { userId: rawCreateJson.user.id, banReason: "Spam", banExpiresIn: 7 * 86400 } });
log("1.7 ban-user (motivo e 7 dias)", { ...(await brief(ban)), sessoesAntes: sessionsBefore, sessoesDepois: await prisma.session.count({ where: { userId: rawCreateJson.user.id } }) });
const oldCookieSession = await request(auth, "/get-session", { method: "GET", cookie: bia.cookie });
log("1.7b get-session com o cookie anterior à suspensão", { status: oldCookieSession.status, corpo: await oldCookieSession.json() });
const banned = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
log("1.7c login do suspenso", { status: banned.status, json: banned.json, setCookie: banned.response.headers.getSetCookie().length });
const wrongPwBanned = await signIn(auth, "ana@exemplo.test", "senha-errada-000");
log("1.7d login do suspenso com senha ERRADA (enumeração de estado da conta?)", { status: wrongPwBanned.status, code: wrongPwBanned.json?.code });
await prisma.user.update({ where: { id: rawCreateJson.user.id }, data: { banExpires: new Date(Date.now() - 1000) } });
const afterExpiry = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
const row = await prisma.user.findUnique({ where: { id: rawCreateJson.user.id } });
log("1.7e login depois de vencido o prazo", { status: afterExpiry.status, banned: row.banned, banReason: row.banReason, banExpires: row.banExpires });

// --- 1.8 o que o getSession entrega ao servidor
const sess = await auth.api.getSession({ headers: withCookie(afterExpiry.cookie) });
log("1.8 auth.api.getSession: campos de user", Object.keys(sess.user).sort());
log("1.8b valores", { role: sess.user.role, banned: sess.user.banned, handle: sess.user.handle });

process.exit(0);
