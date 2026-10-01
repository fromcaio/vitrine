// Página de login (UC08). O formulário usa o cliente do better-auth, que envia as credenciais a
// POST /api/auth/sign-in/email (rota com limitação de tentativas). Formulário provisório do
// Core: a aparência definitiva é do componente LoginForm da UI (Cap. 5 §5.11).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/validators";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }) {
  const { redirectTo } = await searchParams;
  const destination = safeRedirectPath(redirectTo);

  // Quem já tem sessão válida segue direto para o destino.
  if (await getSession(await headers())) redirect(destination);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <LoginForm redirectTo={destination} />
    </main>
  );
}
