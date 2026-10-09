// Configurações do site (RF30, RN25, RN28, D-41; CT23, CT24): só o administrador. Quem não é responde
// `notFound()` (a página não existe para ele, RN19), e a API responde 403 em português se alguém a chamar
// direto. A página monta o `PortalSettingsForm` da UI (o texto inicial do portal, `directoryEnabled` e
// `directoryTitle`) com a configuração do sistema e o limite de bytes do texto (RN25); o formulário envia
// `PUT /api/configuration`. A identidade visual do sistema é de `/admin/aparencia` (`?alvo=sistema`).
import { PortalSettingsForm } from "@/components/admin/PortalSettingsForm";
import { getConfiguration } from "@/lib/db";
import { currentLimits } from "../../api/_lib/limits";
import { configurationInitial } from "../_lib/forms";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Configurações do site",
  robots: { index: false, follow: false },
};

export default async function ConfigurationPage() {
  await requireSession({ role: "admin", path: "/admin/configuracoes" });
  const configuration = await getConfiguration();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Configurações do site</h1>
      <PortalSettingsForm initial={configurationInitial(configuration)} maxBodyBytes={currentLimits().maxBodyBytes} />
    </div>
  );
}
