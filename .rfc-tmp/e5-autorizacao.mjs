// Proposta 5: matriz papel x recurso x ação (tabela de casos) e ordem das verificações na rota.
import { PASSWORD, boot, log, signIn, withCookie } from "./lib/poc.mjs";
import { POLICY, authorize } from "./lib/authz.mjs";
import { ApiError, createLimiter, makeRoute, readJson } from "./lib/route.mjs";

// ---------- parte A: matriz, conferida contra uma tabela escrita à mão ----------
// colunas: anon | user:próprio | user:alheio | admin:próprio | admin:alheio | suspenso:próprio | senha provisória:próprio
// A = permitido, 403 = FORBIDDEN, 401 = UNAUTHENTICATED, P = 403 PASSWORD_CHANGE_REQUIRED, - = não se aplica (ação de coleção)
const EXPECTED = {
  "content:list": ["401", "A", "-", "A", "-", "401", "P"],
  "content:read": ["401", "A", "403", "A", "A", "401", "P"],
  "content:create": ["401", "A", "-", "A", "-", "401", "P"],
  "content:update": ["401", "A", "403", "A", "A", "401", "P"],
  "content:delete": ["401", "A", "403", "A", "A", "401", "P"],
  "content:reorder": ["401", "A", "403", "A", "A", "401", "P"],
  "site:read": ["401", "403", "403", "A", "A", "401", "P"],
  "site:update": ["401", "403", "403", "A", "A", "401", "P"],
  "appearance:read": ["401", "A", "403", "A", "A", "401", "P"],
  "appearance:update": ["401", "A", "403", "A", "403", "401", "P"],
  "users:list": ["401", "403", "-", "A", "-", "401", "P"],
  "users:create": ["401", "403", "-", "A", "-", "401", "P"],
  "users:read": ["401", "A", "403", "A", "A", "401", "A"],
  "users:update": ["401", "403", "403", "A", "A", "401", "P"],
  "users:ban": ["401", "403", "403", "A", "A", "401", "P"],
  "users:reset-password": ["401", "403", "403", "A", "A", "401", "P"],
  "users:remove": ["401", "403", "403", "A", "A", "401", "P"],
  "profile:update": ["401", "A", "403", "A", "403", "401", "P"],
  "profile:change-password": ["401", "A", "403", "A", "403", "401", "A"],
  "notifications:list": ["401", "A", "-", "A", "-", "401", "P"],
  "notifications:update": ["401", "A", "403", "A", "403", "401", "P"],
};
const COLLECTION = new Set(["content:list", "content:create", "users:list", "users:create", "notifications:list"]);
const ana = { id: "ana", role: "user" };
const admin = { id: "adm", role: "admin" };
const suspended = { id: "ana", role: "user", banned: true, banExpires: null };
const expiredBan = { id: "ana", role: "user", banned: true, banExpires: new Date(Date.now() - 1000) };
const provisional = { id: "ana", role: "user", mustChangePassword: true };
const sym = (d) => (d.allowed ? "A" : d.code === "PASSWORD_CHANGE_REQUIRED" ? "P" : String(d.status));
const rows = [];
let mismatches = 0;
for (const action of Object.keys(POLICY)) {
  const own = COLLECTION.has(action) ? undefined : { ownerId: "ana" };
  const other = { ownerId: "beto" };
  const got = [
    sym(authorize(null, action, own)),
    sym(authorize(ana, action, own)),
    COLLECTION.has(action) ? "-" : sym(authorize(ana, action, other)),
    sym(authorize(admin, action, COLLECTION.has(action) ? undefined : { ownerId: "adm" })),
    COLLECTION.has(action) ? "-" : sym(authorize(admin, action, other)),
    sym(authorize(suspended, action, own)),
    sym(authorize(provisional, action, own)),
  ];
  const want = EXPECTED[action];
  const ok = want && got.every((g, i) => g === want[i]);
  if (!ok) mismatches++;
  rows.push(`${ok ? "  " : "!!"} ${action.padEnd(26)} ${got.map((g) => g.padEnd(4)).join(" ")}${ok ? "" : `   ESPERADO ${want?.join(" ")}`}`);
}
log("5.A matriz (anon | user:próprio | user:alheio | admin:próprio | admin:alheio | suspenso | senha provisória)", rows);
log("5.A divergências em relação à tabela escrita à mão", mismatches);
log("5.A suspensão com prazo vencido deixa de valer (o plugin só limpa 'banned' no próximo login)", { vencida: authorize(expiredBan, "content:read", { ownerId: "ana" }).allowed, vigente: authorize(suspended, "content:read", { ownerId: "ana" }).allowed });
log("5.A papel desconhecido e ação desconhecida (falham fechado)", { papelXyz: authorize({ id: "x", role: "xyz" }, "content:read", { ownerId: "x" }).allowed, acaoInventada: authorize(admin, "content:purge", { ownerId: "adm" }).allowed });
log("5.A recurso sem dono nunca casa com 'own' (ownerId indefinido e objeto vazio)", { semOwnerId: authorize(ana, "content:update", { ownerId: undefined }).allowed, objetoVazio: authorize(ana, "content:update", {}).allowed });

// ---------- parte B: ordem das verificações com sessões reais ----------
const { auth, prisma } = await boot("e5", { plugins: ({ admin: adminPlugin }) => [adminPlugin({ defaultRole: "user", adminRoles: ["admin"] })] });
const mk = async (email, role) => (await auth.api.createUser({ body: { email, name: email.split("@")[0], password: PASSWORD, role } })).user;
const [uAdmin, uAna, uBeto] = [await mk("admin@exemplo.test", "admin"), await mk("ana@exemplo.test", "user"), await mk("beto@exemplo.test", "user")];
const c1 = await prisma.content.create({ data: { title: "da Ana", slug: "a", type: "DOCUMENT", authorId: uAna.id, body: "original" } });
const c2 = await prisma.content.create({ data: { title: "do Beto", slug: "b", type: "DOCUMENT", authorId: uBeto.id, body: "original" } });
const sAdmin = await signIn(auth, "admin@exemplo.test");
const sAna = await signIn(auth, "ana@exemplo.test");
const sBeto = await signIn(auth, "beto@exemplo.test");

const limiter = createLimiter({ window: 60_000, max: 5 });
const route = makeRoute({ auth, baseUrl: "http://localhost:3000", limiter });
const PATCH = route(
  { action: "content:update", mutation: true, load: async ({ id }) => { const c = await prisma.content.findUnique({ where: { id } }); return c && { ownerId: c.authorId }; } },
  async ({ request, params, actor }) => {
    const body = await readJson(request);
    if (typeof body.body !== "string") throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [{ field: "body", message: "Campo obrigatório." }]);
    const updated = await prisma.content.update({ where: { id: params.id }, data: { body: body.body } });
    return Response.json({ data: { id: updated.id, authorId: updated.authorId, editadoPor: actor.id } });
  },
);
const call = async (id, { cookie, body = { body: "novo" }, origin = "http://localhost:3000", raw } = {}) => {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", "application/json");
  const res = await PATCH(new Request(`http://localhost:3000/api/contents/${id}`, { method: "PATCH", headers, body: raw ?? JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  const json = await res.json();
  return `${res.status} ${json.error?.code ?? "ok"}`;
};
const results = {};
results["origem de outro site + cookie válido"] = await call(c1.id, { cookie: sAna.cookie, origin: "https://malicioso.test" });
results["sem cookie"] = await call(c1.id);
results["ana edita o conteúdo da ana"] = await call(c1.id, { cookie: sAna.cookie });
results["ana edita o conteúdo do beto"] = await call(c2.id, { cookie: sAna.cookie });
results["ana edita id inexistente"] = await call("nao-existe", { cookie: sAna.cookie });
results["beto edita o da ana com corpo INVÁLIDO (403 antes de 422)"] = await call(c1.id, { cookie: sBeto.cookie, body: { body: 42 } });
results["ana edita o seu com corpo inválido"] = await call(c1.id, { cookie: sAna.cookie, body: { body: 42 } });
results["ana edita o seu com JSON malformado"] = await call(c1.id, { cookie: sAna.cookie, raw: "{ body: " });
results["admin edita o do beto (moderação)"] = await call(c2.id, { cookie: sAdmin.cookie });
await prisma.user.update({ where: { id: uAna.id }, data: { mustChangePassword: true } });
results["ana com senha provisória edita o seu"] = await call(c1.id, { cookie: sAna.cookie });
await prisma.user.update({ where: { id: uAna.id }, data: { mustChangePassword: false, banned: true } });
results["ana suspensa (banned=true) com a sessão ainda no banco"] = await call(c1.id, { cookie: sAna.cookie });
await prisma.user.update({ where: { id: uAna.id }, data: { banned: false } });
log("5.B resultados por cenário (status código)", results);
log("5.B o conteúdo do beto só mudou pelo admin; o da ana, só pela ana", { ana: (await prisma.content.findUnique({ where: { id: c1.id } })).body, beto: (await prisma.content.findUnique({ where: { id: c2.id } })).body });
const flood = [];
for (let i = 0; i < 7; i++) flood.push((await call(c2.id, { cookie: sAdmin.cookie })).split(" ")[0]);
log("5.B limite por usuário (5 escritas por janela; o admin já fez 1): as 7 escritas seguintes", flood);
process.exit(0);
