// Visão geral do painel (M10, casca): identifica a sessão e anuncia as seções que ainda não
// existem. A árvore de conteúdos (M10) e o formulário de tema (M11) entram nas próximas entregas.

/** Seções previstas no mapa de rotas (Cap. 5 §5.11), ainda sem página. */
const UPCOMING = [
  {
    title: "Conteúdo",
    description: "Árvore de coleções e documentos: criar, editar, mover, publicar e excluir.",
  },
  {
    title: "Configurações",
    description: "Identidade do site, paleta de cores e links sociais.",
  },
];

/** @param {{ user: { name: string, email: string } }} props usuário da sessão */
export function AdminOverview({ user }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="mt-2 break-words text-muted">
          Sessão iniciada como <strong className="font-semibold text-foreground">{user.name}</strong>{" "}
          ({user.email}).
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {UPCOMING.map(({ title, description }) => (
          <li key={title} className="rounded-lg border border-border bg-surface p-4">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              {title}{" "}
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-normal whitespace-nowrap text-muted">
                em breve
              </span>
            </h2>
            <p className="mt-2 text-sm text-muted">{description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
