// Proposta 1 (cont.): desligar a personificação por papéis customizados do plugin admin.
import { PASSWORD, boot, bootstrapAdmin, brief, log, request, signIn, withCookie } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e1b", {
  plugins: ({ admin, createAccessControl, adminAc }) => {
    const ac = createAccessControl({
      user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"],
      session: ["list", "revoke", "delete"],
    });
    const adminStatements = { user: adminAc.statements.user.filter((p) => p !== "impersonate"), session: adminAc.statements.session };
    return [admin({ ac, roles: { admin: ac.newRole(adminStatements), user: ac.newRole({ user: [], session: [] }) }, adminRoles: ["admin"] })];
  },
});
await bootstrapAdmin(auth);
const a = await signIn(auth, "admin@exemplo.test");
const made = await auth.api.createUser({ headers: withCookie(a.cookie), body: { email: "bia@exemplo.test", name: "Bia", password: PASSWORD } });
log("1.6b impersonate-user com papéis customizados (admin sem 'impersonate')", await brief(await request(auth, "/admin/impersonate-user", { cookie: a.cookie, body: { userId: made.user.id } })));
log("1.6c ban-user continua funcionando", await brief(await request(auth, "/admin/ban-user", { cookie: a.cookie, body: { userId: made.user.id, banReason: "teste" } })));
log("1.6d create-user continua funcionando", await brief(await request(auth, "/admin/create-user", { cookie: a.cookie, body: { email: "cris@exemplo.test", name: "Cris", password: PASSWORD } })));
log("1.6e sessões com impersonatedBy", await prisma.session.count({ where: { NOT: { impersonatedBy: null } } }));
process.exit(0);
