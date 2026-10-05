// Layout do `/login` (ADR-030): a aparência do SITE, lida em execução pela guarda de
// `getSiteConfiguration`, aplicada no envoltório `.vitrine-tema`; o nome do site entra no título
// ("Entrar | nome") e na descrição.
//
// O título é completo (`absolute`) aqui, e não "Entrar" na página com o modelo do layout: o `template`
// de um `layout.js` não vale para o `title` do `page.js` do MESMO segmento (documentação do Next.js),
// e a página receberia o modelo do layout raiz ("Entrar | Vitrine").
import { SiteTheme } from "../_lib/site-theme";
import { getSiteConfiguration, siteMetadata, siteNameOf } from "../_lib/site";

export async function generateMetadata() {
  const configuration = await getSiteConfiguration();
  return { ...siteMetadata(configuration), title: { absolute: `Entrar | ${siteNameOf(configuration)}` } };
}

export default async function LoginLayout({ children }) {
  return <SiteTheme configuration={await getSiteConfiguration()}>{children}</SiteTheme>;
}
