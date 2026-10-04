// /api/contents/:id (Cap. 5 §5.10): detalhe, atualização parcial e exclusão. Cada rota carrega o
// conteúdo, compara o dono com a sessão e só então lê o corpo (RN19). Nesta versão o conteúdo de
// outro dono responde 403 em toda escrita, também para o administrador: a moderação (motivo
// obrigatório e aviso ao dono, RN19 e RN26) entra com o M17.
import { deleteContent, getContentById, getContentTree, updateContent } from "@/lib/db";
import { findSlugPath, revalidateContentTree, revalidateContentUpdate } from "@/lib/revalidate";
import { contentUpdateSchema } from "@/lib/validators";
import { withSlugSuggestion } from "../../_lib/contents";
import { ApiError, contentJsonMaxBytes, noContent, ok, parse } from "../../_lib/http";
import { currentLimits } from "../../_lib/limits";
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

/** GET: detalhe com o corpo e o `status`, em qualquer estado (painel). O administrador vê o de outro usuário. */
export const GET = route({ action: "content:read", load: loadContent, allowForeign: true }, async ({ resource }) =>
  ok(contentOf(resource)),
);

/**
 * PATCH: atualização parcial, inclusive de `status` e de pai (RF07, RF16, RF26). Revalida só a
 * página quando apenas o corpo mudou, e o layout raiz quando a mudança é estrutural (RN10, RN16).
 *
 * RN18: o `PATCH` que altera o corpo informa `version`, o `updatedAt` que o autor abriu; sem ele,
 * 422; com a versão desatualizada, 409 `VERSION_CONFLICT` com a versão atual em `details[0].value`,
 * sem alterar nada. Quando a versão vem junto de outro campo, também é conferida.
 */
export const PATCH = route(
  { action: "content:update", mutation: true, rate: "content", load: loadContent },
  async ({ params, resource, readJson }) => {
    const limits = currentLimits();
    const { version, ...patch } = parse(contentUpdateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
    if ("body" in patch && version === undefined) {
      throw new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [
        { field: "version", message: "Informe a versão em que o texto se baseou (campo version)." },
      ]);
    }
    const before = contentOf(resource);

    // Slug e pai resultantes: o que não vem na entrada permanece como está.
    const slug = patch.slug ?? before.slug;
    const parentId = patch.parentId === undefined ? before.parentId : patch.parentId;

    const after = await withSlugSuggestion({ slug, parentId, ownerId: before.authorId }, () =>
      updateContent(params.id, patch, { limits, expectedVersion: version }),
    );

    revalidateContentUpdate(before, after, findSlugPath(await getContentTree({ ownerId: before.authorId }), after.id));
    return ok(after);
  },
);

/** DELETE: exclui o conteúdo e todos os descendentes (RN07). Responde 204. */
export const DELETE = route(
  { action: "content:delete", mutation: true, rate: "content", load: loadContent },
  async ({ params }) => {
    await deleteContent(params.id);
    revalidateContentTree();
    return noContent();
  },
);
