// Índice dos mapas do site, no portal, `/sitemap.xml` (RF25, RN28): o mapa de cada espaço do diretório
// (ativo, com ao menos uma raiz publicada), e nenhum quando o administrador desliga o diretório
// (`directoryEnabled`): o espaço continua público, mas o portal não o anuncia. Dinâmico e pela guarda do
// `next build` (ADR-021): sem configuração (build, ou banco fora do ar), o índice sai vazio.
import { listPublicSpaces } from "@/lib/db";
import { publicBaseUrl } from "@/lib/seo";
import { getSiteConfiguration } from "../_lib/site";
import { sitemapIndexXml } from "../_lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = await getSiteConfiguration();
  const spaces = configuration?.directoryEnabled ? await listPublicSpaces() : [];

  const xml = sitemapIndexXml({ base: publicBaseUrl(), handles: spaces.map(({ handle }) => handle) });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
