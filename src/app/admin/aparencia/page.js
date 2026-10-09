// Aparência (RF31, UC11, D-40 e D-41; CT23, CT24): a página usa `requireSession` e nunca lê um
// identificador da URL, de modo que não há como pedir a aparência de outro usuário (nem o administrador
// edita a de outro; RN19, ADR-025). O usuário comum edita só a PRÓPRIA página (`AppearanceForm`, contra
// `PUT /api/appearance`), com a paleta e o nome do sistema como referência da herança. O ADMINISTRADOR
// escolhe o alvo por `?alvo=` (`AppearanceTargetTabs`): `sistema` (o padrão; `SiteIdentityForm`, contra
// `PUT /api/configuration`: o que se vê em `/`, no login e no painel dele, e a base de quem não definiu a
// própria) ou `pagina` (o espaço dele); qualquer outro valor cai no padrão. A API é quem recusa o usuário
// comum que tente o alvo do sistema (403): aqui ele nunca o vê.
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { SiteIdentityForm } from "@/components/admin/SiteIdentityForm";
import { getAppearance, getConfiguration } from "@/lib/db";
import { notFound } from "next/navigation";
import { appearanceInitial, configurationInitial, systemReference } from "../_lib/forms";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Aparência",
  robots: { index: false, follow: false },
};

export default async function AppearancePage({ searchParams }) {
  const { alvo } = await searchParams;
  const { user } = await requireSession({ path: alvo === "pagina" ? "/admin/aparencia?alvo=pagina" : "/admin/aparencia" });
  const isAdmin = user.role === "admin";
  const target = isAdmin && alvo !== "pagina" ? "sistema" : "pagina";
  const configuration = await getConfiguration();

  if (target === "sistema") {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">Aparência do sistema</h1>
        <AppearanceTargetTabs role={user.role} active={target} />
        <SiteIdentityForm key={target} initial={configurationInitial(configuration)} />
      </div>
    );
  }

  const appearance = await getAppearance(user.id);
  if (!appearance) notFound();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Aparência do seu espaço</h1>
      <AppearanceTargetTabs role={user.role} active={target} />
      <AppearanceForm key={target} initial={appearanceInitial(appearance)} system={systemReference(configuration)} />
    </div>
  );
}
