// Cliente da API de usuários (RF27; Cap. 5 §5.10): o que cada função envia e como cada resposta de
// erro vira uma mensagem em português. Ambiente node, `fetch` simulado.
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, banUser, createUser, deleteUser, listUsers, resetPassword, unbanUser, updateUser } from "@/components/admin/user-client";

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
const respond = (body, status = 200, headers = {}) =>
  vi.fn(async () => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));
/** @param {string} code @param {unknown} [details] @param {string} [message] */
const apiError = (code, details = [], message = "mensagem do servidor") => ({ error: { code, message, details } });
const USER = { id: "u1", name: "Ana", email: "ana@x.com", handle: "ana", role: "user", suspended: false, banReason: null, banExpires: null, mustChangePassword: true, createdAt: null, updatedAt: null };

describe("listUsers", () => {
  it("GET com limit, offset e a busca aparada; sem busca, sem o parâmetro", async () => {
    const fetchImpl = respond({ data: [USER], total: 1, limit: 50, offset: 0 });
    const result = await listUsers({ search: "  ana  ", limit: 20, offset: 40, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("/api/users?limit=20&offset=40&search=ana", { cache: "no-store" });
    expect(result).toMatchObject({ ok: true, total: 1 });
    await listUsers({ fetchImpl });
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/users?limit=50&offset=0");
  });

  it("devolve usuários saneados", async () => {
    const result = await listUsers({ fetchImpl: respond({ data: [USER, { sem: "id" }], total: 2, limit: 50, offset: 0 }) });
    expect(result.ok && result.users.map((u) => u.id)).toEqual(["u1"]);
  });
});

describe("createUser", () => {
  it("POST com e-mail, nome, handle e papel (sem senha) e devolve a provisória UMA vez", async () => {
    const fetchImpl = respond({ data: { ...USER, temporaryPassword: "Abcdefghjkmnpqrs" } }, 201);
    const result = await createUser({ email: "ana@x.com", name: "Ana", handle: "ana", role: "user" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "ana@x.com", name: "Ana", handle: "ana", role: "user" });
    expect(init.body).not.toMatch(/password/);
    expect(result).toMatchObject({ ok: true, temporaryPassword: "Abcdefghjkmnpqrs" });
    expect(result.ok && result.user?.id).toBe("u1");
  });

  it("a senha provisória não vaza para o objeto do usuário", async () => {
    const result = await createUser({ email: "a@x.com", name: "A", handle: null, role: "user" }, respond({ data: { ...USER, temporaryPassword: "SeGrEdO123456789" } }, 201));
    expect(JSON.stringify(result.ok && result.user)).not.toMatch(/SeGrEdO/);
  });

  it("temporaryPassword nulo (o administrador informou a senha) continua nulo", async () => {
    const result = await createUser({ email: "a@x.com", name: "A", handle: null, role: "user" }, respond({ data: { ...USER, temporaryPassword: null } }, 201));
    expect(result).toMatchObject({ ok: true, temporaryPassword: null });
  });

  it("409 USER_CONFLICT diz o campo (e-mail ou handle) com a mensagem certa", async () => {
    expect(await createUser({ email: "a@x.com", name: "A", handle: null, role: "user" }, respond(apiError("USER_CONFLICT", [{ field: "email" }]), 409))).toEqual({ ok: false, kind: "user-conflict", message: MESSAGES.emailTaken, field: "email" });
    expect(await createUser({ email: "a@x.com", name: "A", handle: "a", role: "user" }, respond(apiError("USER_CONFLICT", [{ field: "handle" }]), 409))).toMatchObject({ field: "handle", message: MESSAGES.handleTaken });
    expect(await createUser({ email: "a@x.com", name: "A", handle: "a", role: "user" }, respond(apiError("USER_CONFLICT", []), 409))).toMatchObject({ kind: "user-conflict", message: MESSAGES.conflict });
  });

  it("422 traz as mensagens por campo", async () => {
    const result = await createUser({ email: "x", name: "", handle: null, role: "user" }, respond(apiError("VALIDATION_ERROR", [{ field: "email", message: "Informe um e-mail válido." }, { field: "name", message: "O nome é obrigatório." }]), 422));
    expect(result).toMatchObject({ ok: false, kind: "validation", fields: { email: "Informe um e-mail válido.", name: "O nome é obrigatório." } });
  });
});

describe("updateUser", () => {
  it("PATCH só com o que mudou (nome, handle, papel); handle null remove", async () => {
    const fetchImpl = respond({ data: USER });
    await updateUser("u 1", { handle: null, role: "admin" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/users/u%201");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ handle: null, role: "admin" });
  });

  it("409 LAST_ADMIN tem a mensagem em português", async () => {
    expect(await updateUser("u1", { role: "user" }, respond(apiError("LAST_ADMIN"), 409))).toEqual({ ok: false, kind: "last-admin", message: MESSAGES.lastAdmin });
  });
});

describe("resetPassword", () => {
  it("PUT /password sem corpo de senha e devolve a provisória", async () => {
    const fetchImpl = respond({ data: { id: "u1", temporaryPassword: "Xyz123Xyz123Xyz1" } });
    const result = await resetPassword("u1", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/users/u1/password");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe("{}");
    expect(result).toEqual({ ok: true, temporaryPassword: "Xyz123Xyz123Xyz1" });
  });
});

describe("banUser e unbanUser", () => {
  it("suspende com o motivo; sem prazo, nada de expiresAt", async () => {
    const fetchImpl = respond({ data: { ...USER, suspended: true } });
    await banUser("u1", { reason: "Spam", expiresAt: null }, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/users/u1/ban");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ reason: "Spam" });
  });

  it("com prazo, leva expiresAt em ISO 8601", async () => {
    const fetchImpl = respond({ data: USER });
    await banUser("u1", { reason: "Spam", expiresAt: "2026-12-01T10:00:00.000Z" }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ reason: "Spam", expiresAt: "2026-12-01T10:00:00.000Z" });
  });

  it("reativa com DELETE", async () => {
    const fetchImpl = respond({ data: USER });
    await unbanUser("u1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/users/u1/ban", { method: "DELETE" });
  });

  it("403 da própria conta vira a mensagem da própria conta", async () => {
    expect(await banUser("me", { reason: "x", expiresAt: null }, respond(apiError("FORBIDDEN", [], "Você não pode suspender a própria conta."), 403))).toMatchObject({ kind: "forbidden", message: MESSAGES.selfAction });
    expect(await banUser("x", { reason: "x", expiresAt: null }, respond(apiError("FORBIDDEN"), 403))).toMatchObject({ kind: "forbidden", message: MESSAGES.forbidden });
  });

  it("422 do motivo: mensagem no campo reason", async () => {
    const result = await banUser("u1", { reason: "", expiresAt: null }, respond(apiError("VALIDATION_ERROR", [{ field: "reason", message: "Informe o motivo." }]), 422));
    expect(result).toMatchObject({ kind: "validation", fields: { reason: "Informe o motivo." } });
  });
});

describe("deleteUser", () => {
  it("sem escolha: DELETE puro; 409 USER_HAS_CONTENT pede a escolha", async () => {
    const fetchImpl = respond(apiError("USER_HAS_CONTENT"), 409);
    const result = await deleteUser("u1", {}, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/users/u1", { method: "DELETE" });
    expect(result).toEqual({ ok: false, kind: "has-content", message: MESSAGES.hasContent });
  });

  it("transferir leva content, to e onConflict", async () => {
    const fetchImpl = respond({ data: { id: "u1", content: "transferred", roots: 3, renamed: [{ id: "c", from: "a", to: "a-2" }] } });
    const result = await deleteUser("u1", { content: "transfer", to: "dest", onConflict: "rename" }, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/users/u1?content=transfer&to=dest&onConflict=rename");
    expect(result).toEqual({ ok: true, content: "transferred", roots: 3, renamed: [{ id: "c", from: "a", to: "a-2" }] });
  });

  it("excluir junto: content=delete, sem to nem onConflict", async () => {
    const fetchImpl = respond({ data: { id: "u1", content: "deleted", roots: 0, renamed: [] } });
    await deleteUser("u1", { content: "delete", to: "ignorado", onConflict: "rename" }, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/users/u1?content=delete");
  });

  it("transferir sem onConflict deixa o padrão do servidor (recusar tudo)", async () => {
    const fetchImpl = respond({ data: { id: "u1", content: "transferred", roots: 1, renamed: [] } });
    await deleteUser("u1", { content: "transfer", to: "dest" }, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/users/u1?content=transfer&to=dest");
  });

  it("409 SLUG_CONFLICT lista os slugs em conflito", async () => {
    const result = await deleteUser("u1", { content: "transfer", to: "d" }, respond(apiError("SLUG_CONFLICT", [{ conflicts: ["calculo", { slug: "fisica" }] }]), 409));
    expect(result).toMatchObject({ ok: false, kind: "slug-conflict", conflicts: ["calculo", "fisica"] });
  });

  it("409 LAST_ADMIN e 403 da própria conta", async () => {
    expect(await deleteUser("u1", {}, respond(apiError("LAST_ADMIN"), 409))).toMatchObject({ kind: "last-admin" });
    expect(await deleteUser("me", {}, respond(apiError("FORBIDDEN", [], "Você não pode excluir a própria conta."), 403))).toMatchObject({ kind: "forbidden", message: MESSAGES.selfAction });
  });

  it("uma resposta sem 'content' conhecido vira 'none'", async () => {
    expect(await deleteUser("u1", {}, respond({ data: { id: "u1" } }))).toEqual({ ok: true, content: "none", roots: 0, renamed: [] });
  });
});

describe("falhas comuns", () => {
  const call = (/** @type {typeof fetch} */ impl) => unbanUser("u1", impl);

  it("401, 403 (senha provisória), 404, 429, 5xx e rede", async () => {
    expect(await call(respond(apiError("UNAUTHENTICATED"), 401))).toMatchObject({ kind: "unauthenticated", message: MESSAGES.unauthenticated });
    expect(await call(respond(apiError("PASSWORD_CHANGE_REQUIRED"), 403))).toMatchObject({ kind: "password-change", message: MESSAGES.passwordChange });
    expect(await call(respond(apiError("NOT_FOUND"), 404))).toMatchObject({ kind: "not-found", message: MESSAGES.notFound });
    expect(await call(respond(apiError("INTERNAL"), 500))).toMatchObject({ kind: "server", message: MESSAGES.server });
    expect(await call(vi.fn(async () => { throw new TypeError("falhou"); }))).toMatchObject({ kind: "network", message: MESSAGES.network });
  });

  it("429 cita o Retry-After", async () => {
    const result = await call(respond(apiError("RATE_LIMITED"), 429, { "Retry-After": "12" }));
    expect(result.ok === false && result.message).toMatch(/Tente de novo em 12 segundos\./);
    const one = await call(respond(apiError("RATE_LIMITED"), 429, { "Retry-After": "1" }));
    expect(one.ok === false && one.message).toMatch(/em 1 segundo\./);
  });

  it("um corpo que não é JSON não derruba", async () => {
    expect(await call(vi.fn(async () => new Response("<html>", { status: 502 })))).toMatchObject({ kind: "server" });
  });

  it("nunca repassa o texto livre do servidor nas mensagens gerais", async () => {
    const result = await call(respond(apiError("NOT_FOUND", [], "<script>alert(1)</script>"), 404));
    expect(result.ok === false && result.message).not.toMatch(/script/);
  });
});
