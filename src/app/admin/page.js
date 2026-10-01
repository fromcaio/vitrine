// Visão geral do painel. Página provisória do Core: comprova o acesso autenticado e oferece o
// encerramento da sessão (RF20); a interface definitiva do painel é da UI (M10).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireAdminSession } from "./_lib/session";

/** Encerra a sessão no servidor (RF20): apaga a sessão do banco e remove o cookie. */
async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function AdminPage() {
  // Layouts não são renderizados de novo a cada navegação: a página também valida a sessão.
  const { user } = await requireAdminSession();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Painel administrativo</h1>
      <p>
        Sessão iniciada como {user.name} ({user.email}).
      </p>
      <form action={signOut}>
        <button type="submit" className="rounded border px-4 py-2">
          Sair
        </button>
      </form>
    </main>
  );
}
