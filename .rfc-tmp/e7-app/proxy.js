// Mitigação testada: o Proxy recusa, antes do cache, o primeiro segmento que não é handle nem rota reservada.
import { NextResponse } from "next/server";
import { spaces } from "./lib";

const RESERVED = new Set(["api", "admin", "login", "nao-encontrado"]);

export function proxy(request) {
  if (process.env.E7_PROXY !== "1") return;
  const first = request.nextUrl.pathname.split("/")[1];
  if (!first || RESERVED.has(first) || spaces().includes(first)) return;
  return NextResponse.rewrite(new URL("/nao-encontrado", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
