// Início do espaço público `/{handle}` (RF29, D-16; CT43): lista as coleções e os documentos publicados
// da raiz, ou o estado vazio. Estática com ISR: o caminho nasce sob demanda e é revalidado por
// `revalidatePath` literal (ADR-030). Espaço inexistente, sem handle ou suspenso: 404 (RF14).
// A marcação é mínima e usa só os tokens de tema; a aparência definitiva é da UI.
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentHref } from "@/components/layout/space-paths";
import { getSpace, publicHandleParams } from "../_lib/space";
import { SpaceFrame } from "../_lib/space-frame";

export const revalidate = 3600;
export const dynamicParams = true;

/** Sem dado no `next build` (ADR-021); em execução, os espaços ativos com raiz publicada. */
export async function generateStaticParams() {
  return publicHandleParams();
}

const KIND_LABEL = { COLLECTION: "Coleção", DOCUMENT: "Documento" };

export default async function SpaceHomePage({ params }) {
  const { handle } = await params;
  const space = await getSpace(handle);
  if (!space) notFound();

  const description = space.appearance.siteDescription?.trim();
  return (
    <SpaceFrame space={space}>
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold break-words">{space.name}</h1>
          {description ? <p className="mt-2 break-words text-muted">{description}</p> : null}
        </div>
        {space.tree.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
            Este espaço ainda não tem conteúdo publicado.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {space.tree.map((node) => (
              <li key={node.id}>
                <Link
                  href={contentHref(space.basePath, [node.slug])}
                  className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
                >
                  <span className="font-semibold break-words">{node.title}</span>
                  <span className="text-sm text-muted">{KIND_LABEL[node.type] ?? "Conteúdo"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SpaceFrame>
  );
}
