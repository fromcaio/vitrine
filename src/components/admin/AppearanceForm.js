// Formulário da aparência do próprio usuário (RF31, RF18, RF19, RF24, UC11; M18): identidade, links
// sociais e as duas paletas, com pré-visualização nos dois modos e aviso de contraste por modo.
// Substitui o `ThemeForm` do inventário (Cap. 5 §5.11). Envia `PUT /api/appearance`. Invólucro do
// `SiteAppearanceForm`, que o compartilha com o `ConfigurationForm`.
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a aparência do usuário como
 *   `GET /api/appearance` a devolve (`data`): `siteName`, `siteDescription`, `logoUrl`, `faviconUrl`,
 *   os seis `*Url` sociais e as seis cores (`primaryColor`… e `darkPrimaryColor`…); os demais
 *   campos são ignorados
 */
export function AppearanceForm({ initial }) {
  return <SiteAppearanceForm kind="appearance" initial={initial} />;
}
