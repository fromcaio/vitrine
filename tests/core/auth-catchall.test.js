// CT38: o catch-all /api/auth/[...all] responde SÓ a GET get-session, POST sign-in/email e POST
// sign-out (ADR-029, item 2); as demais rotas brutas do better-auth, inclusive as do plugin `admin`,
// respondem 404 no envelope e não chegam ao roteador do pacote. As rotas são ENUMERADAS do objeto
// `auth.api` (e não escritas à mão), de modo que uma rota nova de uma atualização do pacote também é
// coberta. Os testes usam o better-auth real sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import { AUTH_ALLOWED, authSubPath, guardAuthHandlers } from "@/app/api/_lib/auth-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BASE_URL, PASSWORD, createAdminSession, createUserSession, nextIp, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

/** Todas as rotas HTTP do pacote: `{ method, path }`, com o `:param` trocado por um valor. */
function rawRoutes() {
  /** @type {Array<{ method: string, path: string, name: string }>} */
  const routes = [];
  for (const [name, endpoint] of Object.entries(auth.api)) {
    const { path, options } = /** @type {any} */ (endpoint);
    if (!path) continue; // endpoint só de servidor (ex.: setPassword), sem rota HTTP
    for (const method of [].concat(options?.method ?? [])) {
      routes.push({ method, path: path.replace(/:[A-Za-z]+/g, "x"), name });
    }
  }
  return routes;
}

const isAllowed = (/** @type {{ method: string, path: string }} */ route) => AUTH_ALLOWED.has(`${route.method} ${route.path}`);

/**
 * @param {string} method
 * @param {string} path caminho completo, a partir de /api/auth
 * @param {{ cookie?: string, body?: unknown }} [options]
 */
function call(method, path, { cookie, body } = {}) {
  const headers = new Headers({ origin: BASE_URL, "x-forwarded-for": nextIp() });
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET") headers.set("content-type", "application/json");
  const request = new Request(`${BASE_URL}/api/auth${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const handler = /** @type {Record<string, (request: Request) => Promise<Response>>} */ (authRoute)[method];
  return handler ? handler(request) : Promise.resolve(new Response(null, { status: 405 }));
}

/** @param {Response} response */
async function expectEnvelope404(response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "Rota não encontrada.", details: [] },
  });
}

describe("CT38: lista de permitidas do catch-all", () => {
  it("a lista tem exatamente as três rotas do produto", () => {
    expect([...AUTH_ALLOWED].sort()).toEqual(["GET /get-session", "POST /sign-in/email", "POST /sign-out"]);
    expect(Object.isFrozen(AUTH_ALLOWED)).toBe(true);
  });

  it("enumera as rotas brutas do pacote: 45 caminhos, 42 deles fora da lista (15 do plugin admin)", () => {
    const routes = rawRoutes();
    const paths = new Set(routes.map((route) => route.path));
    // Se uma atualização do pacote mudar o número de rotas, este teste avisa: revise a lista.
    expect(paths.size).toBe(45);
    expect(routes.filter(isAllowed)).toHaveLength(3);
    const allowedPaths = new Set(routes.filter(isAllowed).map((route) => route.path));
    expect([...paths].filter((path) => !allowedPaths.has(path))).toHaveLength(42);
    expect([...paths].filter((path) => path.startsWith("/admin/"))).toHaveLength(15);
    // Há pares método/caminho fora da lista num caminho permitido: POST get-session.
    expect(routes.filter((route) => !isAllowed(route))).toHaveLength(44);
  });

  it("toda rota bruta fora da lista responde 404 no envelope, mesmo com a sessão do administrador", async () => {
    const { cookie } = await createAdminSession();
    const usersBefore = await prisma.user.count();
    const outside = rawRoutes().filter((route) => !isAllowed(route));

    for (const route of outside) {
      await expectEnvelope404(await call(route.method, route.path, { cookie }));
    }
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it("toda rota bruta fora da lista responde 404 sem sessão", async () => {
    for (const route of rawRoutes().filter((candidate) => !isAllowed(candidate))) {
      await expectEnvelope404(await call(route.method, route.path));
    }
  });

  it("as três rotas permitidas continuam funcionando", async () => {
    const { cookie } = await createAdminSession();

    const session = await call("GET", "/get-session", { cookie });
    expect(session.status).toBe(200);
    expect((await session.json()).user).toMatchObject({ email: "admin@exemplo.test", role: "admin" });

    const login = await call("POST", "/sign-in/email", { body: { email: "admin@exemplo.test", password: PASSWORD } });
    expect(login.status).toBe(200);

    const signOut = await call("POST", "/sign-out", { cookie, body: {} });
    expect(signOut.status).toBe(200);
    expect(await prisma.session.count({ where: { token: { not: "" } } })).toBe(1); // a do login acima
  });

  it("o cadastro público segue recusado e não cria usuário (RF22, CT06)", async () => {
    const response = await call("POST", "/sign-up/email", {
      body: { name: "Intruso", email: "intruso@exemplo.test", password: PASSWORD },
    });
    expect(response.status).toBe(404);
    expect(await prisma.user.findUnique({ where: { email: "intruso@exemplo.test" } })).toBeNull();
  });

  it("POST get-session (aceito pelo pacote) também responde 404: só o GET está na lista", async () => {
    await expectEnvelope404(await call("POST", "/get-session"));
  });

  it("um name ou uma image inválidos não chegam ao banco pelas rotas brutas", async () => {
    const { cookie, userId } = await createAdminSession();
    const user = await createUserSession({ email: "ana@exemplo.test", name: "Ana" });
    const huge = "x".repeat(5000);

    for (const { session, id } of [
      { session: user.cookie, id: user.id },
      { session: cookie, id: userId },
    ]) {
      await expectEnvelope404(await call("POST", "/update-user", { cookie: session, body: { name: huge, image: "javascript:alert(1)" } }));
      await expectEnvelope404(await call("POST", "/admin/update-user", { cookie: session, body: { userId: id, data: { name: huge, image: "javascript:alert(1)" } } }));
    }
    const rows = await prisma.user.findMany({ select: { name: true, image: true } });
    expect(rows.every((row) => row.name.length < 100 && row.image === null)).toBe(true);
  });

  it("um usuário comum não promove a si mesmo pelo plugin nem altera o próprio handle", async () => {
    const user = await createUserSession({ email: "ana@exemplo.test", handle: "ana" });

    await expectEnvelope404(await call("POST", "/admin/set-role", { cookie: user.cookie, body: { userId: user.id, role: "admin" } }));
    await expectEnvelope404(await call("POST", "/update-user", { cookie: user.cookie, body: { handle: "outro", role: "admin", mustChangePassword: false } }));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ role: "user", handle: "ana" });
  });

  describe("tentativas de contornar a lista", () => {
    // Todas pedem uma rota de administrador com o cookie de um administrador de verdade.
    const variants = [
      "/admin/list-users/",
      "//admin/list-users",
      "/ADMIN/list-users",
      "/Admin/list-users",
      "/admin/list-users;a=b",
      "/admin/list-users%00",
      "/admin/list-users%20",
      "/admin%2Flist-users",
      "/%61dmin/list-users",
      "/./admin/list-users",
      "/admin/./list-users",
      "/sign-in/email/../../admin/list-users",
      "/sign-in/email/%2e%2e/%2e%2e/admin/list-users",
      "/sign-in/email%2f..%2f..%2fadmin%2flist-users",
      ";/admin/list-users",
      "/get-session/",
      "/get-session/../admin/list-users",
      "/Get-Session",
      "/sign-out/",
      "/sign-in/email/",
    ];

    for (const variant of variants) {
      it(`GET /api/auth${variant}`, async () => {
        const { cookie } = await createAdminSession();
        const response = await call("GET", variant, { cookie });
        // A única resposta legítima é a do GET de uma rota permitida, sem lista de usuários.
        if (response.status === 200) {
          const text = await response.text();
          expect(text).not.toContain("users");
          expect(text).not.toContain("total");
        } else {
          await expectEnvelope404(response);
        }
      });
    }

    it("a query string e o fragmento não deslocam o caminho", async () => {
      const { cookie } = await createAdminSession();
      await expectEnvelope404(await call("GET", "/admin/list-users?x=/get-session", { cookie }));
      await expectEnvelope404(await call("GET", "/admin/list-users?x=/sign-in/email", { cookie }));
    });
  });
});

describe("CT38: o auxiliar da lista", () => {
  it("authSubPath devolve o caminho depois de /api/auth, ou nulo fora dele", () => {
    const request = (/** @type {string} */ url) => new Request(url);
    expect(authSubPath(request(`${BASE_URL}/api/auth/get-session`))).toBe("/get-session");
    expect(authSubPath(request(`${BASE_URL}/api/auth/sign-in/email?x=1`))).toBe("/sign-in/email");
    expect(authSubPath(request(`${BASE_URL}/api/auth`))).toBeNull();
    expect(authSubPath(request(`${BASE_URL}/api/authx/get-session`))).toBeNull();
    expect(authSubPath(request(`${BASE_URL}/api/contents`))).toBeNull();
  });

  it("guardAuthHandlers só repassa ao handler original o que está na lista", async () => {
    const seen = /** @type {string[]} */ ([]);
    const guarded = guardAuthHandlers({
      GET: (/** @type {Request} */ request) => {
        seen.push(request.url);
        return new Response("ok");
      },
    });
    expect((await guarded.GET(new Request(`${BASE_URL}/api/auth/get-session`))).status).toBe(200);
    expect((await guarded.GET(new Request(`${BASE_URL}/api/auth/list-sessions`))).status).toBe(404);
    expect(seen).toEqual([`${BASE_URL}/api/auth/get-session`]);
  });

  it("o método também conta: POST em get-session e GET em sign-out respondem 404", async () => {
    const guarded = guardAuthHandlers({ GET: () => new Response("ok"), POST: () => new Response("ok") });
    expect((await guarded.POST(new Request(`${BASE_URL}/api/auth/get-session`, { method: "POST" }))).status).toBe(404);
    expect((await guarded.GET(new Request(`${BASE_URL}/api/auth/sign-out`))).status).toBe(404);
  });
});
