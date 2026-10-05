// Formulário da configuração do site (RF18, RF19, RF30, RN28; M18): a mesma identidade, links e
// paletas da aparência, para o portal, o login e o painel, mais o texto do portal em Markdown e o
// diretório de espaços. Só o administrador o usa (a página é do Core). Envia `PUT
// /api/configuration`. Invólucro do `SiteAppearanceForm`, que o compartilha com o `AppearanceForm`.
import { SiteAppearanceForm } from "./SiteAppearanceForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a configuração como `GET
 *   /api/configuration` a devolve (`data`): os mesmos campos da aparência, mais `homeBody` e
 *   `directoryEnabled`
 * @param {number} [props.maxBodyBytes] limite do texto do portal em bytes (RN25), o que o Core lê de
 *   `MAX_BODY_BYTES`; o padrão é o de `DEFAULT_MAX_BODY_BYTES` (256 KiB)
 */
export function ConfigurationForm({ initial, maxBodyBytes }) {
  return <SiteAppearanceForm kind="configuration" initial={initial} maxBodyBytes={maxBodyBytes} />;
}
