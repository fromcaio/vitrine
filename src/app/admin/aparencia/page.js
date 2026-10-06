// Aparência do próprio usuário (RF31, UC11; CT23, CT24): a página usa `requireSession` e monta o
// `AppearanceForm` da UI com a aparência DA SESSÃO. Nunca lê um identificador da URL: não há como pedir
// a de outro usuário (nem o administrador edita a de outro; RN19, ADR-025). O formulário traz o botão,
// as mensagens e os avisos de contraste por modo, e envia `PUT /api/appearance`.
import { notFound } from "next/navigation";
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { getAppearance } from "@/lib/db";
import { appearanceInitial } from "../_lib/forms";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Aparência",
  robots: { index: false, follow: false },
};

export default async function AppearancePage() {
  const { user } = await requireSession({ path: "/admin/aparencia" });
  const appearance = await getAppearance(user.id);
  if (!appearance) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Aparência do seu espaço</h1>
      <AppearanceForm initial={appearanceInitial(appearance)} />
    </div>
  );
}
