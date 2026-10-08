"use client";

// Configurações do PORTAL (RF30, RN25, RN28, D-38; M18, A-027): o texto da página inicial em Markdown
// (com pré-visualização), o interruptor do diretório de espaços e o título dele (1 a 40 caracteres,
// padrão "Espaços"). É a página `/admin/configuracoes` (só o administrador; a página é do Core).
// Envia `PUT /api/configuration`. O envio é parcial e, depois de gravar, o formulário chama
// `router.refresh()`. A aparência do sistema é do `SiteIdentityForm`.
import { useState } from "react";
import { Preview } from "@/components/editor/Preview";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon } from "@/components/ui/icons";
import { bodyBytes, DEFAULT_MAX_BODY_BYTES } from "@/lib/limits";
import { DIRECTORY_TITLE_MAX, bodyTooLong } from "./appearance-model";
import { SiteFormFooter } from "./SiteFormFooter";
import { useSiteForm } from "./useSiteForm";

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * @param {object} props
 * @param {import("./appearance-model").SiteRecord} props.initial a configuração como `GET
 *   /api/configuration` a devolve (`data`): `homeBody`, `directoryEnabled` e `directoryTitle`
 * @param {number} [props.maxBodyBytes] limite do texto do portal em bytes (RN25), o que o Core lê de
 *   `MAX_BODY_BYTES`; o padrão é o de `DEFAULT_MAX_BODY_BYTES` (64 KiB desde a ADR-033)
 * @param {(data: import("./appearance-model").SiteRecord) => void} [props.onSaved] chamado depois de
 *   um salvamento bem-sucedido
 */
export function PortalSettingsForm({ initial, maxBodyBytes = DEFAULT_MAX_BODY_BYTES, onSaved }) {
  const form = useSiteForm({ kind: "portal", initial, maxBodyBytes, onSaved, fieldOrder: ["homeBody", "directoryTitle"] });
  const { idOf, draft, errors, setField, saved } = form;
  const [showBody, setShowBody] = useState(false);

  const bytes = bodyBytes(String(draft.homeBody).trim());
  const titleLength = [...String(draft.directoryTitle).trim()].length;
  const savedNotice = saved ? `Portal salvo às ${time.format(new Date(saved.at))}.` : "";

  return (
    <form onSubmit={form.submit} noValidate aria-busy={form.pending} className="flex flex-col gap-6">
      <fieldset className="flex min-w-0 flex-col gap-4 rounded-md border border-border p-4">
        <legend className="px-2 text-base font-semibold">Portal</legend>
        <Field
          id={idOf("homeBody")}
          label="Texto do portal (Markdown)"
          hint={`Aparece na página inicial, acima do diretório. ${bytes} de ${maxBodyBytes} bytes.`}
          error={errors.homeBody}
        >
          <textarea
            id={idOf("homeBody")}
            rows={10}
            value={String(draft.homeBody)}
            onChange={(event) => setField("homeBody", event.target.value)}
            aria-invalid={errors.homeBody || bytes > maxBodyBytes ? "true" : undefined}
            aria-describedby={describedBy(idOf("homeBody"), { hint: true, error: errors.homeBody })}
            className={`${INPUT} font-mono leading-relaxed`}
          />
        </Field>
        {bytes > maxBodyBytes && !errors.homeBody ? (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {bodyTooLong(bytes, maxBodyBytes)}
          </p>
        ) : null}
        <div>
          <Button variant="outline" aria-pressed={showBody} onClick={() => setShowBody((current) => !current)}>
            {showBody ? "Esconder a pré-visualização do texto" : "Pré-visualizar o texto do portal"}
          </Button>
        </div>
        {showBody ? <Preview markdown={String(draft.homeBody)} className="max-h-96" /> : null}
        <div className="flex items-start gap-2">
          <input
            id={idOf("directoryEnabled")}
            type="checkbox"
            checked={draft.directoryEnabled !== false}
            onChange={(event) => setField("directoryEnabled", event.target.checked)}
            aria-describedby={`${idOf("directoryEnabled")}-hint`}
            className="mt-1 size-5 shrink-0 cursor-pointer"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={idOf("directoryEnabled")} className="text-sm font-medium">
              Mostrar o diretório de espaços no portal
            </label>
            <p id={`${idOf("directoryEnabled")}-hint`} className="text-sm text-muted">
              Lista os espaços públicos de usuários ativos que já publicaram algo (RN28).
            </p>
          </div>
        </div>
        <Field
          id={idOf("directoryTitle")}
          label="Título do diretório"
          hint={`O título da lista de espaços no portal. De 1 a ${DIRECTORY_TITLE_MAX} caracteres (${titleLength} de ${DIRECTORY_TITLE_MAX}).`}
          error={errors.directoryTitle}
        >
          <input
            id={idOf("directoryTitle")}
            type="text"
            autoComplete="off"
            required
            value={String(draft.directoryTitle)}
            onChange={(event) => setField("directoryTitle", event.target.value)}
            aria-invalid={errors.directoryTitle ? "true" : undefined}
            aria-describedby={describedBy(idOf("directoryTitle"), { hint: true, error: errors.directoryTitle })}
            className={INPUT}
          />
        </Field>
      </fieldset>

      <SiteFormFooter
        general={form.general}
        nothing={form.nothing}
        savedNotice={savedNotice}
        dirty={form.dirty}
        pending={form.pending}
        submitLabel="Salvar o portal"
      />
    </form>
  );
}
