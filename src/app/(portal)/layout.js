// Layout do portal `/` (ADR-030, ADR-024): lê a configuração do site, pela guarda de
// `getSiteConfiguration` (que não consulta o banco no `next build`), e a aplica no envoltório
// `.vitrine-tema`; define o título e a descrição do site. O grupo `(portal)` não entra na URL: existe
// para que só `/` tenha este layout.
import { SiteTheme } from "../_lib/site-theme";
import { getSiteConfiguration, siteMetadata } from "../_lib/site";

export async function generateMetadata() {
  return siteMetadata(await getSiteConfiguration());
}

export default async function PortalLayout({ children }) {
  return <SiteTheme configuration={await getSiteConfiguration()}>{children}</SiteTheme>;
}
