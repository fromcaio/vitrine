// Proxy (src/proxy.js): (1) a verificação otimista do cookie de sessão nas rotas do painel (CT03, parte
// verificável sem navegador; a barreira real é testada em api-auth-guard.test.js) e (2) o `rewrite` das
// URLs públicas que não são de um espaço ativo para o 404 dinâmico (A-014 Parte 3b, item 4; ADR-030;
// CT43, CT45). Banco temporário; `getUserByHandle` é espiado para provar o que NÃO consulta o banco.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getUserByHandle: vi.fn(actual.getUserByHandle) };
});

import { NextRequest } from "next/server";
import { getUserByHandle, prisma } from "@/lib/db";
import { NOT_FOUND_SEGMENT, config, proxy } from "@/proxy";
import { createTestUser, resetDatabase } from "./helpers";

const request = (path, cookie) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

/** A resposta deixou a requisição seguir? */
const passes = (response) => response.headers.get("x-middleware-next") === "1";
/** Destino do `rewrite`, ou `null`. */
const rewriteOf = (response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

// O Next.js compila cada `source` do matcher como expressão regular ancorada; aqui, o mesmo.
const matches = (path) =>
  config.matcher.some((source) => new RegExp("^" + source.replace(":path*", ".*") + "$").test(path));

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(getUserByHandle).mockClear();
});

describe("proxy: o painel", () => {
  it("atua no painel e em todo primeiro segmento público, menos a raiz, api, _next, login e arquivos", () => {
    expect(config.matcher).toHaveLength(2);
    expect(config.matcher[0]).toBe("/admin/:path*");
    expect(matches("/admin/conteudo")).toBe(true);
  });

  it("sem cookie de sessão, redireciona a /login preservando o destino", async () => {
    const response = await proxy(request("/admin/conteudo?aba=rascunhos"));

    expect(response.status).toBe(307);
    const location = new URL(/** @type {string} */ (response.headers.get("location")));
    expect(location.origin).toBe("http://localhost:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/admin/conteudo?aba=rascunhos");
  });

  it("cookie de outra finalidade não conta como sessão", async () => {
    expect((await proxy(request("/admin", "tema=escuro"))).status).toBe(307);
  });

  it.each(["better-auth.session_token=abc.def", "__Secure-better-auth.session_token=abc.def"])(
    "com o cookie %s, deixa a requisição seguir, sem consultar o banco",
    async (cookie) => {
      const response = await proxy(request("/admin", cookie));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(passes(response)).toBe(true);
      expect(getUserByHandle).not.toHaveBeenCalled();
    },
  );
});

describe("proxy: o que o matcher alcança", () => {
  it.each(["/ana", "/ana/calculo", "/ana/calculo/limites", "/login-fan", "/apidocs", "/admin-fan", "/Ana", "/%41na", "/logout"])(
    "%s passa pelo Proxy",
    (path) => expect(matches(path)).toBe(true),
  );

  it.each(["/", "/api", "/api/users", "/login", "/login/x", "/_next/static/chunks/a.js", "/favicon.ico", "/next.svg", "/imagens/logo.png"])(
    "%s não passa pelo Proxy",
    (path) => expect(matches(path)).toBe(false),
  );
});

describe("proxy: o espaço público (CT43, CT45)", () => {
  const rewrites = async (path) => rewriteOf(await proxy(request(path)));

  it("handle ativo: deixa seguir, com uma única consulta pelo handle", async () => {
    await createTestUser({ email: "ana@exemplo.test", handle: "ana" });

    for (const path of ["/ana", "/ana/calculo", "/ana/calculo/limites"]) {
      expect(passes(await proxy(request(path))), path).toBe(true);
    }
    expect(getUserByHandle).toHaveBeenCalledTimes(3);
    expect(getUserByHandle).toHaveBeenCalledWith("ana");
  });

  it("handle inexistente: reescreve para o 404 dinâmico, nada em cache", async () => {
    expect(await rewrites("/ninguem")).toBe(`/${NOT_FOUND_SEGMENT}`);
    expect(await rewrites("/ninguem/calculo/limites")).toBe(`/${NOT_FOUND_SEGMENT}`);
  });

  it("um handle criado em seguida funciona logo, sem revalidar", async () => {
    expect(await rewrites("/recem")).toBe(`/${NOT_FOUND_SEGMENT}`);

    await createTestUser({ email: "recem@exemplo.test", handle: "recem" });

    expect(passes(await proxy(request("/recem")))).toBe(true);
  });

  it("usuário suspenso (sem prazo ou vigente): o mesmo 404; prazo vencido: o espaço volta (RN23)", async () => {
    await createTestUser({ email: "a@exemplo.test", handle: "suspensa", banned: true, banReason: "x" });
    await createTestUser({ email: "b@exemplo.test", handle: "temporaria", banned: true, banReason: "x", banExpires: new Date(Date.now() + 3_600_000) });
    await createTestUser({ email: "c@exemplo.test", handle: "vencida", banned: true, banReason: "x", banExpires: new Date(Date.now() - 3_600_000) });

    expect(await rewrites("/suspensa/x")).toBe(`/${NOT_FOUND_SEGMENT}`);
    expect(await rewrites("/temporaria")).toBe(`/${NOT_FOUND_SEGMENT}`);
    expect(passes(await proxy(request("/vencida")))).toBe(true);
  });

  it("removido (a conta não existe mais): o mesmo 404", async () => {
    const { id } = await createTestUser({ email: "x@exemplo.test", handle: "removida" });
    expect(passes(await proxy(request("/removida")))).toBe(true);

    await prisma.user.delete({ where: { id } });

    expect(await rewrites("/removida")).toBe(`/${NOT_FOUND_SEGMENT}`);
  });

  describe("o que não tem a forma de um handle ou de um slug nem consulta o banco", () => {
    it.each([
      ["handle em maiúsculas", "/Ana"],
      ["handle codificado", "/%41na"],
      ["handle curto demais (2)", "/ab"],
      ["handle longo demais (31)", `/${"a".repeat(31)}`],
      ["sublinhado no handle", "/ana_x"],
      ["hífen na ponta", "/-ana"],
      ["hífen repetido", "/ana--x"],
      ["handle reservado: logout", "/logout"],
      ["slug em maiúsculas", "/ana/Sobre"],
      ["slug com ponto", "/ana/arquivo.html"],
      ["slug codificado", "/ana/%53obre"],
      ["slug longo demais (81)", `/ana/${"a".repeat(81)}`],
      ["um segmento inválido no meio", "/ana/calculo/Limites/outro"],
    ])("%s: %s reescreve ao 404, sem consulta", async (_label, path) => {
      await createTestUser({ email: "ana@exemplo.test", handle: "ana" });

      expect(await rewrites(path), path).toBe(`/${NOT_FOUND_SEGMENT}`);
      expect(getUserByHandle).not.toHaveBeenCalled();
    });
  });

  it("a raiz (o portal), a API, o login, o Next.js e o próprio alvo do 404 seguem sem consulta", async () => {
    for (const path of ["/", "/api/users", "/login", "/_next/static/a.js", `/${NOT_FOUND_SEGMENT}`]) {
      expect(passes(await proxy(request(path))), path).toBe(true);
    }
    expect(getUserByHandle).not.toHaveBeenCalled();
  });

  it("se o banco falhar, o Proxy não derruba a requisição: registra e deixa a página decidir", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getUserByHandle).mockRejectedValueOnce(new Error("banco fora do ar"));

    const response = await proxy(request("/ana"));

    expect(passes(response)).toBe(true);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
