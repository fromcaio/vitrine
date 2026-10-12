// Página inicial (RF42, UC23, RN35, RN36, RN38, ADR-040; CT77, CT78): o texto em Markdown, o estado e as opções da
// página `/{handle}` do próprio usuário, ou da página `/` (o portal) quando quem edita é o administrador. Todos os
// papéis entram; a página usa `requireSession` e nunca lê um identificador da URL, de modo que não há como pedir a
// página de outro usuário (a moderação do texto alheio é da árvore do conteúdo dele, com motivo). O
// ADMINISTRADOR escolhe o alvo por `?alvo=` (`AppearanceTargetTabs`, com os rótulos da página inicial): `sistema`
// (o padrão; `PUT /api/configuration`: o texto do portal, o estado, o diretório de espaços e o título dele) ou
// `pagina` (o espaço dele; `PUT /api/home`). O USUÁRIO COMUM só tem o alvo `pagina`, sem seletor: `?alvo=sistema`
// responde 404 (a API também recusa, 403). Substitui `/admin/configuracoes`, que redireciona (308).
import { notFound } from "next/navigation";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { HomeEditor } from "@/components/admin/HomeEditor";
import { getConfiguration, getHome } from "@/lib/db";
import { currentLimits } from "../../api/_lib/limits";
import { publicSpaceBase } from "../_lib/editor";
import { requireSession } from "../_lib/session";

export const metadata = {
  title: "Página inicial",
  robots: { index: false, follow: false },
};

/** Rótulos do seletor do alvo: o mesmo componente da aparência, com os nomes da página inicial. */
const TAB_LABELS = Object.freeze({
  nav: "Página inicial a editar",
  system: "Página inicial do sistema",
  page: "Minha página inicial",
});

export default async function HomePage({ searchParams }) {
  const { alvo } = await searchParams;
  const asked = typeof alvo === "string" ? alvo : "";
  const { user } = await requireSession({ path: asked ? `/admin/pagina-inicial?alvo=${encodeURIComponent(asked)}` : "/admin/pagina-inicial" });
  const isAdmin = user.role === "admin";
  if (!isAdmin && asked === "sistema") notFound();
  const target = isAdmin && asked !== "pagina" ? "sistema" : "pagina";
  const maxBodyBytes = currentLimits().maxBodyBytes;

  if (target === "sistema") {
    const { homeBody, homeStatus, directoryEnabled, directoryTitle } = await getConfiguration();
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">Página inicial do sistema</h1>
        <AppearanceTargetTabs role={user.role} active={target} labels={TAB_LABELS} />
        <HomeEditor
          key={target}
          target={target}
          userId={user.id}
          initial={{ homeBody, homeStatus, directoryEnabled, directoryTitle }}
          publicHref="/"
          maxBodyBytes={maxBodyBytes}
        />
      </div>
    );
  }

  const [home, publicHref] = await Promise.all([getHome(user.id), publicSpaceBase(user.id)]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{isAdmin ? "Página inicial do seu espaço" : "Página inicial"}</h1>
      <AppearanceTargetTabs role={user.role} active={target} labels={TAB_LABELS} />
      <HomeEditor
        key={target}
        target={target}
        userId={user.id}
        initial={home}
        publicHref={publicHref}
        maxBodyBytes={maxBodyBytes}
      />
    </div>
  );
}
