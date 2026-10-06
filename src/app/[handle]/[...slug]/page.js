// Coleção e documento do espaço público `/{handle}/{...slug}` (RF14, RF29, RN04, RN14, RN15; CT13, CT14,
// CT31, CT43): resolve o caminho na árvore DO DONO, só com publicados (`onlyPublished`). Inexistente,
// rascunho e subárvore de rascunho respondem o MESMO 404 (RN15). A coleção redireciona ao primeiro
// documento descendente publicado, na ordem da árvore (RN14), ou mostra o estado vazio; o documento
// mostra o texto e os vizinhos de leitura. Estática com ISR, revalidada por caminhos literais (ADR-030).
import { notFound, redirect } from "next/navigation";
import { contentHref, neighboursOf } from "@/components/layout/space-paths";
import { DocumentView } from "@/components/reading/DocumentView";
import { EmptyCollection } from "@/components/reading/EmptyCollection";
import { documentMetadata } from "../../_lib/metadata";
import { firstDocumentPath, getPublicPage, publicSlugParams } from "../../_lib/space";
import { SpaceFrame } from "../../_lib/space-frame";

export const revalidate = 3600;
export const dynamicParams = true;

/** Sem dado no `next build` (ADR-021); em execução, os caminhos públicos dos espaços ativos. */
export async function generateStaticParams() {
  return publicSlugParams();
}

export async function generateMetadata({ params }) {
  const { handle, slug } = await params;
  const page = await getPublicPage(handle, slug);
  // Sem a página, o `notFound()` é do componente; o título vale o do espaço.
  if (!page) return {};
  return documentMetadata(page);
}

export default async function SpaceContentPage({ params }) {
  const { handle, slug } = await params;
  const page = await getPublicPage(handle, slug);
  if (!page) notFound();
  const { space, content, node, slugs } = page;

  // Sidebar: a coleção RAIZ que contém a página; um documento solto na raiz não tem.
  const root = space.tree.find((candidate) => candidate.slug === slugs[0]);
  const collection = root?.type === "COLLECTION" ? root : null;

  if (content.type === "COLLECTION") {
    const first = firstDocumentPath(node, slugs);
    if (first) redirect(contentHref(space.basePath, first));
    return (
      <SpaceFrame space={space} collection={collection} activePath={slugs}>
        <EmptyCollection title={content.title} homeHref={space.basePath} />
      </SpaceFrame>
    );
  }

  const { previous, next } = collection ? neighboursOf(collection, slugs, space.basePath) : { previous: null, next: null };
  return (
    <SpaceFrame space={space} collection={collection} activePath={slugs}>
      <DocumentView title={content.title} body={content.body} previous={previous} next={next} />
    </SpaceFrame>
  );
}
