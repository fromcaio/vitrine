// /api/contents/:id (Cap. 5 §5.10): detalhe, atualização parcial e exclusão. Toda rota exige sessão.
import { deleteContent, getContentById, getContentTree, updateContent } from "@/lib/db";
import { findSlugPath, revalidateContentTree, revalidateContentUpdate } from "@/lib/revalidate";
import { contentUpdateSchema } from "@/lib/validators";
import { assertSlugAllowed, withSlugSuggestion } from "../../_lib/contents";
import { ApiError, noContent, ok, parse, readJson, route } from "../../_lib/http";

/** @param {string} id */
async function getContentOr404(id) {
  const content = await getContentById(id);
  if (!content) {
    throw new ApiError(404, "NOT_FOUND", "Conteúdo não encontrado.", [{ field: "id", value: id }]);
  }
  return content;
}

/** GET: detalhe com o corpo e o `status`, em qualquer estado (painel). */
export const GET = route(async ({ params }) => ok(await getContentOr404(params.id)));

/**
 * PATCH: atualização parcial, inclusive de `status` e de pai (RF07, RF16, RF26). Revalida só a
 * página quando apenas o corpo mudou, e o layout raiz quando a mudança é estrutural (RN10, RN16).
 */
export const PATCH = route(
  async ({ request, params }) => {
    const patch = parse(contentUpdateSchema, await readJson(request));
    const before = await getContentOr404(params.id);

    // Slug e pai resultantes: o que não vem na entrada permanece como está.
    const slug = patch.slug ?? before.slug;
    const parentId = patch.parentId === undefined ? before.parentId : patch.parentId;
    assertSlugAllowed(slug, parentId, patch.slug === undefined ? "parentId" : "slug");

    const after = await withSlugSuggestion({ slug, parentId }, () => updateContent(params.id, patch));

    revalidateContentUpdate(before, after, findSlugPath(await getContentTree(), after.id));
    return ok(after);
  },
  { mutation: true },
);

/** DELETE: exclui o conteúdo e todos os descendentes (RN07). Responde 204. */
export const DELETE = route(
  async ({ params }) => {
    await deleteContent(params.id);
    revalidateContentTree();
    return noContent();
  },
  { mutation: true },
);
