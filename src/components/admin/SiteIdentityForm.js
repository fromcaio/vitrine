// Identidade visual do SISTEMA (D-41; RF18, RF19, RF24, RF35, M18, M23, A-027, A-028): nome, descrição,
// logotipo e favicon (envio de imagem), a barra superior (`showLogo`, `showName`), o par de ícones do
// botão de modo e as duas paletas, com pré-visualização nos dois modos, e, depois, o rodapé do site
// (outro formulário, com gravação própria). É o alvo "sistema" de `/admin/aparencia` (só o administrador; a
// página é do Core). Envia `PUT /api/configuration`. O texto do portal e o diretório são do
// `PortalSettingsForm`. Invólucro do `SiteAppearanceForm`, que o compartilha com o `AppearanceForm`.
import { FooterLinksSection } from "./FooterLinksSection";
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a configuração como `GET
 *   /api/configuration` a devolve (`data`): os campos da identidade, `showLogo`, `showName` e
 *   `modeIconPair`; os demais são ignorados
 * @param {{ logoUrl?: string | null, faviconUrl?: string | null } | null} [props.media] o logotipo e o
 *   favicon do site (`/media/<id>` ou nulos); sem a prop, a seção de envio de imagens não aparece
 * @param {{ icon: string, url: string }[] | null} [props.footerLinks] o rodapé do site, na ordem
 *   (`GET /api/configuration/footer-links`); sem a prop, a seção do rodapé não aparece
 * @param {{ logo?: import("@/components/ui/image-client").ImageClient, favicon?: import("@/components/ui/image-client").ImageClient, footer?: import("./footer-client").FooterClient }} [props.clients]
 *   os clientes de envio (os testes os simulam); o padrão fala com a API do sistema
 * @param {"h2" | "h3"} [props.footerHeading] o nível do título da seção do rodapé (padrão `h2`; `h3` quando o
 *   formulário já está sob um `h2`, como no `ConfigurationForm`)
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido (o formulário já chama `router.refresh()` por conta própria)
 */
export function SiteIdentityForm({ initial, media = null, footerLinks = null, clients = {}, footerHeading, onSaved }) {
  return (
    <div className="flex flex-col gap-8">
      <SiteAppearanceForm kind="site" initial={initial} media={media} clients={clients} onSaved={onSaved} />
      {footerLinks ? <FooterLinksSection links={footerLinks} scope="site" client={clients.footer} heading={footerHeading} /> : null}
    </div>
  );
}
