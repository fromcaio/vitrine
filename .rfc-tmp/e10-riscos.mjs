// Proposta 10: riscos verificáveis (fixação de sessão, cookie, enumeração, saída das rotas brutas).
import { BASE, PASSWORD, boot, brief, cookieOf, log, request, signIn, withCookie } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e10", { plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })] });
await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } });
const ana = (await auth.api.createUser({ body: { email: "ana@exemplo.test", name: "Ana", password: PASSWORD, data: { handle: "ana" } } })).user;

// 10.1 fixação de sessão: o atacante planta um cookie de sessão e a vítima entra
const attackerCookie = "better-auth.session_token=tokenplantadopeloatacante123.assinaturafalsa";
const victim = await request(auth, "/sign-in/email", { body: { email: "ana@exemplo.test", password: PASSWORD }, cookie: attackerCookie });
const issued = cookieOf(victim);
log("10.1 login com um cookie de sessão plantado na requisição", {
  status: victim.status,
  tokenEmitidoEhOutro: issued !== attackerCookie && !issued.includes("tokenplantadopeloatacante123"),
  cookiePlantadoValeAlgo: !!(await auth.api.getSession({ headers: withCookie(attackerCookie) })),
});

// 10.2 atributos do cookie de sessão
const raw = victim.headers.getSetCookie().find((c) => c.includes("session_token"));
log("10.2 Set-Cookie da sessão (valor omitido)", raw.replace(/session_token=[^;]+/, "session_token=<valor>"));

// 10.3 enumeração: mensagens e tempos do login (conta existente, inexistente, suspensa)
const timings = {};
for (const [label, email, pw] of [["existente, senha errada", "ana@exemplo.test", "errada-0000000"], ["inexistente", "ninguem@exemplo.test", "errada-0000000"]]) {
  const t = performance.now();
  const r = await signIn(auth, email, pw);
  timings[label] = { status: r.status, code: r.json?.code, ms: Math.round(performance.now() - t) };
}
await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "Spam" } });
const s = await signIn(auth, "ana@exemplo.test", PASSWORD);
timings["suspensa, senha CERTA"] = { status: s.status, code: s.json?.code };
timings["suspensa, senha errada"] = { status: (await signIn(auth, "ana@exemplo.test", "errada-0000000")).status };
log("10.3 respostas do login por estado da conta", timings);
await prisma.user.update({ where: { id: ana.id }, data: { banned: false, banReason: null } });

// 10.4 o que a rota bruta list-users devolve (se um dia for exposta): campos sensíveis?
const adminSession = await signIn(auth, "admin@exemplo.test");
const list = await (await request(auth, "/admin/list-users", { method: "GET", cookie: adminSession.cookie })).json();
log("10.4 campos de cada usuário em /admin/list-users", Object.keys(list.users[0]).sort());
const listAccounts = await (await request(auth, "/list-accounts", { method: "GET", cookie: adminSession.cookie })).json();
log("10.4b list-accounts (rota bruta do próprio usuário): inclui o hash da senha?", { campos: Object.keys(listAccounts[0] ?? {}), temPassword: JSON.stringify(listAccounts).includes("password") });

// 10.5 CSRF: a mesma regra de origem do helper, nas formas que o navegador usa
const route = await import("./lib/route.mjs");
const mk = (headers) => new Request(`${BASE}/api/users`, { method: "POST", headers });
log("10.5 isSameOrigin do helper proposto", {
  origemDoSite: route.isSameOrigin(mk({ origin: BASE, host: "localhost:3000" }), BASE),
  outroSite: route.isSameOrigin(mk({ origin: "https://malicioso.test", host: "localhost:3000" }), BASE),
  origemNula: route.isSameOrigin(mk({ origin: "null", host: "localhost:3000" }), BASE),
  semOriginMasCrossSite: route.isSameOrigin(mk({ "sec-fetch-site": "cross-site", host: "localhost:3000" }), BASE),
  clienteSemNavegador: route.isSameOrigin(mk({ host: "localhost:3000" }), BASE),
});
process.exit(0);
