// Proxy (antigo Middleware) do Next.js 16, em Node.js. Dois papéis:
//
// 1. PAINEL (`/admin/**`): verificação OTIMISTA de sessão. Só confere se o cookie de sessão existe,
//    sem consultar o banco, para não renderizar a página a quem claramente não tem sessão. NÃO é a
//    barreira de segurança: a sessão é validada no servidor pelo layout do painel e por cada Route
//    Handler de /api (RF21; Cap. 5 §5.6, Tabela de camadas).
// 2. ESPAÇOS PÚBLICOS (`/{handle}/**`; ADR-030, item 4; CT45): uma URL cujo primeiro segmento não é um
//    `handle` ATIVO, ou que tem um segmento fora da forma de um slug, é reescrita (`rewrite`) para uma
//    página dinâmica que responde `notFound()`. Sem isso, cada URL inexistente viraria um 404 em
//    cache de ISR (cerca de 7 arquivos e 12 a 16 kB por URL, sem expurgo) e o 404 de um caminho em
//    maiúsculas colidiria, em sistema de arquivos sem distinção de caixa, com a página real. A
//    reescrita não deixa arquivo algum e é feita ANTES do cache: um `handle` criado em seguida
//    funciona sem revalidar, e um espaço suspenso ou removido some na hora, mesmo com a página em
//    cache. O documento inexistente DENTRO de um espaço válido não é coberto (risco aceito no
//    Cap. 5 §5.7: consultá-lo no Proxy custa a leitura da árvore em toda visita; ver a medição em
//    `tests/core/proxy-custo.test.js`).
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getUserByHandle } from "@/lib/db";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from "@/lib/validators";

/**
 * Segmento da página que responde 404 (`src/app/%5Fnao-encontrado`). Começa por sublinhado: nenhum
 * handle nem slug o tem (a classe é [a-z0-9-]), então não colide com espaço algum e dispensa um novo
 * nome reservado (RN20).
 */
export const NOT_FOUND_SEGMENT = "_nao-encontrado";

/** Primeiros segmentos que não são de espaço: o Next.js, a API, as imagens e o login (o painel tem o ramo próprio). */
const STATIC_SEGMENTS = new Set(["api", "_next", "login", "media", NOT_FOUND_SEGMENT]);

/** @param {string} value */
const isHandleShape = (value) =>
  value.length >= HANDLE_MIN_LENGTH && value.length <= HANDLE_MAX_LENGTH && HANDLE_PATTERN.test(value);

/** @param {string} value */
const isSlugShape = (value) => value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);

/** @param {import("next/server").NextRequest} request */
function notFoundRewrite(request) {
  return NextResponse.rewrite(new URL(`/${NOT_FOUND_SEGMENT}`, request.url));
}

/**
 * O painel: sem o cookie de sessão, vai ao login preservando o destino (UC08).
 * @param {import("next/server").NextRequest} request
 */
function guardPanel(request) {
  if (getSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

/**
 * Os espaços públicos. Primeiro a forma (regex, sem banco); só um primeiro segmento que PODE ser um
 * handle chega à consulta (um índice único por handle).
 * @param {import("next/server").NextRequest} request
 */
async function guardSpace(request) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return NextResponse.next(); // o portal
  const [first, ...rest] = segments;
  if (STATIC_SEGMENTS.has(first)) return NextResponse.next();

  if (RESERVED_HANDLES.includes(first) || !isHandleShape(first) || !rest.every(isSlugShape)) {
    return notFoundRewrite(request);
  }

  try {
    // Suspenso conta como inexistente (RN23): o espaço responde 404 mesmo com a página em cache.
    if (!(await getUserByHandle(first))) return notFoundRewrite(request);
  } catch (error) {
    // O Proxy nunca derruba a requisição por causa do banco: a página decide (e responde 404 ou erro).
    console.error("[proxy] não foi possível consultar o handle:", error);
  }
  return NextResponse.next();
}

/** @param {import("next/server").NextRequest} request */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return guardPanel(request);
  return guardSpace(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    // Todo primeiro segmento público: tudo, menos a raiz (o portal), `api`, `_next`, `login`, `media` (as imagens,
    // que não passam pela consulta do handle), o painel (já coberto acima) e os arquivos com extensão
    // (`favicon.ico`, `/public`).
    "/((?!api(?:/|$)|_next(?:/|$)|login(?:/|$)|media(?:/|$)|admin(?:/|$)|.*\\.[^/]*$).+)",
  ],
};
