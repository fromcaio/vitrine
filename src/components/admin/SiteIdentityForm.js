// Identidade visual do SISTEMA (D-41; RF18, RF19, M18, A-027): nome, descrição, a barra superior
// (`showLogo`, `showName`), os links sociais, o par de ícones do botão de modo e as duas paletas, com
// pré-visualização nos dois modos. É o alvo "sistema" de `/admin/aparencia` (só o administrador; a
// página é do Core). Envia `PUT /api/configuration`. O texto do portal e o diretório são do
// `PortalSettingsForm`. Invólucro do `SiteAppearanceForm`, que o compartilha com o `AppearanceForm`.
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a configuração como `GET
 *   /api/configuration` a devolve (`data`): os campos da identidade, `showLogo`, `showName` e
 *   `modeIconPair`; os demais são ignorados
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido (o formulário já chama `router.refresh()` por conta própria)
 */
export function SiteIdentityForm({ initial, onSaved }) {
  return <SiteAppearanceForm kind="site" initial={initial} onSaved={onSaved} />;
}
