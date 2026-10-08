// Formulário da configuração do site (RF18, RF19, RF30, RN28, D-41; M18, A-027): as DUAS partes, uma
// sobre a outra, cada uma com o seu envio: a identidade visual do sistema (`SiteIdentityForm`) e o
// portal (`PortalSettingsForm`). A página `/admin/configuracoes` atual (do Core) monta este
// componente e continua a editar tudo; a A-031 monta as duas partes separadamente (a identidade como
// o alvo "sistema" de `/admin/aparencia`, e o portal em `/admin/configuracoes`). Cada parte chama
// `router.refresh()` depois de gravar.
import { PortalSettingsForm } from "./PortalSettingsForm";
import { SiteIdentityForm } from "./SiteIdentityForm";

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a configuração como `GET
 *   /api/configuration` a devolve (`data`): os campos da identidade, `homeBody`, `directoryEnabled`
 *   e `directoryTitle`
 * @param {number} [props.maxBodyBytes] limite do texto do portal em bytes (RN25), o que o Core lê de
 *   `MAX_BODY_BYTES`; o padrão é o de `DEFAULT_MAX_BODY_BYTES` (64 KiB desde a ADR-033)
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido de qualquer das duas partes
 */
export function ConfigurationForm({ initial, maxBodyBytes, onSaved }) {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="configuracao-identidade" className="flex flex-col gap-4">
        <h2 id="configuracao-identidade" className="text-xl font-semibold">
          Aparência do sistema
        </h2>
        <SiteIdentityForm initial={initial} onSaved={onSaved} />
      </section>
      <section aria-labelledby="configuracao-portal" className="flex flex-col gap-4">
        <h2 id="configuracao-portal" className="text-xl font-semibold">
          Portal
        </h2>
        <PortalSettingsForm initial={initial} maxBodyBytes={maxBodyBytes} onSaved={onSaved} />
      </section>
    </div>
  );
}
