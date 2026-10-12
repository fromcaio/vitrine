// Início do espaço público `/{handle}` (RF29, RF42, D-16, RN36, ADR-040; CT43, CT73): o `SpaceHome` da UI com o
// texto da página inicial do dono (só se publicado e não vazio; senão, a descrição) e, com o interruptor ligado
// (`homeShowItems`), as coleções e os documentos PUBLICADOS da raiz (RN15), ou o estado vazio do componente. Estática com ISR: o caminho nasce
// sob demanda e é revalidado por `revalidatePath` literal (ADR-030). Espaço inexistente, sem handle ou
// suspenso: 404 (RF14).
import { notFound } from "next/navigation";
import { getHome } from "@/lib/db";
import { SpaceHome } from "@/components/layout/SpaceHome";
import { contentHref } from "@/components/layout/space-paths";
import { spaceHomeMetadata } from "../_lib/metadata";
import { getSpace, publicHandleParams } from "../_lib/space";
import { SpaceFrame } from "../_lib/space-frame";

export const revalidate = 3600;
export const dynamicParams = true;

/** Sem dado no `next build` (ADR-021); em execução, os espaços ativos com raiz publicada. */
export async function generateStaticParams() {
  return publicHandleParams();
}

/** O título e a descrição são do layout; aqui, o endereço canônico e o Open Graph. */
export async function generateMetadata({ params }) {
  const { handle } = await params;
  const space = await getSpace(handle);
  return space ? spaceHomeMetadata(space) : {};
}

export default async function SpaceHomePage({ params }) {
  const { handle } = await params;
  const space = await getSpace(handle);
  if (!space) notFound();

  // `space.tree` já é a árvore podada: só o que está publicado (RN15), com a URL de cada raiz.
  const items = space.tree.map((node) => ({
    id: node.id,
    title: node.title,
    href: contentHref(space.basePath, [node.slug]),
    kind: node.type,
  }));
  // RN36: o texto só vale publicado e não vazio (o `getHome` já entrega `null` no vazio); em rascunho, a página
  // mostra a descrição. A leitura vem depois de `getSpace`, que é a guarda do `next build` (ADR-021).
  const { homeBody, homeStatus, homeShowItems } = await getHome(space.owner.id);
  const body = homeStatus === "PUBLISHED" && homeBody ? homeBody : null;
  return (
    <SpaceFrame space={space}>
      <SpaceHome
        name={space.name}
        description={space.appearance.siteDescription}
        body={body}
        showItems={homeShowItems}
        items={items}
      />
    </SpaceFrame>
  );
}
