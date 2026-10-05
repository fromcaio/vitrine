// Página de criação de conteúdo (P-012, R-007; CT19, CT20, CT53): monta o editor da UI para um
// documento novo. `?pai=<id da coleção>` põe o conteúdo dentro de uma coleção DO PRÓPRIO usuário; sem
// ele, na raiz; qualquer outro valor responde 404. A sessão e o dono são conferidos no servidor antes
// de renderizar.
import { ContentEditor } from "@/components/editor/ContentEditor";
import { resolveParent } from "../../_lib/editor";
import { requireSession } from "../../_lib/session";

export const metadata = {
  title: "Novo conteúdo",
  robots: { index: false, follow: false },
};

export default async function NewContentPage({ searchParams }) {
  const { pai } = await searchParams;
  const query = typeof pai === "string" && pai !== "" ? `?pai=${encodeURIComponent(pai)}` : "";
  const { user } = await requireSession({ path: `/admin/conteudo/novo${query}` });
  const parentId = await resolveParent(user.id, pai);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Novo conteúdo</h1>
      <ContentEditor
        userId={user.id}
        contentId={null}
        parentId={parentId}
        editPath="/admin/conteudo/{id}"
        initialValue={{ status: "PUBLISHED" }}
      />
    </div>
  );
}
