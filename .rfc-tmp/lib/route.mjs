// Propostas 5, 6 e 9: helper de rota com autorização (código proposto para src/app/api/_lib/http.js).
// Ordem das verificações: origem -> sessão -> senha provisória -> limite de taxa -> recurso (404) ->
// autorização (403) -> corpo (400/422) -> cotas (422 QUOTA_EXCEEDED).
import { authorize, isSuspended } from "./authz.mjs";

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Mesma regra da ADR-018: a origem informada pelo navegador precisa ser a do próprio site. */
export function isSameOrigin(request, baseUrl) {
  const origin = request.headers.get("origin");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }
  try {
    const o = new URL(origin);
    return [request.headers.get("x-forwarded-host"), request.headers.get("host")].some((h) => h && h === o.host) || new URL(baseUrl).origin === o.origin;
  } catch {
    return false;
  }
}

/** Limitador de janela fixa em memória, por chave (instância única, ADR-011). */
export function createLimiter({ window = 60_000, max = 30, now = () => Date.now() } = {}) {
  const hits = new Map();
  return {
    take(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || t - entry.start >= window) {
        hits.set(key, { start: t, count: 1 });
        return { ok: true };
      }
      if (entry.count >= max) return { ok: false, retryAfter: Math.ceil((entry.start + window - t) / 1000) };
      entry.count += 1;
      return { ok: true };
    },
    size: () => hits.size,
  };
}

export function toResponse(error) {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: [] } }, { status: 500 });
}

/**
 * @param {{ auth: any, baseUrl: string, limiter?: ReturnType<typeof createLimiter> }} deps
 */
export function makeRoute({ auth, baseUrl, limiter }) {
  /**
   * @param {{ action: string, mutation?: boolean, load?: (params: Record<string,string>) => Promise<{ ownerId: string } | null>, readBody?: boolean }} spec
   * @param {(ctx: { request: Request, params: Record<string,string>, actor: any, resource: any }) => Promise<Response>} handler
   */
  return (spec, handler) => async (request, context) => {
    try {
      // 1. origem (só nas mutações)
      if (spec.mutation && !isSameOrigin(request, baseUrl)) throw new ApiError(401, "UNAUTHENTICATED", "Requisição de origem não permitida.");
      // 2. sessão, validada no banco
      const session = await auth.api.getSession({ headers: request.headers });
      const actor = session?.user ?? null;
      if (!actor || isSuspended(actor)) throw new ApiError(401, "UNAUTHENTICATED", "Autenticação necessária.");
      // 3. senha provisória: o servidor recusa tudo, menos trocar a senha e ler o próprio perfil
      const gate = authorize(actor, spec.action, { ownerId: actor.id });
      if (!gate.allowed && gate.code === "PASSWORD_CHANGE_REQUIRED") throw new ApiError(403, gate.code, "É preciso trocar a senha provisória antes de continuar.");
      // 4. limite de taxa por usuário nas escritas (as chamadas diretas a auth.api.* não passam pelo limitador do better-auth)
      if (spec.mutation && limiter) {
        const taken = limiter.take(`${actor.id}`);
        if (!taken.ok) throw new ApiError(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.", [{ retryAfter: taken.retryAfter }]);
      }
      // 5. recurso
      const params = (await context?.params) ?? {};
      let resource;
      if (spec.load) {
        resource = await spec.load(params);
        if (!resource) throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.", [{ field: "id", value: params.id }]);
      }
      // 6. autorização
      const decision = authorize(actor, spec.action, resource);
      if (!decision.allowed) throw new ApiError(decision.status, decision.code, "Você não tem permissão para esta operação.");
      // 7. corpo e 8. cotas: a cargo do handler, depois da autorização
      return await handler({ request, params, actor, resource });
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** Corpo JSON: 400 se malformado. */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "JSON malformado no corpo da requisição.");
  }
}
