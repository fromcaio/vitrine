// Edição de um documento de OUTRO usuário, para moderação (RF34, UC15; RN18, RN19, RN26; CT51, CT52): só o
// administrador. O usuário `[id]` tem de existir e o documento TEM de pertencer a ele (`authorId`): qualquer
// outra combinação responde `notFound()`, indistinguível. O editor recebe o `userId` do ADMINISTRADOR (a chave
// do rascunho local é a dele), e o conteúdo, os valores e a `version` (o `updatedAt`) são os do DONO; o envio
// leva `reason` e `version`, e o servidor exige os dois (422 sem o motivo; 409 se o dono editou depois).
import { ContentEditor } from "@/components/editor/ContentEditor";
import { requireSession } from "../../../../_lib/session";
import { loadOwnedDocument, loadOwner } from "../../../../_lib/users";

export const metadata = {
  title: "Moderar documento",
  robots: { index: false, follow: false },
};

export default async function ModerateDocumentPage({ params }) {
  const { id, contentId } = await params;
  const { user } = await requireSession({
    role: "admin",
    path: `/admin/usuarios/${encodeURIComponent(id)}/conteudo/${encodeURIComponent(contentId)}`,
  });
  const owner = await loadOwner(id);
  const content = await loadOwnedDocument(owner.id, contentId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold wrap-anywhere">Moderar documento de {owner.name}</h1>
      <ContentEditor
        userId={user.id}
        contentId={content.id}
        initialValue={{ title: content.title, slug: content.slug, body: content.body, status: content.status }}
        version={content.updatedAt.toISOString()}
        moderation={{ ownerName: owner.name }}
      />
    </div>
  );
}
