// /api/contents/:id (Cap. 5 §5.10): detalhe, atualização parcial e exclusão. Cada rota carrega o
// conteúdo, compara o dono com a sessão e só então lê o corpo (RN19). O conteúdo de outro dono é
// MODERAÇÃO (RF34, RN19, RN26, ADR-027): só o administrador (a matriz o permite), só despublicar,
// editar e excluir (mover e reordenar continuam 403), com o motivo (`reason`, 422 sem ele), e o dono
// recebe a notificação `MODERATION`.
import { getContentById } from "@/lib/db";
import { STRUCTURAL_FIELDS, affectsDirectory, hasStructuralChange } from "@/lib/revalidate";
import { contentDeleteQuerySchema, contentUpdateSchema } from "@/lib/validators";
import { withSlugSuggestion } from "../../_lib/contents";
import { ApiError, contentJsonMaxBytes, noContent, ok, parse } from "../../_lib/http";
import { currentLimits } from "../../_lib/limits";
import {
  MOVE_FIELDS,
  contentNotification,
  deleteWithNotice,
  updateEvent,
  updateWithNotice,
} from "../../_lib/moderation";
import { captureSpace, revalidateBody, revalidateStructure } from "../../_lib/revalidation";
import { route } from "../../_lib/route";

/**
 * Carrega o conteúdo para a autorização: o dono é o autor (RN13). Inexistente responde 404.
 * @param {{ params: Record<string, string> }} context
 */
async function loadContent({ params }) {
  const content = await getContentById(params.id);
  return content ? { ownerId: content.authorId, content } : null;
}

/** @param {import("../../_lib/route").LoadedResource | undefined} resource */
const contentOf = (resource) => /** @type {import("@/generated/prisma/client").Content} */ (resource?.content);

const FORBIDDEN_MESSAGE = "Você não tem permissão para esta operação.";

/**
 * O motivo é obrigatório na moderação (RN19, RN26): 422 sem ele.
 * @param {string | undefined} reason
 * @returns {string}
 */
function requireReason(reason) {
  if (reason === undefined) {
    throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
      { field: "reason", message: "Informe o motivo da moderação (campo reason)." },
    ]);
  }
  return reason;
}

/** GET: detalhe com o corpo e o `status`, em qualquer estado (painel). O administrador vê o de outro usuário. */
export const GET = route({ action: "content:read", load: loadContent, allowForeign: true }, async ({ resource }) =>
  ok(contentOf(resource)),
);

/**
 * PATCH: atualização parcial, inclusive de `status` e de pai (RF07, RF16, RF26). Invalida só a página
 * do documento quando apenas o corpo mudou e, quando a mudança é estrutural, o espaço inteiro do dono,
 * com os caminhos de antes e de depois (RN10, RN16, ADR-030).
 *
 * RN18: o `PATCH` que altera o corpo informa `version`, o `updatedAt` que o autor abriu; sem ele,
 * 422; com a versão desatualizada, 409 `VERSION_CONFLICT` com a versão atual em `details[0].value`,
 * sem alterar nada. Quando a versão vem junto de outro campo, também é conferida (inclusive na
 * moderação).
 *
 * Moderação (conteúdo de outro dono): `reason` obrigatório; `parentId` e `order` respondem 403.
 */
export const PATCH = route(
  { action: "content:update", mutation: true, rate: "content", load: loadContent, allowForeign: true },
  async ({ params, resource, foreign, readJson }) => {
    const limits = currentLimits();
    const { version, reason, ...patch } = parse(contentUpdateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
    if ("body" in patch && version === undefined) {
      throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
        { field: "version", message: "Informe a versão em que o texto se baseou (campo version)." },
      ]);
    }
    const before = contentOf(resource);

    // Moderação: mover e reordenar o que é de outro dono não é moderação (403); o motivo é obrigatório.
    if (foreign && MOVE_FIELDS.some((field) => field in patch)) throw new ApiError(403, "FORBIDDEN", FORBIDDEN_MESSAGE);
    const notification = foreign
      ? contentNotification({
          ownerId: before.authorId,
          event: updateEvent(before, patch),
          reason: requireReason(reason),
          content: before,
          fields: Object.keys(patch),
        })
      : null;

    // Slug e pai resultantes: o que não vem na entrada permanece como está.
    const slug = patch.slug ?? before.slug;
    const parentId = patch.parentId === undefined ? before.parentId : patch.parentId;

    // O retrato do espaço de ANTES só vale a consulta se a mudança for estrutural (um corpo novo não
    // move página alguma).
    const structural = hasStructuralChange(
      before,
      Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [field, patch[field] === undefined ? before[field] : patch[field]])),
    );
    const snapshot = structural ? await captureSpace(before.authorId) : undefined;

    const after = await withSlugSuggestion({ slug, parentId, ownerId: before.authorId }, () =>
      updateWithNotice(params.id, patch, { limits, expectedVersion: version }, notification),
    );

    if (structural) {
      await revalidateStructure({
        ownerId: before.authorId,
        before: snapshot,
        directory: affectsDirectory(before, after),
      });
    } else {
      await revalidateBody({ ownerId: before.authorId, nodeId: after.id });
    }
    return ok(after);
  },
);

/**
 * DELETE: exclui o conteúdo e todos os descendentes (RN07). Responde 204. No conteúdo de outro dono
 * (moderação), `?reason=` é obrigatório (422 sem ele) e o dono é notificado.
 */
export const DELETE = route(
  { action: "content:delete", mutation: true, rate: "content", load: loadContent, allowForeign: true },
  async ({ params, request, resource, foreign }) => {
    const { reason } = parse(contentDeleteQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    const before = contentOf(resource);
    const notification = foreign
      ? contentNotification({
          ownerId: before.authorId,
          event: "CONTENT_DELETED",
          reason: requireReason(reason),
          content: before,
        })
      : null;

    const snapshot = await captureSpace(before.authorId);
    await deleteWithNotice(params.id, notification);

    await revalidateStructure({
      ownerId: before.authorId,
      before: snapshot,
      directory: affectsDirectory(before, null),
    });
    return noContent();
  },
);
