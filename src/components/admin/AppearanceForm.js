// Formulário da aparência do próprio usuário (RF31, RF18, RF19, RF24, RF35, UC11, UC20, UC21, D-40; M18,
// M23, A-027, A-028): identidade, logotipo e favicon (envio de imagem), a barra superior, as duas
// paletas, com pré-visualização nos dois modos e aviso de contraste por modo, e, depois, o rodapé de
// ícones (outro formulário, com gravação própria). A paleta de cada modo é ANULÁVEL (nulo = herda a do sistema): o botão
// "Usar a aparência do sistema" a anula, a paleta do sistema aparece como referência (`system`, só
// leitura) e a pré-visualização mostra a efetiva. Envia `PUT /api/appearance`. Invólucro do
// `SiteAppearanceForm`, que o compartilha com o `SiteIdentityForm`.
import { FooterLinksSection } from "./FooterLinksSection";
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a aparência do usuário como
 *   `GET /api/appearance` a devolve (`data`): `siteName`, `siteDescription`, `showLogo`, `showName` e as
 *   seis cores (`primaryColor`… e `darkPrimaryColor`…); `siteName` e as cores podem ser `null` (herdam o
 *   sistema); os demais campos são ignorados
 * @param {import("./appearance-model").SiteRecord | null} [props.system] a configuração do SISTEMA, só
 *   para leitura: `siteName` e as seis cores, que o formulário mostra como referência da herança
 * @param {{ logoUrl?: string | null, faviconUrl?: string | null } | null} [props.media] o logotipo e o
 *   favicon do espaço (`/media/<id>` ou nulos); sem a prop, a seção de envio de imagens não aparece
 * @param {{ icon: string, url: string }[] | null} [props.footerLinks] o rodapé do espaço, na ordem
 *   (`GET /api/footer-links`); sem a prop, a seção do rodapé não aparece
 * @param {{ logo?: import("@/components/ui/image-client").ImageClient, favicon?: import("@/components/ui/image-client").ImageClient, footer?: import("./footer-client").FooterClient }} [props.clients]
 *   os clientes de envio (os testes os simulam); o padrão fala com a API do espaço
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido (o formulário já chama `router.refresh()` por conta própria)
 */
export function AppearanceForm({ initial, system = null, media = null, footerLinks = null, clients = {}, onSaved }) {
  return (
    <div className="flex flex-col gap-8">
      <SiteAppearanceForm kind="appearance" initial={initial} system={system} media={media} clients={clients} onSaved={onSaved} />
      {footerLinks ? <FooterLinksSection links={footerLinks} scope="page" client={clients.footer} /> : null}
    </div>
  );
}
