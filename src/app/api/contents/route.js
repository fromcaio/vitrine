// /api/contents (Cap. 5 §5.10): árvore do painel e criação de conteúdo. Toda rota exige sessão e
// age sobre o conteúdo do DONO da sessão (RN13, RN19); o autor nunca vem do corpo.
import { authorize } from "@/lib/authz";
import { createContent, getContentTree } from "@/lib/db";
import { revalidateContentTree } from "@/lib/revalidate";
import { contentCreateSchema } from "@/lib/validators";
import { withSlugSuggestion } from "../_lib/contents";
import { ApiError, contentJsonMaxBytes, ok, parse } from "../_lib/http";
import { currentLimits } from "../_lib/limits";
import { route } from "../_lib/route";

/**
 * GET: árvore completa DO DONO, inclusive rascunhos, sem o corpo e com o `status` de cada nó
 * (RF26). O administrador lista a de outro usuário com `?ownerId=` (moderação, RN19); o usuário
 * comum que informa o dono de outro recebe 403.
 */
export const GET = route({ action: "content:list" }, async ({ request, actor }) => {
  const requested = new URL(request.url).searchParams.get("ownerId");
  const ownerId = requested || actor.id;
  if (ownerId !== actor.id) {
    const decision = authorize(actor, "content:list", { ownerId });
    if (!decision.allowed) throw new ApiError(decision.status, decision.code, "Você não tem permissão para esta operação.");
  }
  return ok(await getContentTree({ ownerId }));
});

/**
 * POST: cria um documento ou uma coleção (RF05, RF06). O autor é o usuário da sessão (RN13), mesmo
 * quando é o administrador quem escreve, e o estado, se omitido, é PUBLISHED (RN16). Respeita as
 * cotas do usuário (RN25). Responde 201 e revalida o layout raiz (RN10).
 */
export const POST = route({ action: "content:create", mutation: true, rate: "content" }, async ({ actor, readJson }) => {
  const limits = currentLimits();
  const input = parse(contentCreateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
  const parentId = input.parentId ?? null;

  const content = await withSlugSuggestion({ slug: input.slug, parentId, ownerId: actor.id }, () =>
    createContent({ ...input, parentId, authorId: actor.id }, { limits }),
  );

  revalidateContentTree();
  return ok(content, { status: 201, headers: { Location: `/api/contents/${content.id}` } });
});
