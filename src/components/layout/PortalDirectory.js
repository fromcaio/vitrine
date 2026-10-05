// Diretório de espaços do portal (RF30, RN28; M17): um cartão por espaço público, em ordem (a do
// `listPublicSpaces`: alfabética pelo nome de exibição), cada um levando a `/{handle}`. Sem
// nenhum espaço, mostra o estado vazio. Quem decide exibir o diretório (`directoryEnabled`) é a
// página: este componente só desenha a lista que recebe. Server Component de apresentação.
import Link from "next/link";

/**
 * Um espaço do diretório: o retorno de `listPublicSpaces` (src/lib/db.js).
 * @typedef {{ id: string, handle: string, name: string, description: string | null }} PublicSpace
 */

/**
 * @param {object} props
 * @param {PublicSpace[]} props.spaces os espaços públicos, já ordenados
 * @param {string} [props.heading] título da seção
 */
export function PortalDirectory({ spaces, heading = "Espaços" }) {
  return (
    <section aria-labelledby="diretorio-de-espacos" className="flex flex-col gap-4">
      <h2 id="diretorio-de-espacos" className="text-xl font-semibold">
        {heading}
      </h2>
      {spaces.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">Nenhum espaço público ainda.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <li key={space.id} className="min-w-0">
              <article className="flex h-full flex-col gap-1 rounded-md border border-border bg-surface p-4">
                <h3 className="text-base font-semibold break-words">
                  <Link href={`/${encodeURIComponent(space.handle)}`} className="rounded-sm underline underline-offset-4">
                    {space.name}
                  </Link>
                </h3>
                <p className="text-sm text-muted">@{space.handle}</p>
                {space.description ? <p className="text-sm break-words">{space.description}</p> : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
