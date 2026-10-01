// /api/contents (Cap. 5 §5.10): árvore do painel e criação de conteúdo. Toda rota exige sessão.
import { createContent, getContentTree } from "@/lib/db";
import { revalidateContentTree } from "@/lib/revalidate";
import { contentCreateSchema } from "@/lib/validators";
import { withSlugSuggestion } from "../_lib/contents";
import { ok, parse, readJson, route } from "../_lib/http";

/** GET: árvore completa, inclusive rascunhos, sem o corpo e com o `status` de cada nó (RF26). */
export const GET = route(async () => ok(await getContentTree()));

/**
 * POST: cria um documento ou uma coleção (RF05, RF06). O autor é o usuário da sessão (RN13) e o
 * estado, se omitido, é PUBLISHED (RN16). Responde 201 e revalida o layout raiz (RN10).
 */
export const POST = route(
  async ({ request, session }) => {
    const input = parse(contentCreateSchema, await readJson(request));
    const parentId = input.parentId ?? null;

    const content = await withSlugSuggestion({ slug: input.slug, parentId }, () =>
      createContent({ ...input, parentId, authorId: session.user.id }),
    );

    revalidateContentTree();
    return ok(content, { status: 201, headers: { Location: `/api/contents/${content.id}` } });
  },
  { mutation: true },
);
