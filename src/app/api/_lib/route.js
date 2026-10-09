// Auxiliar de Route Handler com autorização por dono (RF21, RN01, RN19, RN21; Cap. 5 §5.6.3,
// ADR-029). Toda rota da API passa por `route(spec, handler)`, que aplica SEMPRE a mesma ordem:
//
//   1. origem da requisição (nas mutações)              → 401 UNAUTHENTICATED
//   2. sessão, validada no banco, com a suspensão       → 401 UNAUTHENTICATED
//   3. senha provisória                                 → 403 PASSWORD_CHANGE_REQUIRED
//   4. limite de taxa por usuário (nas mutações)        → 429 RATE_LIMITED
//   5. carregar o recurso                               → 404 NOT_FOUND
//   6. autorização (matriz de src/lib/authz.js)         → 403 FORBIDDEN
//   7. corpo (400, 413, 422), lido pelo handler (JSON com `readJson`; arquivo com `readFile`, nas rotas `multipart`)
//   8. cotas (422 QUOTA_EXCEEDED), conferidas pela camada de dados
//
// Quem chega ao passo 7 sem ser autorizado nunca tem o corpo lido. A pasta `_lib` é privada: não
// gera rota.
import { POLICY, authorize } from "@/lib/authz";
import { getSession } from "@/lib/auth";
import { ApiError, isSameOrigin, readFormFile, readJson, toErrorResponse } from "./http";
import { RATE_LIMITS, takeToken } from "./rate-limit";

/**
 * Usuário da sessão, com o papel, a suspensão e o marcador de senha provisória.
 * @typedef {import("@/lib/auth").SessionUser} Actor
 */

/**
 * Recurso-alvo carregado pela rota: o dono mais o que o handler quiser reaproveitar.
 * @typedef {{ ownerId: string } & Record<string, unknown>} LoadedResource
 */

/**
 * Contexto entregue ao handler.
 * @typedef {Object} RouteContext
 * @property {Request} request
 * @property {Record<string, string>} params parâmetros de rota, já resolvidos (assíncronos no Next.js 16)
 * @property {NonNullable<Awaited<ReturnType<typeof getSession>>>} session
 * @property {Actor} actor usuário da sessão
 * @property {LoadedResource | undefined} resource recurso carregado por `spec.load`
 * @property {boolean} foreign o recurso é de outro dono (só o administrador, com `allowForeign`): moderação
 * @property {(options?: { maxBytes?: number }) => Promise<unknown>} readJson lê o corpo JSON com limite
 * @property {(options: { maxFileBytes: number }) => ReturnType<typeof readFormFile>} readFile lê o arquivo do corpo
 *   `multipart/form-data` (só nas rotas com `multipart: true`; A-029)
 */

/**
 * Especificação de uma rota.
 * @typedef {Object} RouteSpec
 * @property {string} action chave de `POLICY` (obrigatória: não há rota sem ação)
 * @property {boolean} [mutation] rota de escrita: verifica a origem e exige `rate`
 * @property {keyof typeof RATE_LIMITS} [rate] grupo do limite de taxa (obrigatório nas mutações)
 * @property {(context: { request: Request, params: Record<string, string>, actor: Actor }) => Promise<LoadedResource | null>} [load]
 *   carrega o recurso-alvo; `null` responde 404. Sem ela, a ação é de coleção
 * @property {boolean} [multipart] rota de envio de arquivo (A-029): o corpo é `multipart/form-data` e o handler o lê
 *   com `readFile` (limite de leitura, 413 antes de decodificar); é sempre uma escrita (`mutation` e `rate`)
 * @property {boolean} [allowForeign] aceita o recurso de outro dono quando a matriz o permite ao
 *   administrador (moderação). Padrão `false`: o recurso alheio responde 403 mesmo ao administrador
 */

const FORBIDDEN_MESSAGE = "Você não tem permissão para esta operação.";

/**
 * Envolve um Route Handler: valida a origem, a sessão e a autorização ANTES de qualquer ação (e do
 * corpo), resolve `params` e converte qualquer erro na resposta padrão.
 * @param {RouteSpec} spec
 * @param {(context: RouteContext) => Promise<Response>} handler
 * @returns {(request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>}
 */
export function route(spec, handler) {
  // Erros de programação aparecem ao importar o módulo (no `next build` e nos testes), e não em
  // produção: uma rota sem ação, ou de escrita sem limite de taxa, não chega a existir.
  if (typeof spec?.action !== "string" || !Object.hasOwn(POLICY, spec.action)) {
    throw new Error(`Rota sem ação conhecida da matriz de autorização: ${String(spec?.action)}`);
  }
  if (spec.mutation && !spec.rate) throw new Error(`A rota de escrita "${spec.action}" precisa de um grupo de limite de taxa.`);
  if (spec.multipart && !spec.mutation) throw new Error(`A rota de envio "${spec.action}" precisa ser de escrita (mutation).`);
  if (spec.rate && !Object.hasOwn(RATE_LIMITS, spec.rate)) throw new Error(`Grupo de limite de taxa desconhecido: ${spec.rate}`);

  return async function routeHandler(request, context) {
    try {
      // 1. Origem: o cookie de sessão não vale em requisição vinda de outro site (CSRF).
      if (spec.mutation && !isSameOrigin(request)) {
        throw new ApiError(401, "UNAUTHENTICATED", "Requisição de origem não permitida.");
      }

      // 2. Sessão, no banco; a suspensão vigente é tratada como sessão ausente (RN23).
      const session = await getSession(request.headers);
      if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Autenticação necessária.");
      const actor = session.user;

      // 3. Senha provisória (RN21): só trocar a própria senha e ler o próprio perfil.
      const gate = authorize(actor, spec.action, { ownerId: actor.id });
      if (!gate.allowed && gate.code === "PASSWORD_CHANGE_REQUIRED") {
        throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "É preciso trocar a senha provisória antes de continuar.");
      }

      // 4. Limite de taxa por usuário, contado antes do recurso para limitar também as recusas.
      if (spec.mutation && spec.rate) {
        const taken = takeToken(spec.rate, actor.id);
        if (!taken.ok) {
          throw new ApiError(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.", [], {
            "Retry-After": String(taken.retryAfter),
          });
        }
      }

      // 5. Recurso: inexistente é 404, antes de qualquer decisão sobre o dono.
      const params = (await context?.params) ?? {};
      /** @type {LoadedResource | undefined} */
      let resource;
      if (spec.load) {
        const loaded = await spec.load({ request, params, actor });
        if (!loaded) {
          throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.", params.id ? [{ field: "id", value: params.id }] : []);
        }
        resource = loaded;
      }

      // 6. Autorização pela matriz. O recurso de outro dono só passa se a rota aceita moderação.
      const decision = authorize(actor, spec.action, resource);
      if (!decision.allowed) {
        throw new ApiError(decision.status, decision.code, decision.code === "UNAUTHENTICATED" ? "Autenticação necessária." : FORBIDDEN_MESSAGE);
      }
      if (decision.foreign && !spec.allowForeign) throw new ApiError(403, "FORBIDDEN", FORBIDDEN_MESSAGE);

      // 7 e 8. O corpo e as cotas são do handler, que só roda depois de tudo isto.
      return await handler({
        request,
        params,
        session,
        actor,
        resource,
        foreign: decision.foreign,
        readJson: (options) => readJson(request, options),
        readFile: (options) => {
          if (!spec.multipart) throw new Error(`A rota "${spec.action}" não é multipart.`);
          return readFormFile(request, options);
        },
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
