// Lista de permitidas do catch-all do better-auth (ADR-029, item 2; CT38). O pacote expõe 45 rotas
// brutas em /api/auth/*, 15 delas do plugin `admin`, que gravam texto sem validar e ignoram a
// autorização por dono do Vitrine. O Route Handler responde só ao que o produto usa; todo o resto
// responde 404 no envelope da ADR-018, sem chegar ao roteador do pacote. As operações sobre usuários
// passam por /api/users, que autorizam primeiro e chamam o plugin depois, sempre com os cabeçalhos
// da requisição. A pasta `_lib` é privada: não gera rota.

/** Prefixo do catch-all (o `basePath` padrão do better-auth). */
const BASE_PATH = "/api/auth";

/**
 * Pares `MÉTODO /caminho` atendidos, comparados por igualdade exata com o caminho da URL:
 * barra final, barras duplas, caixa diferente, `%`-codificação e `;` não casam e respondem 404.
 */
export const AUTH_ALLOWED = Object.freeze(new Set(["GET /get-session", "POST /sign-in/email", "POST /sign-out"]));

/**
 * Caminho depois de `/api/auth`, ou `null` se a URL não está sob o prefixo.
 * @param {Request} request
 */
export function authSubPath(request) {
  const { pathname } = new URL(request.url);
  return pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : null;
}

/** Resposta 404 no envelope de erro (ADR-018), igual à de uma rota que não existe. */
function notFound() {
  return Response.json(
    { error: { code: "NOT_FOUND", message: "Rota não encontrada.", details: [] } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Envolve os handlers do better-auth: o que não está na lista responde 404 antes de chegar ao
 * roteador do pacote.
 * @template {Record<string, (request: Request) => Promise<Response> | Response>} H
 * @param {H} handlers saída de `toNextJsHandler(auth)`
 * @returns {H}
 */
export function guardAuthHandlers(handlers) {
  /** @type {Record<string, (request: Request) => Promise<Response> | Response>} */
  const guarded = {};
  for (const [method, handler] of Object.entries(handlers)) {
    guarded[method] = (request) => {
      const subPath = authSubPath(request);
      if (subPath === null || !AUTH_ALLOWED.has(`${request.method} ${subPath}`)) return notFound();
      return handler(request);
    };
  }
  return /** @type {H} */ (guarded);
}
