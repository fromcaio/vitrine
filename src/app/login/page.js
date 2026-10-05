// Página de login (UC08). O formulário usa o cliente do better-auth, que envia as credenciais a
// POST /api/auth/sign-in/email (rota com limitação de tentativas). A lógica de sessão e de
// redirecionamento é do Core; a aparência é da UI: o cartão abaixo e o componente LoginForm
// (Cap. 5 §5.11).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/validators";

// O título ("Entrar | nome do site") é do layout deste segmento: ver login/layout.js.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }) {
  const { redirectTo } = await searchParams;
  const destination = safeRedirectPath(redirectTo);

  // Quem já tem sessão válida segue direto para o destino.
  if (await getSession(await headers())) redirect(destination);

  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border border-t-4 border-t-secondary bg-background p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Vitrine</p>
        <h1 className="mt-1 text-2xl font-semibold">Entrar</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Acesse o painel administrativo com o seu e-mail e a sua senha.
        </p>
        <LoginForm redirectTo={destination} />
      </div>
    </main>
  );
}
