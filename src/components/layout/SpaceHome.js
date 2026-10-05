// Início do espaço público `/{handle}` (RF29, D-16; M17): o nome, a descrição e as coleções e
// documentos da raiz, ou o estado "ainda sem conteúdo publicado". Substitui a marcação mínima da
// página do Core. Server Component de apresentação: recebe tudo já resolvido (o Core entrega só os
// itens publicados, RN15, com a URL de cada um) e usa só tokens de tema. Um item sem título ou sem
// endereço é ignorado, para um dado malformado não gerar um link quebrado.
import Link from "next/link";

/** Nome do tipo de cada item. */
const KIND_LABEL = /** @type {const} */ ({ COLLECTION: "Coleção", DOCUMENT: "Documento" });

/**
 * @typedef {object} SpaceHomeItem
 * @property {string} id
 * @property {string} title título do conteúdo
 * @property {string} href URL do conteúdo (`contentHref`)
 * @property {"COLLECTION" | "DOCUMENT"} kind coleção ou documento
 */

/**
 * @param {object} props
 * @param {string} props.name nome do espaço (o `h1` da página)
 * @param {string | null} [props.description] descrição; vazia ou em branco, não aparece
 * @param {SpaceHomeItem[]} props.items conteúdos publicados da raiz, na ordem da árvore
 */
export function SpaceHome({ name, description = null, items }) {
  const shown = items.filter((item) => typeof item.title === "string" && item.title.trim() !== "" && typeof item.href === "string" && item.href !== "");
  const text = description?.trim();
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold break-words">{name}</h1>
        {text ? <p className="mt-2 break-words text-muted">{text}</p> : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">Este espaço ainda não tem conteúdo publicado.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
              >
                <span className="font-semibold break-words">{item.title}</span>
                <span className="text-sm text-muted">{KIND_LABEL[item.kind] ?? "Conteúdo"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
