// Validação do texto Markdown na gravação (A-021, ADR-033; RN25; Cap. 5 §5.10 e §5.12): as rotas que gravam
// um texto longo (`POST` e `PATCH` de conteúdo com `body`, `PUT /api/configuration` com `homeBody`) chamam
// `assertRenderable` DEPOIS das verificações baratas (a cota em bytes) e ANTES de gravar. Um texto que o
// pipeline do `MarkdownRenderer` não processa no orçamento (2 s, em um `worker_threads`) responde 422
// `CONTENT_TOO_COMPLEX`; com a fila cheia, 503 `BUSY` com `Retry-After`. A pasta `_lib` é privada.
import { bodyBytes } from "@/lib/limits";
import { RENDER_BUDGET_MS, RenderBusyError, checkRenderable } from "@/lib/render-budget";
import { ApiError, contentTooComplex, renderBusy } from "./http";

/**
 * A cota do corpo em bytes UTF-8 (RN25), conferida ANTES da validação cara. O mesmo erro (422
 * `QUOTA_EXCEEDED`, `details: [{ field: "body", bytes, max }]`) que o `db.js` lançaria na gravação.
 * @param {string | null | undefined} body
 * @param {{ maxBodyBytes: number }} limits
 */
export function assertBodyWithinQuota(body, limits) {
  const bytes = bodyBytes(body);
  if (bytes > limits.maxBodyBytes) {
    throw new ApiError(422, "QUOTA_EXCEEDED", "O corpo excede o tamanho máximo.", [
      { field: "body", bytes, max: limits.maxBodyBytes },
    ]);
  }
}

/**
 * O texto renderiza dentro do orçamento? Ausente ou vazio, sim. Falha de renderização de qualquer tipo
 * (tempo, `RangeError` da pilha, exceção do KaTeX): 422 `CONTENT_TOO_COMPLEX`, nunca 500. Fila cheia:
 * 503 `BUSY` com `Retry-After`. Quem a chama só grava depois que ela retorna.
 * @param {string | null | undefined} markdown
 * @param {"body" | "homeBody"} field
 * @param {{ budgetMs?: number, userId?: string }} [options] `userId`: quem grava (o `actor.id`); no máximo UMA
 *   validação por usuário em andamento ou na fila (A-022): a segunda recebe 503 `BUSY`
 */
export async function assertRenderable(markdown, field, { budgetMs = RENDER_BUDGET_MS, userId } = {}) {
  if (typeof markdown !== "string" || markdown === "") return;
  try {
    const check = await checkRenderable(markdown, { budgetMs, userId });
    if (!check.renderable) throw contentTooComplex(field, { reason: check.reason, budgetMs });
  } catch (error) {
    if (error instanceof RenderBusyError) throw renderBusy(error.retryAfter);
    throw error;
  }
}
