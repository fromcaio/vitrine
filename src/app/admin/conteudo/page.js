// A árvore de conteúdo do próprio usuário (RF03, RF06, RF07, RF26; CT10 a CT12; RN05 a RN07, RN25): a página
// usa `requireSession`, lê a árvore SÓ do `user.id` da sessão (com os rascunhos; nunca um identificador da
// URL, então a árvore de outro usuário não aparece) e a entrega ao `ContentTree` da UI, que faz o resto
// pela API (publicar, reordenar, mover, criar coleção, excluir com confirmação). Os endereços de edição e de
// criação são MODELOS de texto: uma página de Servidor não passa funções a um Componente Cliente.
import { ContentTree } from "@/components/admin/ContentTree";
import { getContentTree } from "@/lib/db";
import { currentLimits } from "../../api/_lib/limits";
import { EDIT_HREF, NEW_HREF, serializableTree } from "../_lib/content-tree";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Conteúdo",
  robots: { index: false, follow: false },
};

export default async function ContentPage() {
  const { user } = await requireSession({ path: "/admin/conteudo" });
  const tree = await getContentTree({ ownerId: user.id });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Conteúdo</h1>
      <ContentTree
        initialTree={serializableTree(tree)}
        editHref={EDIT_HREF}
        newHref={NEW_HREF}
        maxContents={currentLimits().maxContentsPerUser}
      />
    </div>
  );
}
