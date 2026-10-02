// Proposta 2, variante A: plugin username do better-auth como handle.
import { PASSWORD, boot, brief, log, request, signIn, tryApi, withCookie } from "./lib/poc.mjs";
import { handleError } from "./lib/handle.mjs";

const { auth, prisma } = await boot("e2a", {
  plugins: ({ admin, username }) => [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: (v) => handleError(v) === null, displayUsernameValidator: () => true }),
  ],
});
const root = await auth.api.createUser({ body: { email: "admin@exemplo.test", name: "Admin", password: PASSWORD, role: "admin", data: { username: "portal" } } });
const admin = await signIn(auth, "admin@exemplo.test");
const make = async (email, username, extra = {}) => brief(await request(auth, "/admin/create-user", { cookie: admin.cookie, body: { email, name: email.split("@")[0], password: "senha-provisoria-1", data: { username, ...extra } } }));

const created = {};
for (const [label, handle] of [["válido", "ana"], ["com maiúscula", "Ana2"], ["com sublinhado", "ana_b"], ["hífen na ponta", "-ana"], ["hífen repetido", "ana--b"], ["curto", "an"], ["longo (31)", "a".repeat(31)], ["reservado", "admin"], ["duplicado", "ana"], ["duplicado só na caixa", "ANA"]]) {
  created[label] = await make(label === "válido" ? "ana@exemplo.test" : `u${Object.keys(created).length}@exemplo.test`, handle);
}
log("2A.1 create-user (admin) com data.username: validação e unicidade pelo plugin", created);
log("2A.1b linhas gravadas", (await prisma.user.findMany({ select: { email: true, username: true, displayUsername: true }, orderBy: { email: "asc" } })));

// o próprio usuário altera o username pela rota pública update-user
const ana = await signIn(auth, "ana@exemplo.test", "senha-provisoria-1");
log("2A.2 login da usuária ana", { status: ana.status });
log("2A.2b ana altera o PRÓPRIO username (POST /update-user)", { resposta: await brief(await request(auth, "/update-user", { cookie: ana.cookie, body: { username: "ana-nova" } })), depois: (await prisma.user.findFirst({ where: { email: "ana@exemplo.test" }, select: { username: true, displayUsername: true } })) });
log("2A.2c ana altera o displayUsername (texto livre)", await brief(await request(auth, "/update-user", { cookie: ana.cookie, body: { displayUsername: "<img src=x onerror=alert(1)>" } })));

// superfície nova
log("2A.3 is-username-available (sem sessão)", {
  livre: await (await request(auth, "/is-username-available", { body: { username: "livre-123" } })).json(),
  ocupado: await (await request(auth, "/is-username-available", { body: { username: "ana-nova" } })).json(),
});

// limite de taxa: /sign-in/email tem regra própria (5/min); /sign-in/username cai na regra padrão de /sign-in (3 por 10 s)
async function burst(path, body, n = 12) {
  const ip = "10.9.9.9";
  const codes = [];
  for (let i = 0; i < n; i++) codes.push((await request(auth, path, { body, ip })).status);
  return codes;
}
const viaEmail = await burst("/sign-in/email", { email: "ana@exemplo.test", password: "errada-0000000" });
const viaUsername = await burst("/sign-in/username", { username: "ana-nova", password: "errada-0000000" });
log("2A.4 12 tentativas seguidas, mesmo IP (401 = tentativa processada; 429 = bloqueada)", { "sign-in/email": viaEmail.join(" "), "sign-in/username": viaUsername.join(" ") });
await new Promise((r) => setTimeout(r, 11_000));
const again = await burst("/sign-in/username", { username: "ana-nova", password: "errada-0000000" }, 5);
log("2A.4b depois de 11 s, mais 5 tentativas em /sign-in/username", again.join(" "));

// login por username de conta suspensa e mensagens
log("2A.5 sign-in/username com a senha provisória correta", await brief(await request(auth, "/sign-in/username", { body: { username: "ana-nova", password: "senha-provisoria-1" }, ip: "10.8.8.8" })));
process.exit(0);
