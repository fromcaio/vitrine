// PATCH /api/users/me com campos EXTRAS (A-014 Parte 3e-1, item 5; RF28, RN19; CT39): decisão do Arquiteto
// (R-023): MANTER o comportamento atual, que ignora o que não é o nome (o `profileUpdateSchema` não é
// estrito, como nas demais rotas) e responde 200. Este teste TRAVA a decisão: papel, handle, e-mail,
// identificador, suspensão e senha provisória ficam intactos, no banco e na resposta, mesmo que o corpo os
// traga; e só o `name` muda. Se um dia a rota passar a recusar (422), este teste muda junto, de propósito.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import * as meRoute from "@/app/api/users/me/route";
import { prisma } from "@/lib/db";
import { apiRequest, createUserSession, resetDatabase } from "./helpers";

/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;

beforeEach(async () => {
  await resetDatabase();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
});

const updateMe = (body) => meRoute.PATCH(apiRequest("/api/users/me", { method: "PATCH", body, cookie: ana.cookie }));
const stored = () => prisma.user.findUniqueOrThrow({ where: { id: ana.id } });

describe("PATCH /api/users/me ignora o que não é o nome", () => {
  it("com role, handle, e-mail, id, suspensão e senha provisória no corpo: 200, só o nome muda", async () => {
    const before = await stored();

    const response = await updateMe({
      name: "Ana Maria",
      role: "admin",
      handle: "invadido",
      email: "outro@exemplo.test",
      id: "outro-id",
      banned: true,
      banReason: "x",
      mustChangePassword: true,
      emailVerified: false,
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ id: ana.id, name: "Ana Maria", email: "ana@exemplo.test", handle: "ana", role: "user", suspended: false });
    const after = await stored();
    expect(after).toMatchObject({
      id: ana.id,
      name: "Ana Maria",
      email: before.email,
      handle: "ana",
      role: "user",
      banned: false,
      mustChangePassword: false,
    });
    expect(await prisma.user.count({ where: { handle: "invadido" } })).toBe(0);
  });

  it("o papel nunca sobe: o usuário comum continua sem acesso ao que é do administrador", async () => {
    await updateMe({ name: "Ana", role: "admin" });

    expect((await stored()).role).toBe("user");
    const config = await (await import("@/app/api/configuration/route")).PUT(
      apiRequest("/api/configuration", { method: "PUT", body: { siteName: "Invadido" }, cookie: ana.cookie }),
    );
    expect(config.status).toBe(403);
  });

  it("só campos extras, sem o nome: 422 (o nome é obrigatório), e nada muda", async () => {
    const before = await stored();

    const response = await updateMe({ role: "admin", handle: "invadido" });

    expect(response.status).toBe(422);
    const after = await stored();
    expect(after).toMatchObject({ name: before.name, role: "user", handle: "ana" });
  });

  it("o nome continua validado (vazio e longo demais: 422)", async () => {
    expect((await updateMe({ name: "   " })).status).toBe(422);
    expect((await updateMe({ name: "x".repeat(500) })).status).toBe(422);
    expect((await stored()).name).toBe("Ana");
  });
});
