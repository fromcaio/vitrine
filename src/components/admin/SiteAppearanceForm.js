"use client";

// Formulário compartilhado de aparência: a página do PRÓPRIO usuário (`kind="appearance"`) e a
// identidade visual do SISTEMA (`kind="site"`): identidade, a barra superior (`showLogo`, `showName`;
// D-34), o logotipo e o favicon (envio de imagem, `ImageUpload`; RF35), o par de ícones do botão de modo
// (só no sistema; D-35), as duas paletas com pré-visualização nos dois modos e avisos de contraste por
// modo (RN09, RN27). O rodapé (`FooterLinksEditor`, RN17) é outro formulário, irmão deste: os dois têm
// gravação própria. O texto do portal e o diretório são do `PortalSettingsForm`. `AppearanceForm` e `SiteIdentityForm` são
// invólucros finos deste componente: o que diferencia os dois é só o endereço da API, as mensagens do
// 403 e a HERANÇA.
//
// Herança (D-40, D-41): na aparência do usuário, a paleta de cada modo é ANULÁVEL (nulo = herda a do
// sistema). O botão "Usar a aparência do sistema" anula a paleta do modo; a paleta do sistema aparece
// como referência, só leitura, e a pré-visualização mostra a EFETIVA. O nome também herda quando vazio.
//
// Não lê o banco nem a sessão: recebe o registro inicial já resolvido e envia por `fetch` (veja
// `useSiteForm`). O envio é PARCIAL: só o que mudou. Em qualquer erro, o rascunho fica na tela. A
// validação do servidor é a autoridade (RF21): a daqui só avisa antes. Os avisos de contraste são
// calculados no navegador enquanto o autor edita (não bloqueiam) e, depois de gravar, mostra-se também
// o que o servidor devolveu (que ele grava como notificação do dono). Depois de salvar, o
// `router.refresh()` atualiza o layout do painel, que persiste entre as navegações.
//
// O logotipo e o favicon NÃO fazem parte do rascunho nem do `PUT` de texto: cada um é enviado na hora, por
// `PUT /api/appearance/logo|favicon` (a página do usuário) ou `/api/configuration/logo|favicon` (o
// sistema), e a pré-visualização passa a mostrar o `/media/<id>` devolvido. Sem a prop `media`, a seção
// não aparece.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ColorField } from "@/components/ui/ColorField";
import { Field, describedBy } from "@/components/ui/Field";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { IMAGE_ENDPOINTS, createImageClient } from "@/components/ui/image-client";
import { isMediaUrl } from "@/components/ui/image-model";
import { DefaultLogo } from "@/components/layout/DefaultLogo";
import { DEFAULT_PALETTES } from "@/lib/theme";
import { ContrastNotices } from "./ContrastNotices";
import { ModeIconPairField } from "./ModeIconPairField";
import { PalettePreview } from "./PalettePreview";
import { SiteFormFooter } from "./SiteFormFooter";
import {
  INHERIT_FLAG,
  MESSAGES,
  PALETTE_FIELDS,
  draftOf,
  groupWarnings,
  inheritPalette,
  previewStyle,
  warningsByMode,
} from "./appearance-model";
import { useSiteForm } from "./useSiteForm";

/** @typedef {import("./appearance-model").Draft} Draft */
/** @typedef {import("./appearance-model").SiteRecord} SiteRecord */
/** @typedef {import("./appearance-model").FormKind} FormKind */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const FIELDSET = "flex min-w-0 flex-col gap-4 rounded-md border border-border p-4";
const LEGEND = "px-2 text-base font-semibold";
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const LABELS = /** @type {const} */ ({
  appearance: { saved: "Aparência salva", submit: "Salvar a aparência", name: "Nome do espaço" },
  site: { saved: "Aparência do sistema salva", submit: "Salvar a aparência do sistema", name: "Nome do site" },
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

/** Os campos de cor e os interruptores de herança do rascunho, como um texto, para comparar e adiar. */
const COLOR_FIELDS = [...PALETTE_FIELDS.light, ...PALETTE_FIELDS.dark].map(({ field }) => field);
const FLAG_FIELDS = [INHERIT_FLAG.light, INHERIT_FLAG.dark];
/** @param {Draft} draft */
const colorsKey = (draft) => [...COLOR_FIELDS.map((field) => draft[field]), ...FLAG_FIELDS.map((flag) => draft[flag] === true)].join("|");
/** @param {string} key */
const draftFromKey = (key) => {
  const parts = key.split("|");
  return Object.fromEntries([...COLOR_FIELDS.map((field, index) => [field, parts[index]]), ...FLAG_FIELDS.map((flag, index) => [flag, parts[COLOR_FIELDS.length + index] === "true"])]);
};

/** A paleta do sistema, como referência: três amostras com o nome e o valor (nunca só a cor). */
function SystemSwatches({ mode, colors }) {
  return (
    <ul aria-label={`Paleta do sistema, modo ${mode === "light" ? "claro" : "noturno"}`} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {PALETTE_FIELDS[mode].map(({ field, label }) => (
        <li key={field} className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-5 rounded-sm border border-border-strong" style={{ backgroundColor: String(colors[field]) }} />
          <span>
            {label}: <span className="font-mono">{String(colors[field])}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {object} props
 * @param {"appearance" | "site"} props.kind
 * @param {SiteRecord} props.initial registro como a API o devolve (`GET`)
 * @param {SiteRecord | null} [props.system] a configuração do sistema: na aparência do usuário, a
 *   referência da herança (o nome e as seis cores); sem ela valem as paletas padrão
 * @param {{ logoUrl?: string | null, faviconUrl?: string | null } | null} [props.media] o logotipo e o favicon
 *   atuais (`/media/<id>`, ou nulos); sem a prop, a seção de envio de imagens não aparece
 * @param {{ logo?: import("@/components/ui/image-client").ImageClient, favicon?: import("@/components/ui/image-client").ImageClient }} [props.clients]
 *   os clientes de envio (os testes os simulam); o padrão fala com a API do alvo do formulário
 * @param {(data: SiteRecord) => void} [props.onSaved] chamado depois de um salvamento bem-sucedido
 *   (antes do `router.refresh()`)
 */
export function SiteAppearanceForm({ kind, initial, system = null, media = null, clients = {}, onSaved }) {
  const labels = LABELS[kind];
  const inheritable = kind === "appearance";
  const fieldOrder = ["siteName", "siteDescription", "showName", "modeIconPair", ...COLOR_FIELDS];
  const form = useSiteForm({ kind, initial, system, onSaved, fieldOrder });
  const { idOf, draft, baseline, errors, setErrors, clearErrors, setField, setDraft, setNothing, saved } = form;

  // O logotipo mostrado na pré-visualização: o que o servidor devolveu no último envio. Só `/media/<id>`.
  const target = kind === "site" ? "site" : "page";
  const [logoUrl, setLogoUrl] = useState(isMediaUrl(media?.logoUrl) ? media.logoUrl : null);
  const logoClient = clients.logo ?? createImageClient(IMAGE_ENDPOINTS[target].logo);
  const faviconClient = clients.favicon ?? createImageClient(IMAGE_ENDPOINTS[target].favicon);

  // A referência da herança: o nome e as seis cores do sistema, no formato do rascunho.
  const systemDraft = useMemo(() => draftOf(system ?? {}, "site"), [system]);
  const systemName = typeof system?.siteName === "string" && system.siteName.trim() !== "" ? system.siteName : "Vitrine";

  // Avisos locais de contraste, adiados (veja `useDebounced`).
  const debouncedColors = useDebounced(colorsKey(draft), 350);
  const localWarnings = useMemo(() => warningsByMode(draftFromKey(debouncedColors)), [debouncedColors]);
  const serverWarnings = useMemo(() => groupWarnings(saved?.warnings ?? []), [saved]);

  /** A paleta do modo passa a herdar o sistema (só no rascunho; grava quem salvar). @param {"light" | "dark"} mode */
  const inherit = (mode) => {
    setDraft((current) => inheritPalette(current, mode, systemDraft));
    clearErrors(PALETTE_FIELDS[mode].map(({ field }) => field));
    setNothing(false);
  };

  /** A paleta do modo passa a ser própria, começando pelas cores do sistema. @param {"light" | "dark"} mode */
  const customize = (mode) => {
    setField(INHERIT_FLAG[mode], false);
  };

  /** Restaura as cores de um modo para as da ADR-031 (só no rascunho; grava quem salvar). */
  const restore = (/** @type {"light" | "dark"} */ mode) => {
    setDraft((current) => ({ ...current, ...DEFAULT_PALETTES[mode] }));
    clearErrors(Object.keys(DEFAULT_PALETTES[mode]));
    setNothing(false);
  };

  /**
   * Liga ou desliga o logo ou o nome na barra. Pelo menos um fica ligado (D-34): desligar o último é
   * recusado, com a mensagem.
   * @param {"showLogo" | "showName"} field
   * @param {boolean} checked
   */
  const toggleTopbar = (field, checked) => {
    const other = field === "showLogo" ? "showName" : "showLogo";
    if (!checked && draft[other] === false) {
      setErrors((current) => ({ ...current, showName: MESSAGES.topbar }));
      return;
    }
    clearErrors(["showLogo", "showName"]);
    setField(field, checked);
  };

  // Pré-visualização: o que está sendo editado; uma cor ainda inválida cai para a gravada.
  const style = previewStyle(draft, baseline);
  const previewName = String(draft.siteName).trim() || (inheritable ? systemName : String(baseline.siteName));
  const savedNotice = saved
    ? `${labels.saved} às ${time.format(new Date(saved.at))}.${
        saved.warnings.length > 0 ? " O servidor avisou sobre o contraste (abaixo) e registrou o aviso nas suas notificações." : ""
      }`
    : "";

  return (
    <form onSubmit={form.submit} noValidate aria-busy={form.pending} className="flex flex-col gap-6">
      <fieldset className={FIELDSET}>
        <legend className={LEGEND}>Identidade</legend>
        <Field
          id={idOf("siteName")}
          label={labels.name}
          hint={inheritable ? `Vazio: usa o nome do sistema (${systemName}).` : undefined}
          error={errors.siteName}
        >
          <input
            id={idOf("siteName")}
            type="text"
            autoComplete="off"
            required={!inheritable}
            placeholder={inheritable ? systemName : undefined}
            value={String(draft.siteName)}
            onChange={(event) => setField("siteName", event.target.value)}
            aria-invalid={errors.siteName ? "true" : undefined}
            aria-describedby={describedBy(idOf("siteName"), { hint: inheritable, error: errors.siteName })}
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
            value={String(draft.siteDescription)}
            onChange={(event) => setField("siteDescription", event.target.value)}
            aria-invalid={errors.siteDescription ? "true" : undefined}
            aria-describedby={describedBy(idOf("siteDescription"), { hint: true, error: errors.siteDescription })}
            className={INPUT}
          />
        </Field>
        {media ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ImageUpload
              label="Logotipo"
              kind="logo"
              currentUrl={logoUrl}
              client={logoClient}
              onChange={setLogoUrl}
              fallback={<DefaultLogo className="size-10" />}
              hint={inheritable ? "Sem imagem, vale a do sistema." : "Sem imagem, vale o logotipo padrão."}
            />
            <ImageUpload
              label="Favicon"
              kind="favicon"
              currentUrl={isMediaUrl(media.faviconUrl) ? media.faviconUrl : null}
              client={faviconClient}
              hint={inheritable ? "Sem imagem, vale o do sistema." : "Sem imagem, vale o favicon padrão."}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className={FIELDSET} aria-describedby={errors.showName ? idOf("showName-error") : undefined}>
        <legend className={LEGEND}>Barra superior</legend>
        <p className="text-sm text-muted">
          O que aparece no canto da barra: o logotipo, o nome ou os dois (o logotipo vem antes do nome). Sem imagem enviada, vale o logotipo padrão. Pelo menos um fica ligado.
        </p>
        {/** @type {const} */ ([
          { field: "showLogo", label: "Mostrar o logotipo" },
          { field: "showName", label: "Mostrar o nome" },
        ]).map(({ field, label }) => (
          <div key={field} className="flex items-center gap-2">
            <input
              id={idOf(field)}
              type="checkbox"
              checked={draft[field] !== false}
              onChange={(event) => toggleTopbar(field, event.target.checked)}
              aria-invalid={field === "showName" && errors.showName ? "true" : undefined}
              className="size-5 shrink-0 cursor-pointer"
            />
            <label htmlFor={idOf(field)} className="text-sm font-medium">
              {label}
            </label>
          </div>
        ))}
        {errors.showName || errors.showLogo ? (
          <p id={idOf("showName-error")} role="alert" className="text-sm font-medium text-danger">
            <span className="sr-only">Erro: </span>
            {errors.showName || errors.showLogo}
          </p>
        ) : null}
        {kind === "site" ? (
          <ModeIconPairField
            id={idOf("modeIconPair")}
            value={String(draft.modeIconPair)}
            onChange={(value) => setField("modeIconPair", value)}
            error={errors.modeIconPair}
          />
        ) : null}
      </fieldset>

      <div className="grid gap-6 xl:grid-cols-2">
        {/** @type {const} */ (["light", "dark"]).map((mode) => {
          const light = mode === "light";
          const inherited = inheritable && draft[INHERIT_FLAG[mode]] === true;
          return (
            <fieldset key={mode} className={FIELDSET}>
              <legend className={LEGEND}>{light ? "Paleta clara" : "Paleta noturna"}</legend>
              {inherited ? (
                <>
                  <p className="text-sm">Este modo usa a paleta do sistema. Ela muda quando o administrador a altera.</p>
                  <SystemSwatches mode={mode} colors={systemDraft} />
                  <Button variant="outline" onClick={() => customize(mode)} className="self-start">
                    Definir uma paleta {light ? "clara" : "noturna"} própria
                  </Button>
                </>
              ) : (
                <>
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
                        value={String(draft[field])}
                        onChange={(value) => setField(field, value)}
                        error={errors[field]}
                      />
                    ))}
                  </div>
                  {inheritable ? (
                    <>
                      <p className="text-sm text-muted">Referência: a paleta do sistema.</p>
                      <SystemSwatches mode={mode} colors={systemDraft} />
                      <Button variant="outline" onClick={() => inherit(mode)} className="self-start">
                        Usar a aparência do sistema ({light ? "paleta clara" : "paleta noturna"})
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => restore(mode)} className="self-start">
                      Restaurar a paleta {light ? "clara" : "noturna"} padrão
                    </Button>
                  )}
                  <ContrastNotices id={idOf(`aviso-${mode}`)} heading="Contraste nesta tela" warnings={localWarnings[mode]} />
                  {saved ? (
                    <ContrastNotices
                      id={idOf(`servidor-${mode}`)}
                      heading="Contraste na última gravação (servidor)"
                      warnings={serverWarnings[mode]}
                      okText="O servidor não encontrou problemas de contraste."
                    />
                  ) : null}
                </>
              )}
            </fieldset>
          );
        })}
      </div>

      <section aria-labelledby={idOf("previa")} className="flex flex-col gap-3">
        <h2 id={idOf("previa")} className="text-base font-semibold">
          Pré-visualização
        </h2>
        <p className="text-sm text-muted">
          Como o espaço fica nos dois modos, com o que está nesta tela (ainda não gravado){inheritable ? ", já com a paleta do sistema nos modos que a herdam" : ""}.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {/** @type {const} */ (["light", "dark"]).map((mode) => (
            <PalettePreview
              key={mode}
              mode={mode}
              id={idOf(mode === "light" ? "claro" : "noturno")}
              name={previewName}
              logoUrl={logoUrl}
              showLogo={draft.showLogo !== false}
              showName={draft.showName !== false}
              themeStyle={style}
            />
          ))}
        </div>
      </section>

      <SiteFormFooter
        general={form.general}
        nothing={form.nothing}
        savedNotice={savedNotice}
        dirty={form.dirty}
        pending={form.pending}
        submitLabel={labels.submit}
      />
    </form>
  );
}
