// Proposta 4: lista de rotas permitidas no catch-all /api/auth/[...all] (código proposto).
export const AUTH_ALLOWED = new Set(["GET /get-session", "POST /sign-in/email", "POST /sign-out"]);

/** Caminho relativo a /api/auth, com a mesma interpretação do roteador (pathname do URL já normalizado). */
export function authSubPath(request) {
  const { pathname } = new URL(request.url);
  return pathname.startsWith("/api/auth") ? pathname.slice("/api/auth".length) || "/" : null;
}

/** Envolve os handlers do better-auth: o que não está na lista responde 404, sem chegar ao roteador. */
export function guardAuthHandlers(handlers) {
  const out = {};
  for (const [method, handler] of Object.entries(handlers)) {
    out[method] = (request) => {
      const sub = authSubPath(request);
      if (sub === null || !AUTH_ALLOWED.has(`${request.method} ${sub}`)) {
        return Response.json(
          { error: { code: "NOT_FOUND", message: "Rota não encontrada.", details: [] } },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      return handler(request);
    };
  }
  return out;
}
