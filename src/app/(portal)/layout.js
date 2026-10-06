// Layout do portal `/` (ADR-030, ADR-024): define o título e a descrição do SITE, lidos da configuração
// pela guarda de `getSiteConfiguration` (que não consulta o banco no `next build`). A aparência do site
// (as paletas) é aplicada pela página, no `SpaceLayout`. O grupo `(portal)` não entra na URL: existe
// para que só `/` tenha este layout.
import { portalMetadata } from "../_lib/metadata";
import { getSiteConfiguration, siteMetadata } from "../_lib/site";

export async function generateMetadata() {
  return portalMetadata(siteMetadata(await getSiteConfiguration()));
}

export default function PortalLayout({ children }) {
  return children;
}
