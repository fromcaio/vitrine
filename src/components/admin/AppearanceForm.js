// Formulário da aparência do próprio usuário (RF31, RF18, RF19, RF24, UC11, D-40; M18, A-027):
// identidade, a barra superior, links sociais e as duas paletas, com pré-visualização nos dois modos e
// aviso de contraste por modo. A paleta de cada modo é ANULÁVEL (nulo = herda a do sistema): o botão
// "Usar a aparência do sistema" a anula, a paleta do sistema aparece como referência (`system`, só
// leitura) e a pré-visualização mostra a efetiva. Envia `PUT /api/appearance`. Invólucro do
// `SiteAppearanceForm`, que o compartilha com o `SiteIdentityForm`.
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a aparência do usuário como
 *   `GET /api/appearance` a devolve (`data`): `siteName`, `siteDescription`, `logoUrl`, `faviconUrl`,
 *   os seis `*Url` sociais, `showLogo`, `showName` e as seis cores (`primaryColor`… e
 *   `darkPrimaryColor`…); `siteName` e as cores podem ser `null` (herdam o sistema); os demais campos
 *   são ignorados
 * @param {import("./appearance-model").SiteRecord | null} [props.system] a configuração do SISTEMA, só
 *   para leitura: `siteName` e as seis cores, que o formulário mostra como referência da herança
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido (o formulário já chama `router.refresh()` por conta própria)
 */
export function AppearanceForm({ initial, system = null, onSaved }) {
  return <SiteAppearanceForm kind="appearance" initial={initial} system={system} onSaved={onSaved} />;
}
