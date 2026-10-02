// Proposta 4: encapsulamento das rotas do plugin, lista de permitidas, limites, origem e erros.
import { toNextJsHandler } from "better-auth/next-js";
import { BASE, PASSWORD, boot, log, signIn, tryApi, withCookie } from "./lib/poc.mjs";
import { AUTH_ALLOWED, guardAuthHandlers } from "./lib/guard.mjs";

const { auth, prisma } = await boot("e4", {
  plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } });
await auth.api.createUser({ body: { email: "ana@exemplo.test", name: "Ana", password: PASSWORD } });
await auth.api.createUser({ body: { email: "beto@exemplo.test", name: "Beto", password: PASSWORD } });

// 4.1 todas as rotas brutas expostas por este better-auth (núcleo + plugin admin)
const routes = Object.entries(auth.api)
  .map(([name, fn]) => ({ name, path: fn.path, methods: [].concat(fn.options?.method ?? "?") }))
  .filter((r) => r.path)
  .sort((a, b) => a.path.localeCompare(b.path));
log("4.1 total de endpoints expostos pelo better-auth (núcleo + admin)", routes.length);
log("4.1b caminhos", routes.map((r) => `${r.methods.join("|")} ${r.path}`));
log("4.1c os que a lista de permitidas mantém", [...AUTH_ALLOWED]);

// 4.2 o handler do catch-all, com e sem a lista
const raw = toNextJsHandler(auth);
const guarded = guardAuthHandlers(raw);
const admin = await signIn(auth, "admin@exemplo.test");
const ana = await signIn(auth, "ana@exemplo.test");
const call = async (handlers, method, path, { cookie, body, origin = BASE } = {}) => {
  const headers = new Headers({ "x-forwarded-for": "10.7.7.7" });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (body) headers.set("content-type", "application/json");
  const res = await handlers[method](new Request(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return res.status;
};
const anaId0 = (await prisma.user.findUnique({ where: { email: "ana@exemplo.test" } })).id;
const targets = [
  ["POST", "/api/auth/admin/create-user", admin.cookie, { email: "z@exemplo.test", name: "Z", password: PASSWORD }],
  ["GET", "/api/auth/admin/list-users", admin.cookie],
  ["POST", "/api/auth/admin/set-role", admin.cookie, { userId: anaId0, role: "admin" }],
  ["POST", "/api/auth/admin/impersonate-user", admin.cookie, { userId: anaId0 }],
  ["POST", "/api/auth/update-user", ana.cookie, { image: "javascript:alert(1)" }],
  ["POST", "/api/auth/change-password", ana.cookie, { currentPassword: PASSWORD, newPassword: "outra-senha-segura-9" }],
  ["POST", "/api/auth/delete-user", ana.cookie, {}],
  ["GET", "/api/auth/list-sessions", ana.cookie],
  ["POST", "/api/auth/revoke-sessions", ana.cookie, {}],
  ["POST", "/api/auth/sign-up/email", undefined, { name: "I", email: "i@exemplo.test", password: PASSWORD }],
  ["GET", "/api/auth/get-session", ana.cookie],
  ["POST", "/api/auth/sign-in/email", undefined, { email: "ana@exemplo.test", password: "errada-000000" }],
];
const table = {};
for (const [method, p, cookie, body] of targets) {
  table[`${method} ${p.replace("/api/auth", "")}`] = { "sem lista": await call(raw, method, p, { cookie, body }), "com lista": await call(guarded, method, p, { cookie, body }) };
}
log("4.2 status por rota: catch-all sem a lista × com a lista", table);

// 4.3 tentativas de contornar a lista
const tricky = [
  "/api/auth/admin/create-user/", "/api/auth//admin/create-user", "/api/auth/ADMIN/create-user", "/api/auth/Admin/list-users",
  "/api/auth/sign-in/email/../../admin/list-users", "/api/auth/sign-in/email/%2e%2e/%2e%2e/admin/list-users",
  "/api/auth/sign-in/email%2f..%2f..%2fadmin%2flist-users", "/api/auth/admin%2Flist-users",
  "/api/auth/admin/list-users?x=/sign-in/email", "/api/auth/admin/list-users#/sign-in/email", "/api/auth/get-session/",
  "/api/auth/./admin/list-users", "/api/auth/admin/./list-users", "/api/auth/%61dmin/list-users",
  "/api/auth;/admin/list-users", "/api/auth/admin/list-users;a=b", "/api/auth/admin/list-users%00", "/api/auth/admin/list-users%20",
];
const bypass = [];
for (const p of tricky) {
  const viaRaw = await call(raw, "GET", p, { cookie: admin.cookie });
  const viaGuard = await call(guarded, "GET", p, { cookie: admin.cookie });
  const isAllowedByDesign = /\/get-session\/?$/.test(p.split("?")[0].split("#")[0]);
  const contornou = viaGuard === 200 && viaRaw === 200 && !isAllowedByDesign;
  bypass.push(`${contornou ? "!! CONTORNOU " : "   "}${p}   sem lista=${viaRaw}  com lista=${viaGuard}`);
}
log("4.3 caminhos adulterados (GET, cookie de admin): quem responde 200 por rota de admin?", bypass);

// 4.4 limite de taxa: o do better-auth só vale dentro do handler
const sessionAdmin = withCookie(admin.cookie);
let okCount = 0;
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  const r = await tryApi(() => auth.api.createUser({ headers: sessionAdmin, body: { email: `massa${i}@exemplo.test`, name: "M", password: PASSWORD } }));
  if (r.ok) okCount++;
}
log("4.4 30 auth.api.createUser seguidos (chamada direta de servidor, mesma sessão)", { criados: okCount, ms: Date.now() - t0, limiteDoBetterAuthAplicado: okCount < 30 });
const viaRoute = [];
for (let i = 0; i < 6; i++) viaRoute.push(await call(raw, "POST", "/api/auth/admin/create-user", { cookie: admin.cookie, body: { email: `rota${i}@exemplo.test`, name: "R", password: PASSWORD } }));
log("4.4b 6 POST /admin/create-user pela rota bruta", viaRoute);

// 4.5 origem nas rotas que permanecem
log("4.5 Origin de outro site nas rotas permitidas (status)", {
  loginOutraOrigem: await call(raw, "POST", "/api/auth/sign-in/email", { body: { email: "ana@exemplo.test", password: PASSWORD }, origin: "https://malicioso.test" }),
  loginSemOrigem: await call(raw, "POST", "/api/auth/sign-in/email", { body: { email: "ana@exemplo.test", password: PASSWORD }, origin: null }),
  signOutOutraOrigem: await call(raw, "POST", "/api/auth/sign-out", { cookie: ana.cookie, body: {}, origin: "https://malicioso.test" }),
});

// os passos brutos de 4.2 alteraram a própria Ana (senha, papel, sessões): o 4.6 usa o Beto, intocado
const ana2 = await signIn(auth, "beto@exemplo.test");
// 4.6 forma dos erros lançados por auth.api.*
const adminId = (await prisma.user.findUnique({ where: { email: "admin@exemplo.test" } })).id;
const anaId = (await prisma.user.findUnique({ where: { email: "ana@exemplo.test" } })).id;
const betoId = (await prisma.user.findUnique({ where: { email: "beto@exemplo.test" } })).id;
const errs = {
  "e-mail já existe": await tryApi(() => auth.api.createUser({ headers: sessionAdmin, body: { email: "ana@exemplo.test", name: "A", password: PASSWORD } })),
  "usuário comum cria": await tryApi(() => auth.api.createUser({ headers: withCookie(ana2.cookie), body: { email: "q@exemplo.test", name: "Q", password: PASSWORD } })),
  "sem sessão": await tryApi(() => auth.api.createUser({ headers: new Headers(), body: { email: "q@exemplo.test", name: "Q", password: PASSWORD } })),
  "usuário inexistente": await tryApi(() => auth.api.banUser({ headers: sessionAdmin, body: { userId: "inexistente" } })),
  "suspender a si mesmo": await tryApi(() => auth.api.banUser({ headers: sessionAdmin, body: { userId: adminId } })),
  "senha curta no set-user-password": await tryApi(() => auth.api.setUserPassword({ headers: sessionAdmin, body: { userId: betoId, newPassword: "123" } })),
  "corpo malformado (sem email)": await tryApi(() => auth.api.createUser({ headers: sessionAdmin, body: { name: "Q", password: PASSWORD } })),
};
log("4.6 erros de auth.api.* (status, code, message)", Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, { ok: v.ok, status: v.status, code: v.code, message: v.message }])));
process.exit(0);
