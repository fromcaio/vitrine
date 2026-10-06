// A árvore de conteúdo de OUTRO usuário, para moderação (RF34, UC15; RN19, RN26; CT51, CT52): só o administrador
// (o usuário comum responde `notFound()`), e o usuário `[id]` tem de existir (senão, `notFound()`). A árvore é a
// do `[id]`, COM os rascunhos, em JSON puro; o `ContentTree` em modo de moderação só abre, despublica e exclui
// (com o motivo, que o servidor exige e leva ao dono em uma notificação). `editHref` é um modelo literal com o
// dono: uma página de Servidor não passa funções a um Componente Cliente; `newHref` não é usado.
import { ContentTree } from "@/components/admin/ContentTree";
import { getContentTree } from "@/lib/db";
import { currentLimits } from "../../../../api/_lib/limits";
import { serializableTree } from "../../../_lib/content-tree";
import { requireSession } from "../../../_lib/session";
import { loadOwner, moderationEditHref } from "../../../_lib/users";

export const metadata = {
  title: "Moderar conteúdo",
  robots: { index: false, follow: false },
};

export default async function ModerateContentPage({ params }) {
  const { id } = await params;
  await requireSession({ role: "admin", path: `/admin/usuarios/${encodeURIComponent(id)}/conteudo` });
  const owner = await loadOwner(id);
  const tree = await getContentTree({ ownerId: owner.id });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold wrap-anywhere">Conteúdo de {owner.name}</h1>
      <ContentTree
        initialTree={serializableTree(tree)}
        editHref={moderationEditHref(owner.id)}
        newHref="/admin/conteudo/novo"
        maxContents={currentLimits().maxContentsPerUser}
        moderation={{ ownerId: owner.id, ownerName: owner.name }}
      />
    </div>
  );
}
