// Estado vazio da coleção sem documento publicado (RN14, D-16; M17): a coleção publicada
// redireciona ao primeiro documento descendente publicado; se não houver nenhum, a página mostra
// isto, em vez de um 404 (a coleção existe e está publicada). Server Component de apresentação.
import Link from "next/link";

/**
 * @param {object} props
 * @param {string} props.title título da coleção (o `h1` da página)
 * @param {string} props.homeHref início do espaço, para o link de volta
 */
export function EmptyCollection({ title, homeHref }) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-3xl font-semibold break-words">{title}</h1>
      <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
        Esta coleção ainda não tem documentos publicados.
      </p>
      <p>
        <Link href={homeHref} className="rounded-sm font-medium underline underline-offset-4">
          Voltar ao início
        </Link>
      </p>
    </section>
  );
}
