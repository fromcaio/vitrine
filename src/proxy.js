// Proxy (antigo Middleware) do Next.js 16: verificação OTIMISTA de sessão para o painel.
// Só confere se o cookie de sessão existe, sem consultar o banco, para não renderizar a página a
// quem claramente não tem sessão. NÃO é a barreira de segurança: a sessão é validada no servidor
// pelo layout do painel e por cada Route Handler de /api (RF21; Cap. 5 §5.6, Tabela de camadas).
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** @param {import("next/server").NextRequest} request */
export function proxy(request) {
  if (getSessionCookie(request)) return NextResponse.next();

  // Preserva o destino original para o redirecionamento depois do login (UC08).
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
