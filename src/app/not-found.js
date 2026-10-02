// Página 404 (RF14), no lugar da padrão do Next.js, que é em inglês. Vale para qualquer URL sem
// rota e para toda chamada a notFound(). A mensagem é única: não distingue uma página que nunca
// existiu de um conteúdo em rascunho ou com ancestral em rascunho, que também responde 404 (RN15).
// Marcação mínima do Core, só com os tokens de tema; a aparência definitiva é da UI (M07).
import Link from "next/link";

// Com o modelo do layout raiz, o título fica "Página não encontrada | <nome do site>".
export const metadata = {
  title: "Página não encontrada",
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border border-t-4 border-t-secondary bg-background p-6 text-center sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Erro 404</p>
        <h1 className="mt-1 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          O endereço que você abriu não existe ou não está disponível.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-secondary hover:text-on-secondary"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
