// Portal `/` (RF30, RN28; CT46): o texto do administrador (`homeBody`, Markdown) e, com o diretório
// ligado, os espaços ativos com ao menos uma raiz publicada, em ordem alfabética. Estático com ISR: o
// `PUT /api/configuration` e as mudanças de espaço que alteram o diretório o revalidam por
// `revalidatePath("/")` (ADR-030). A configuração e o diretório passam pela guarda do `next build`
// (ADR-021): no build, valem os padrões e nenhuma consulta é feita.
import { PortalHome } from "@/components/layout/PortalHome";
import { SpaceLayout } from "@/components/layout/SpaceLayout";
import { listPublicSpaces } from "@/lib/db";
import { buildThemeStyle, getSiteConfiguration, siteNameOf } from "../_lib/site";

export const revalidate = 3600;

export default async function PortalPage() {
  const configuration = await getSiteConfiguration();
  const name = siteNameOf(configuration);
  // Sem configuração (build, ou o banco fora do ar), nem o diretório é consultado.
  const spaces = configuration?.directoryEnabled ? await listPublicSpaces() : null;

  return (
    <SpaceLayout
      themeStyle={buildThemeStyle(configuration)}
      name={name}
      homeHref="/"
      logoUrl={configuration?.logoUrl ?? null}
      socialLinks={configuration}
    >
      <PortalHome title={name} body={configuration?.homeBody ?? null} spaces={spaces} />
    </SpaceLayout>
  );
}
