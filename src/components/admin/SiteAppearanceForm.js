"use client";

// Formulário compartilhado de aparência (do usuário) e de configuração (do site): identidade, os
// seis links sociais (RN17), as duas paletas com pré-visualização nos dois modos e avisos de
// contraste por modo (RN09, RN27) e, na configuração, o texto do portal e o diretório (RF30, RN28).
// `AppearanceForm` e `ConfigurationForm` são invólucros finos deste componente: o que diferencia
// os dois é só o endereço da API, as mensagens do 403 e os campos do portal.
//
// Não lê o banco nem a sessão: recebe o registro inicial já resolvido e envia por `fetch` a
// `PUT /api/appearance` ou `PUT /api/configuration` (envelope `{ data, warnings }`; erros
// `{ error: { code, message, details } }`). O envio é PARCIAL: só o que mudou. Em qualquer erro, o
// rascunho fica na tela. A validação do servidor é a autoridade (RF21): a daqui só avisa antes.
// Os avisos de contraste são calculados no navegador enquanto o autor edita (não bloqueiam) e, depois
// de gravar, mostra-se também o que o servidor devolveu (que ele grava como notificação do dono).
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Preview } from "@/components/editor/Preview";
import { Button } from "@/components/ui/Button";
import { ColorField } from "@/components/ui/ColorField";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";
import { bodyBytes, DEFAULT_MAX_BODY_BYTES } from "@/lib/limits";
import { DEFAULT_PALETTES } from "@/lib/theme";
import { ContrastNotices } from "./ContrastNotices";
import { PalettePreview } from "./PalettePreview";
import {
  ASSET_FIELDS,
  MESSAGES,
  PALETTE_FIELDS,
  SOCIAL_FIELDS,
  bodyTooLong,
  changedFields,
  draftOf,
  groupWarnings,
  interpretFailure,
  patchOf,
  previewLinks,
  previewStyle,
  validateDraft,
  warningsByMode,
} from "./appearance-model";

/** @typedef {import("./appearance-model").Draft} Draft */
/** @typedef {import("./appearance-model").SiteRecord} SiteRecord */
/** @typedef {import("./appearance-model").FormKind} FormKind */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const FIELDSET = "flex min-w-0 flex-col gap-4 rounded-md border border-border p-4";
const LEGEND = "px-2 text-base font-semibold";
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const ENDPOINT = /** @type {const} */ ({ appearance: "/api/appearance", configuration: "/api/configuration" });
const LABELS = /** @type {const} */ ({
  appearance: { saved: "Aparência salva", submit: "Salvar a aparência", name: "Nome do espaço" },
  configuration: { saved: "Configuração salva", submit: "Salvar a configuração", name: "Nome do site" },
});

/**
 * Valor que só muda depois de `ms` sem novas mudanças: o aviso de contraste enquanto o autor digita
 * ou arrasta o seletor de cor não é anunciado a cada passo.
 * @param {string} value
 * @param {number} ms
 */
function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Os campos de cor do rascunho, como um texto, para comparar e adiar sem criar objetos novos. */
const COLOR_FIELDS = [...PALETTE_FIELDS.light, ...PALETTE_FIELDS.dark].map(({ field }) => field);
/** @param {Draft} draft */
const colorsKey = (draft) => COLOR_FIELDS.map((field) => draft[field]).join("|");
/** @param {string} key */
const draftFromKey = (key) => Object.fromEntries(key.split("|").map((value, index) => [COLOR_FIELDS[index], value]));

/**
 * @param {object} props
 * @param {FormKind} props.kind
 * @param {SiteRecord} props.initial registro como a API o devolve (`GET`)
 * @param {number} [props.maxBodyBytes] limite do texto do portal, em bytes (RN25); só na configuração
 */
export function SiteAppearanceForm({ kind, initial, maxBodyBytes = DEFAULT_MAX_BODY_BYTES }) {
  const base = useId();
  const labels = LABELS[kind];
  const configuration = kind === "configuration";

  const [baseline, setBaseline] = useState(() => draftOf(initial, kind));
  const [draft, setDraft] = useState(() => draftOf(initial, kind));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [general, setGeneral] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(/** @type {{ at: string, warnings: import("@/lib/theme").ContrastWarning[] } | null} */ (null));
  const [nothing, setNothing] = useState(false);
  const [showBody, setShowBody] = useState(false);

  const changed = changedFields(draft, baseline);
  const dirty = changed.length > 0;

  // Alterações que só existem nesta tela: avisa antes de recarregar ou fechar a página.
  useEffect(() => {
    if (!dirty) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Avisos locais de contraste, adiados (veja `useDebounced`).
  const debouncedColors = useDebounced(colorsKey(draft), 350);
  const localWarnings = useMemo(() => warningsByMode(draftFromKey(debouncedColors)), [debouncedColors]);
  const serverWarnings = useMemo(() => groupWarnings(saved?.warnings ?? []), [saved]);

  /** @param {string} field @returns {string} */
  const idOf = (field) => `${base}-${field}`;

  /** Altera um campo e apaga o erro dele (o autor está corrigindo). */
  const setField = (/** @type {string} */ field, /** @type {string | boolean} */ value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNothing(false);
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  };

  /** Restaura as cores de um modo para as da ADR-031 (só no rascunho; grava quem salvar). */
  const restore = (/** @type {"light" | "dark"} */ mode) => {
    setDraft((current) => ({ ...current, ...DEFAULT_PALETTES[mode] }));
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !(field in DEFAULT_PALETTES[mode]))));
    setNothing(false);
  };

  /** @param {Record<string, string>} found */
  function focusFirst(found) {
    const order = [
      "siteName", "siteDescription", ...ASSET_FIELDS.map(({ field }) => field), ...SOCIAL_FIELDS.map(({ field }) => field),
      ...COLOR_FIELDS, "homeBody",
    ];
    const first = order.find((field) => found[field]);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setGeneral("");
    setNothing(false);

    const found = validateDraft(draft, { kind, maxBodyBytes });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    const patch = patchOf(draft, baseline);
    if (Object.keys(patch).length === 0) {
      setNothing(true);
      return;
    }

    const submitted = draft;
    setPending(true);
    try {
      const response = await fetch(ENDPOINT[kind], {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        const next = draftOf(body?.data ?? {}, kind);
        // O servidor devolve o registro gravado (textos aparados, "" como ausente): é a nova base. A
        // tela só adota esse valor se o autor não editou nada enquanto o envio estava em andamento.
        setBaseline(next);
        setDraft((current) => (changedFields(current, submitted).length === 0 ? next : current));
        setErrors({});
        setSaved({ at: new Date().toISOString(), warnings: Array.isArray(body?.warnings) ? body.warnings : [] });
      } else {
        const failure = await interpretFailure(response, kind);
        setErrors(failure.fields);
        setGeneral(failure.general);
        focusFirst(failure.fields);
      }
    } catch {
      setGeneral(MESSAGES.network);
    }
    setPending(false);
  }

  // Pré-visualização: o que está sendo editado; uma cor ainda inválida cai para a gravada.
  const style = previewStyle(draft, baseline);
  const previewName = String(draft.siteName).trim() || String(baseline.siteName);
  const previewLogo = String(draft.logoUrl).trim() && !errors.logoUrl ? String(draft.logoUrl).trim() : null;
  const links = previewLinks(draft);
  const savedNotice = saved
    ? `${labels.saved} às ${time.format(new Date(saved.at))}.${
        saved.warnings.length > 0 ? " O servidor avisou sobre o contraste (abaixo) e registrou o aviso nas suas notificações." : ""
      }`
    : "";
  const bytes = configuration ? bodyBytes(String(draft.homeBody).trim()) : 0;

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-6">
      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Identidade</legend>
        <Field id={idOf("siteName")} label={labels.name} error={errors.siteName}>
          <input
            id={idOf("siteName")}
            type="text"
            autoComplete="off"
            required
            value={draft.siteName}
            onChange={(event) => setField("siteName", event.target.value)}
            aria-invalid={errors.siteName ? "true" : undefined}
            aria-describedby={describedBy(idOf("siteName"), { error: errors.siteName })}
            className={INPUT}
          />
        </Field>
        <Field
          id={idOf("siteDescription")}
          label="Descrição"
          hint="Aparece nos resultados de busca e no diretório do portal. Pode ficar vazia."
          error={errors.siteDescription}
        >
          <textarea
            id={idOf("siteDescription")}
            rows={3}
            value={draft.siteDescription}
            onChange={(event) => setField("siteDescription", event.target.value)}
            aria-invalid={errors.siteDescription ? "true" : undefined}
            aria-describedby={describedBy(idOf("siteDescription"), { hint: true, error: errors.siteDescription })}
            className={INPUT}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          {ASSET_FIELDS.map(({ field, label }) => (
            <Field
              key={field}
              id={idOf(field)}
              label={label}
              hint="URL http(s) ou caminho de um arquivo de public/, iniciado por /. Vazio: sem imagem."
              error={errors[field]}
            >
              <input
                id={idOf(field)}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={draft[field]}
                onChange={(event) => setField(field, event.target.value)}
                aria-invalid={errors[field] ? "true" : undefined}
                aria-describedby={describedBy(idOf(field), { hint: true, error: errors[field] })}
                className={INPUT}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Redes sociais</legend>
        <p className="text-sm text-muted">Só as redes com link aparecem no rodapé. Use endereços http ou https; vazio remove o ícone.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {SOCIAL_FIELDS.map(({ field, label }) => (
            <Field key={field} id={idOf(field)} label={label} error={errors[field]}>
              <input
                id={idOf(field)}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://"
                value={draft[field]}
                onChange={(event) => setField(field, event.target.value)}
                aria-invalid={errors[field] ? "true" : undefined}
                aria-describedby={describedBy(idOf(field), { error: errors[field] })}
                className={INPUT}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 xl:grid-cols-2">
        {/** @type {const} */ (["light", "dark"]).map((mode) => {
          const light = mode === "light";
          return (
            <fieldset key={mode} className={FIELDSET}>
              <legend className={LEGEND}>{light ? "Paleta clara" : "Paleta noturna"}</legend>
              <p className="text-sm text-muted">
                {light
                  ? "Verificada contra o fundo claro (#FFFFFF)."
                  : "Verificada contra o fundo noturno (#0A0A0A). Os cinzas de fundo e de texto de cada modo são fixos."}
              </p>
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                {PALETTE_FIELDS[mode].map(({ field, label }) => (
                  <ColorField
                    key={field}
                    id={idOf(field)}
                    label={label}
                    value={draft[field]}
                    onChange={(value) => setField(field, value)}
                    error={errors[field]}
                  />
                ))}
              </div>
              <Button variant="outline" onClick={() => restore(mode)} className="self-start">
                Restaurar a paleta {light ? "clara" : "noturna"} padrão
              </Button>
              <ContrastNotices id={idOf(`aviso-${mode}`)} heading="Contraste nesta tela" warnings={localWarnings[mode]} />
              {saved ? (
                <ContrastNotices
                  id={idOf(`servidor-${mode}`)}
                  heading="Contraste na última gravação (servidor)"
                  warnings={serverWarnings[mode]}
                  okText="O servidor não encontrou problemas de contraste."
                />
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <section aria-labelledby={idOf("previa")} className="flex flex-col gap-3">
        <h2 id={idOf("previa")} className="text-base font-semibold">
          Pré-visualização
        </h2>
        <p className="text-sm text-muted">Como o espaço fica nos dois modos, com o que está nesta tela (ainda não gravado).</p>
        <div className="grid gap-4 xl:grid-cols-2">
          <PalettePreview mode="light" id={idOf("claro")} name={previewName} logoUrl={previewLogo} links={links} themeStyle={style} />
          <PalettePreview mode="dark" id={idOf("noturno")} name={previewName} logoUrl={previewLogo} links={links} themeStyle={style} />
        </div>
      </section>

      {configuration ? (
        <fieldset className={FIELDSET}>
          <legend className={LEGEND}>Portal</legend>
          <Field
            id={idOf("homeBody")}
            label="Texto do portal (Markdown)"
            hint={`Aparece na página inicial, acima do diretório. ${bytes} de ${maxBodyBytes} bytes.`}
            error={errors.homeBody}
          >
            <textarea
              id={idOf("homeBody")}
              rows={10}
              value={draft.homeBody}
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
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div role="alert" className="empty:hidden">
          {general ? (
            <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {general}
                {general === MESSAGES.unauthenticated ? (
                  <>
                    {" "}
                    <Link href="/login" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                      Abrir o login em outra aba
                    </Link>
                    .
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
        </div>
        <div role="status" className="empty:hidden">
          {nothing ? (
            <p className="text-sm">{MESSAGES.nothingToSave}</p>
          ) : savedNotice && !dirty ? (
            <p className="flex items-start gap-2 text-sm font-medium">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
              {savedNotice}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : labels.submit}
          </Button>
          <p className="text-sm text-muted">{dirty ? "Há alterações ainda não gravadas." : "Nenhuma alteração pendente."}</p>
        </div>
      </div>
    </form>
  );
}
