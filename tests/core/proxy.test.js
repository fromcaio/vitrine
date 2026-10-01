// Proxy (src/proxy.js): verificação otimista do cookie de sessão nas rotas do painel (CT03,
// parte verificável sem navegador). A barreira real é testada em api-auth-guard.test.js.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const request = (path, cookie) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

describe("proxy", () => {
  it("só atua nas rotas do painel", () => {
    expect(config.matcher).toEqual(["/admin/:path*"]);
  });

  it("sem cookie de sessão, redireciona a /login preservando o destino", () => {
    const response = proxy(request("/admin/conteudo?aba=rascunhos"));

    expect(response.status).toBe(307);
    const location = new URL(/** @type {string} */ (response.headers.get("location")));
    expect(location.origin).toBe("http://localhost:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/admin/conteudo?aba=rascunhos");
  });

  it("cookie de outra finalidade não conta como sessão", () => {
    expect(proxy(request("/admin", "tema=escuro")).status).toBe(307);
  });

  it.each(["better-auth.session_token=abc.def", "__Secure-better-auth.session_token=abc.def"])(
    "com o cookie %s, deixa a requisição seguir",
    (cookie) => {
      const response = proxy(request("/admin", cookie));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});
