// Proposta 2, variante B: handle como campo próprio (additionalFields, input:false) + validação em databaseHooks.
import { APIError } from "better-auth/api";
import { PASSWORD, boot, brief, log, request, signIn, tryApi, withCookie } from "./lib/poc.mjs";
import { handleError } from "./lib/handle.mjs";

const validateHook = (kind) => async (user) => {
  if (user.handle === undefined) return;
  if (user.handle === null) return { data: user };
  const normalized = String(user.handle).trim().toLowerCase();
  const erro = handleError(normalized);
  if (erro) throw new APIError("BAD_REQUEST", { message: erro, code: "INVALID_HANDLE" });
  return { data: { ...user, handle: normalized } };
};
const withHooks = process.argv.includes("--hooks");

const { auth, prisma } = await boot(withHooks ? "e2b-hooks" : "e2b-sem", {
  plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  authOptions: withHooks ? { databaseHooks: { user: { create: { before: validateHook("create") }, update: { before: validateHook("update") } } } } : {},
});
await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin" } });
const admin = await signIn(auth, "admin@exemplo.test");
const make = async (email, handle) => brief(await request(auth, "/admin/create-user", { cookie: admin.cookie, body: { email, name: "N", password: "senha-provisoria-1", data: { handle } } }));

const out = {};
let n = 0;
for (const [label, handle] of [["válido", "ana"], ["com maiúscula", "Ana2"], ["com espaço e símbolo", "Ana Souza!"], ["muito curto", "a"], ["reservado", "admin"], ["hífen repetido", "ana--b"], ["duplicado exato", "ana"], ["caixa diferente do existente", "ANA"], ["só espaços nas pontas", "  bia  "]]) {
  out[label] = await make(label === "válido" ? "ana@exemplo.test" : `u${++n}@exemplo.test`, handle);
}
log(`2B.1 create-user com data.handle (${withHooks ? "COM" : "SEM"} hooks de validação)`, out);
log("2B.1b handles gravados", (await prisma.user.findMany({ where: { handle: { not: null } }, select: { email: true, handle: true }, orderBy: { email: "asc" } })).map((u) => `${u.email} → ${JSON.stringify(u.handle)}`));

// alteração pelo administrador (admin/update-user) e pelo próprio usuário
const ana = await prisma.user.findUnique({ where: { email: "ana@exemplo.test" } });
log("2B.2 admin altera o handle de ana para um válido", await brief(await request(auth, "/admin/update-user", { cookie: admin.cookie, body: { userId: ana.id, data: { handle: "ana-souza" } } })));
log("2B.2b admin altera para inválido ('Ana Nova!')", await brief(await request(auth, "/admin/update-user", { cookie: admin.cookie, body: { userId: ana.id, data: { handle: "Ana Nova!" } } })));
const anaSession = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
log("2B.2c ana tenta alterar o próprio handle (POST /update-user)", await brief(await request(auth, "/update-user", { cookie: anaSession.cookie, body: { handle: "ana-hacker" } })));
log("2B.2d handle final de ana", (await prisma.user.findUnique({ where: { id: ana.id } })).handle);

// a rota sign-in/username NÃO existe sem o plugin
log("2B.3 POST /sign-in/username e /is-username-available (plugin ausente)", { signIn: (await brief(await request(auth, "/sign-in/username", { body: { username: "ana", password: "x" } }))).status, available: (await brief(await request(auth, "/is-username-available", { body: { username: "ana" } }))).status });
process.exit(0);
