// Troca de senha do painel (UC14, RF28, RN21; CT40): a página usa `requireSession` e o
// `PasswordChangeForm` da UI. Com a senha provisória (`mustChangePassword`), a troca é obrigatória
// (`mandatory`): é o alvo do redirecionamento de TODA página do painel (exceto esta), e ao terminar o
// usuário volta ao que pediu (`redirectTo`). O destino só vale se for um caminho interno do site
// (`safeRedirectPath`) e nunca esta própria página (um laço).
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";
import { PASSWORD_PAGE, passwordRedirectTarget } from "../_lib/password-redirect";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Trocar a senha",
  robots: { index: false, follow: false },
};

export default async function PasswordPage({ searchParams }) {
  const { redirectTo } = await searchParams;
  const { user } = await requireSession({ path: PASSWORD_PAGE, allowTemporaryPassword: true });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Trocar a senha</h1>
      <PasswordChangeForm mandatory={Boolean(user.mustChangePassword)} redirectTo={passwordRedirectTarget(redirectTo)} />
    </div>
  );
}
