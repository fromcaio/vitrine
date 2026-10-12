// Página de edição de um documento (P-012, R-007; RN18, RN19; CT19, CT20, CT53): monta o editor da UI com
// o conteúdo do servidor. O dono é conferido ANTES de renderizar (outro dono, inexistente ou coleção:
// 404), e a página entrega ao editor a `version` (o `updatedAt` do que foi aberto), com a qual o
// `PATCH` detecta a edição concorrente (409 `VERSION_CONFLICT`).
import { ContentEditor } from "@/components/editor/ContentEditor";
import { loadOwnDocument, publicViewHref } from "../../_lib/editor";
import { requireSession } from "../../_lib/session";

export const metadata = {
  title: "Editar conteúdo",
  robots: { index: false, follow: false },
};

export default async function EditContentPage({ params }) {
  const { id } = await params;
  const { user } = await requireSession({ path: `/admin/conteudo/${encodeURIComponent(id)}` });
  const content = await loadOwnDocument(user.id, id);
  const viewHref = await publicViewHref(user.id, content.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Editar conteúdo</h1>
      <ContentEditor
        userId={user.id}
        contentId={content.id}
        initialValue={{ title: content.title, slug: content.slug, body: content.body, status: content.status }}
        version={content.updatedAt.toISOString()}
        viewHref={viewHref}
      />
    </div>
  );
}
