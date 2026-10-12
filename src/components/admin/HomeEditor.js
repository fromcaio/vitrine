"use client";

// Editor da PÁGINA INICIAL (M26; RF42, RF44, RN35, RN36, RN38; UC23; ADR-040): o texto em Markdown da página `/` (o
// sistema, só o administrador) ou da página `/{handle}` (a do próprio usuário), com a mesma interface do editor de
// conteúdo (a barra de ferramentas, o texto e a pré-visualização lado a lado, na mesma altura), o estado
// (Publicado ou Rascunho), as opções (o diretório de espaços e o título dele, ou a lista de coleções e documentos) e o
// link "Ver página pública". Substitui o texto do `PortalSettingsForm`. NÃO usa o `Editor` do documento: não há
// título, endereço nem versão aqui (o último envio vale).
//
// Envia só os campos que mudaram (`PUT /api/configuration` ou `PUT /api/home`; `home-client.js`) e, depois de
// gravar, chama `router.refresh()` (como os outros formulários: o painel persiste entre as navegações). O servidor é
// a autoridade (RF21): a validação daqui só avisa antes. Em qualquer erro o texto digitado fica na tela, e o texto é
// guardado também no navegador (`draft.js`, chave `${userId}:inicio:${target}`), onde a próxima abertura o oferece
// de volta. Todo texto do usuário é escapado; só tokens de tema.
//
// O rascunho local é lido DEPOIS de montar (num efeito), para o HTML do servidor e o do primeiro desenho do cliente
// serem iguais.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Preview } from "@/components/editor/Preview";
import { Toolbar } from "@/components/editor/Toolbar";
import { autosaveDraft, draftStorageKey, readDraft, removeDraft, resumeAutosave, writeDraft } from "@/components/editor/draft";
import { applyFormat, diffRange, findInsecureImages } from "@/components/editor/format";
import { PANE_HEIGHT, VIEW_LINK } from "@/components/editor/pane";
import { useMediaQuery } from "@/components/editor/useMediaQuery";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { siteRelative } from "@/components/ui/site-path";
import { bodyBytes, DEFAULT_MAX_BODY_BYTES } from "@/lib/limits";
import { DEFAULT_DIRECTORY_TITLE, DIRECTORY_TITLE_MAX, MESSAGES as FORM_MESSAGES } from "./appearance-model";
import { saveHome } from "./home-client";
import { StatusToggle } from "./StatusToggle";

/** @typedef {import("./home-client").HomeTarget} HomeTarget */
/** @typedef {import("./home-client").HomeRecord} HomeRecord */
/** @typedef {import("./home-client").HomeSaveResult} HomeSaveResult */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Falhas depois das quais o texto é guardado no navegador: as que o autor não resolve só corrigindo um campo. */
const KEEP_LOCALLY = new Set(["unauthenticated", "forbidden", "quota", "rate-limited", "too-complex", "busy", "server", "network"]);

/**
 * Os valores que o editor controla.
 * @typedef {{ body: string, status: "PUBLISHED" | "DRAFT", showItems: boolean, directoryEnabled: boolean, directoryTitle: string }} Values
 */

/**
 * @param {HomeRecord} record
 * @returns {Values}
 */
function valuesOf(record) {
  return {
    body: typeof record.homeBody === "string" ? record.homeBody : "",
    status: record.homeStatus === "DRAFT" ? "DRAFT" : "PUBLISHED",
    showItems: record.homeShowItems !== false,
    directoryEnabled: record.directoryEnabled !== false,
    directoryTitle:
      typeof record.directoryTitle === "string" && record.directoryTitle.trim() !== "" ? record.directoryTitle : DEFAULT_DIRECTORY_TITLE,
  };
}

/**
 * Corpo do `PUT` (parcial): só o que mudou. O texto vai aparado, e esvaziado vai como "" (o servidor o grava como
 * ausente).
 * @param {HomeTarget} target
 * @param {Values} values
 * @param {Values} base
 * @returns {Record<string, string | boolean>}
 */
export function patchOf(target, values, base) {
  /** @type {Record<string, string | boolean>} */
  const patch = {};
  if (values.body.trim() !== base.body.trim()) patch.homeBody = values.body.trim();
  if (values.status !== base.status) patch.homeStatus = values.status;
  if (target === "pagina") {
    if (values.showItems !== base.showItems) patch.homeShowItems = values.showItems;
  } else {
    if (values.directoryEnabled !== base.directoryEnabled) patch.directoryEnabled = values.directoryEnabled;
    if (values.directoryTitle.trim() !== base.directoryTitle.trim()) patch.directoryTitle = values.directoryTitle.trim();
  }
  return patch;
}

/**
 * Erros que o servidor também daria, antes de enviar (RN25, D-38).
 * @param {HomeTarget} target
 * @param {Values} values
 * @param {number} maxBodyBytes
 * @returns {{ body?: string, directoryTitle?: string }}
 */
function validate(target, values, maxBodyBytes) {
  /** @type {{ body?: string, directoryTitle?: string }} */
  const errors = {};
  const bytes = bodyBytes(values.body.trim());
  if (bytes > maxBodyBytes) errors.body = `O texto tem ${bytes} bytes; o máximo é ${maxBodyBytes} (${Math.floor(maxBodyBytes / 1024)} KiB).`;
  if (target === "sistema") {
    const length = [...values.directoryTitle.trim()].length;
    if (length < 1 || length > DIRECTORY_TITLE_MAX) errors.directoryTitle = FORM_MESSAGES.directoryTitle;
  }
  return errors;
}

/**
 * @param {object} props
 * @param {HomeTarget} props.target `"sistema"`: a página `/` (o administrador; `PUT /api/configuration`); `"pagina"`:
 *   a do próprio usuário (`PUT /api/home`)
 * @param {string} props.userId identificador do usuário da sessão; só entra na chave do rascunho local
 * @param {HomeRecord} props.initial o registro como `GET` o devolve (`data`): `homeBody`, `homeStatus` e, no
 *   alvo "pagina", `homeShowItems`; no "sistema", `directoryEnabled` e `directoryTitle`
 * @param {string | null} props.publicHref o caminho da página pública: `"/"` ou `"/{handle}"`, que o Core monta
 *   (o componente não conhece o dono); `null` (sem `handle`): sem o link "Ver página pública"
 * @param {{ save: (patch: Record<string, string | boolean>) => Promise<HomeSaveResult> }} [props.client] o envio,
 *   injetável (testes); o padrão usa `fetch` (`saveHome`)
 * @param {number} [props.maxBodyBytes] limite do texto em bytes (RN35), o que o Core lê de `MAX_BODY_BYTES`; o
 *   padrão é o de `DEFAULT_MAX_BODY_BYTES` (64 KiB)
 * @param {(data: HomeRecord) => void} [props.onSaved] chamado com o registro gravado, depois de um envio bem-sucedido
 */
export function HomeEditor({ target, userId, initial, publicHref, client = undefined, maxBodyBytes = DEFAULT_MAX_BODY_BYTES, onSaved }) {
  const router = useRouter();
  const draftKey = draftStorageKey(userId, `inicio:${target}`);
  const base = useId();
  const ids = {
    body: `${base}-texto`,
    bodyHint: `${base}-texto-hint`,
    bodyError: `${base}-texto-error`,
    statusHint: `${base}-estado-hint`,
    directoryEnabled: `${base}-diretorio`,
    directoryTitle: `${base}-diretorio-titulo`,
    showItems: `${base}-itens`,
  };

  /** O que o servidor tem hoje (o último salvo). */
  const [baseline, setBaseline] = useState(() => valuesOf(initial));
  const [values, setValues] = useState(() => valuesOf(initial));
  const [errors, setErrors] = useState(/** @type {{ body?: string, directoryTitle?: string }} */ ({}));
  const [problem, setProblem] = useState("");
  const [loginHint, setLoginHint] = useState(false);
  const [notice, setNotice] = useState(/** @type {{ kind: "saved" | "local" | "restored" | "discarded" | "nothing", at?: string } | null} */ (null));
  const [savedDraft, setSavedDraft] = useState(/** @type {import("@/components/editor/draft").Draft | null} */ (null));
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState(/** @type {"edit" | "preview"} */ ("edit"));
  const wide = useMediaQuery("(min-width: 768px)");
  const textareaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const pendingRef = useRef(false);

  const changedKeys = Object.keys(patchOf(target, values, baseline));
  const changed = changedKeys.length > 0;
  const bodyChanged = changedKeys.includes("homeBody") || changedKeys.includes("homeStatus");
  const optionsChanged = changedKeys.some((key) => key !== "homeBody" && key !== "homeStatus");
  const savedLocally = savedDraft !== null && savedDraft.values.body === values.body && savedDraft.values.status === values.status;
  // O texto e o estado têm cópia local (a gravação automática ao sair); as opções só existem nesta tela.
  const unsavedBody = bodyChanged && !savedLocally;
  const warnOnLeave = unsavedBody || optionsChanged;
  const insecureImages = findInsecureImages(values.body);

  // Ao montar: libera a gravação automática e oferece o rascunho local de uma sessão anterior (lido aqui, e não no
  // estado inicial, para o HTML do servidor e o do cliente serem iguais).
  useEffect(() => {
    resumeAutosave();
    const draft = readDraft(draftKey);
    if (!draft) return;
    if (draft.values.body.trim() === baseline.body.trim() && draft.values.status === baseline.status) {
      removeDraft(draftKey); // o mesmo que o servidor tem: nada a restaurar
      return;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- o localStorage só existe no navegador: ler depois de montar mantém o HTML do servidor igual ao do primeiro desenho */
    setValues((current) => ({ ...current, body: draft.values.body, status: draft.values.status }));
    setSavedDraft(draft);
    setNotice({ kind: "restored", at: draft.savedAt });
    /* eslint-enable react-hooks/set-state-in-effect */
    // Só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alterações que não estão em lugar nenhum além desta página: avisa antes de recarregar ou fechar.
  useEffect(() => {
    if (!warnOnLeave) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [warnOnLeave]);

  // Ao sair por uma navegação interna o componente é desmontado sem aviso: o texto que não está em lugar nenhum
  // além dele é guardado como rascunho local, e a próxima abertura o oferece. O estado mais recente fica numa ref,
  // porque a limpeza roda uma só vez.
  const leaving = useRef({ unsaved: false, key: draftKey, body: values.body, status: values.status });
  useEffect(() => {
    leaving.current = { unsaved: unsavedBody, key: draftKey, body: values.body, status: values.status };
  });
  useEffect(
    () => () => {
      const { unsaved, key, body, status } = leaving.current;
      if (unsaved) autosaveDraft(key, { values: { title: "", slug: "", body, status }, baseVersion: null });
    },
    [],
  );

  /** @param {Partial<Values>} patch */
  function change(patch) {
    setValues((current) => ({ ...current, ...patch }));
    setNotice(null);
    if (patch.body !== undefined && errors.body) setErrors((current) => ({ ...current, body: undefined }));
    if (patch.directoryTitle !== undefined && errors.directoryTitle) setErrors((current) => ({ ...current, directoryTitle: undefined }));
  }

  // ---------------------------------------------------------------------------------------------
  // Barra de ferramentas e atalhos
  // ---------------------------------------------------------------------------------------------

  /** @param {import("@/components/editor/format").FormatCommand} command */
  function runCommand(command) {
    const area = textareaRef.current;
    if (!area) return;
    const before = { value: area.value, start: area.selectionStart, end: area.selectionEnd };
    const after = applyFormat(command, before);
    const diff = diffRange(before.value, after.value);

    area.focus();
    area.setSelectionRange(diff.start, diff.end);
    // Como edição de verdade, para que Ctrl+Z desfaça o comando; onde o navegador não a oferece, grava o texto direto.
    const edit = diff.text === "" ? "delete" : "insertText";
    const edited = typeof document.execCommand === "function" && document.execCommand(edit, false, diff.text);
    if (!edited || area.value !== after.value) change({ body: after.value });
    area.setSelectionRange(after.start, after.end);
  }

  /** @param {import("react").KeyboardEvent<HTMLTextAreaElement>} event */
  function handleBodyKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const command = /** @type {Record<string, import("@/components/editor/format").FormatCommand>} */ ({ b: "bold", i: "italic", k: "link" })[key];
    if (command) {
      event.preventDefault();
      runCommand(command);
    } else if (key === "s") {
      event.preventDefault();
      saveLocally();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Rascunho local
  // ---------------------------------------------------------------------------------------------

  /** Guarda o texto atual neste navegador (Ctrl+S). Devolve se conseguiu. */
  function saveLocally() {
    const stored = writeDraft(draftKey, { values: { title: "", slug: "", body: values.body, status: values.status }, baseVersion: null });
    if (!stored) {
      setProblem("Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio). Salve a página para não perder o texto.");
      return false;
    }
    setSavedDraft(stored);
    setProblem("");
    setNotice({ kind: "local", at: stored.savedAt });
    return true;
  }

  /** Descarta o rascunho local: o texto volta ao que o servidor tem. */
  function discardLocalCopy() {
    removeDraft(draftKey);
    setSavedDraft(null);
    setValues((current) => ({ ...current, body: baseline.body, status: baseline.status }));
    setNotice({ kind: "discarded" });
  }

  // ---------------------------------------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------------------------------------

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (pendingRef.current) return;
    setProblem("");
    setLoginHint(false);

    const found = validate(target, values, maxBodyBytes);
    setErrors(found);
    if (found.body || found.directoryTitle) {
      (found.body ? textareaRef.current : document.getElementById(ids.directoryTitle))?.focus();
      return;
    }
    const patch = patchOf(target, values, baseline);
    if (Object.keys(patch).length === 0) {
      setNotice({ kind: "nothing" });
      return;
    }

    const submitted = values;
    pendingRef.current = true;
    setPending(true);
    /** @type {HomeSaveResult} */
    let result;
    try {
      result = await (client ? client.save(patch) : saveHome({ target, patch }));
    } catch {
      result = { ok: false, kind: "server", message: "Não foi possível salvar agora. Tente de novo em instantes.", fieldErrors: [] };
    }

    if (result.ok) {
      // O servidor devolve o registro gravado (texto aparado, "" como ausente): é a nova base. A tela só adota esse
      // valor se o autor não editou nada enquanto o envio estava em andamento.
      const next = valuesOf({ ...toRecord(submitted), ...result.data });
      removeDraft(draftKey);
      setSavedDraft(null);
      setBaseline(next);
      setValues((current) => (sameValues(current, submitted) ? next : current));
      setErrors({});
      setNotice({ kind: "saved", at: new Date().toISOString() });
      onSaved?.(result.data);
      // O painel persiste entre as navegações: sem isto, o que foi salvo só apareceria ao recarregar.
      router.refresh();
    } else {
      const outside = [];
      /** @type {{ body?: string, directoryTitle?: string }} */
      const fields = {};
      for (const error of result.fieldErrors) {
        if (error.field === "homeBody") fields.body ??= error.message;
        else if (error.field === "directoryTitle") fields.directoryTitle ??= error.message;
        else outside.push(error.message);
      }
      setErrors(fields);
      let message = [result.message, ...outside].join(" ");
      if (KEEP_LOCALLY.has(result.kind)) {
        const stored = writeDraft(draftKey, { values: { title: "", slug: "", body: submitted.body, status: submitted.status }, baseVersion: null });
        if (stored) setSavedDraft(stored);
        message += stored
          ? " O texto foi salvo neste navegador."
          : " Não foi possível salvá-lo neste navegador: copie o texto antes de sair desta página.";
      }
      setLoginHint(result.kind === "unauthenticated");
      setProblem(message);
      if (fields.body) textareaRef.current?.focus();
      else if (fields.directoryTitle) document.getElementById(ids.directoryTitle)?.focus();
    }
    pendingRef.current = false;
    setPending(false);
  }

  // ---------------------------------------------------------------------------------------------
  // Marcação
  // ---------------------------------------------------------------------------------------------

  const link = siteRelative(publicHref);
  const savedAsDraft = baseline.status === "DRAFT";
  const bytes = bodyBytes(values.body.trim());
  const overLimit = bytes > maxBodyBytes;

  let noticeMessage = "";
  if (notice?.kind === "saved" && notice.at) noticeMessage = `Página inicial salva às ${time.format(new Date(notice.at))}.`;
  else if (notice?.kind === "local" && notice.at) noticeMessage = `Rascunho salvo neste navegador às ${time.format(new Date(notice.at))}.`;
  else if (notice?.kind === "restored" && notice.at) noticeMessage = `Rascunho local restaurado (salvo em ${dateTime.format(new Date(notice.at))}).`;
  else if (notice?.kind === "discarded") noticeMessage = "Rascunho local descartado.";
  else if (notice?.kind === "nothing") noticeMessage = "Nenhuma alteração para salvar.";

  let stateLine = "Nenhuma alteração pendente.";
  if (changed) stateLine = savedLocally ? "Alterações ainda não salvas. Há um rascunho salvo neste navegador." : "Alterações ainda não salvas.";

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <StatusToggle status={values.status} onChange={(status) => change({ status })} describedBy={ids.statusHint} />
        <p id={ids.statusHint} className="text-sm text-muted">
          O estado só muda quando você salva. Um rascunho não aparece para os leitores: a página mostra a descrição.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Alternar entre edição e pré-visualização" className="flex gap-2 md:hidden">
          <Button variant={tab === "edit" ? "primary" : "outline"} aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>
            Editar
          </Button>
          <Button variant={tab === "preview" ? "primary" : "outline"} aria-pressed={tab === "preview"} onClick={() => setTab("preview")}>
            Pré-visualizar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
          <section aria-label="Edição" className={`${tab === "edit" ? "flex" : "hidden"} min-w-0 flex-col gap-2 md:flex`}>
            {/* O BLOCO de edição (a barra, o espaço entre eles e o texto) tem a altura do par, a mesma da pré-visualização
                (a do editor de conteúdo): a barra pode quebrar em 1, 2 ou 3 linhas e o texto (`flex-1 min-h-0`) fica com o
                que sobra. As dicas e os erros vêm DEPOIS do bloco e não entram na conta. */}
            <div className={`${PANE_HEIGHT} flex min-h-0 flex-col gap-2`}>
              <div className="shrink-0">
                <Toolbar onCommand={runCommand} controls={ids.body} />
              </div>
              <label htmlFor={ids.body} className="sr-only">
                Texto da página inicial (Markdown)
              </label>
              <textarea
                ref={textareaRef}
                id={ids.body}
                value={values.body}
                onChange={(event) => change({ body: event.target.value })}
                onKeyDown={handleBodyKeyDown}
                aria-invalid={errors.body || overLimit ? "true" : undefined}
                aria-describedby={describedBy(ids.body, { hint: true, error: errors.body })}
                className={`${INPUT} min-h-0 flex-1 resize-none font-mono leading-relaxed`}
              />
            </div>
            <p id={ids.bodyHint} className="text-sm text-muted">
              Sem texto publicado, a descrição do espaço continua aparecendo. Os títulos do texto começam em <code>h2</code> (<code>##</code>), porque o nome é
              o título da página. {bytes} de {maxBodyBytes} bytes.
            </p>
            {errors.body ? (
              <p id={ids.bodyError} role="alert" className="text-sm font-medium text-danger">
                <span className="sr-only">Erro: </span>
                {errors.body}
              </p>
            ) : null}
            {insecureImages.length > 0 ? (
              <p role="status" className="flex items-start gap-2 text-sm">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  {insecureImages.length === 1
                    ? "Uma imagem usa um endereço http://, que o navegador bloqueia por segurança."
                    : `${insecureImages.length} imagens usam endereços http://, que o navegador bloqueia por segurança.`}{" "}
                  Use https://.
                </span>
              </p>
            ) : null}
          </section>

          <section aria-label="Pré-visualização" className={`${tab === "preview" ? "block" : "hidden"} min-w-0 md:block`}>
            <Preview markdown={values.body} visible={wide || tab === "preview"} className={PANE_HEIGHT} />
          </section>
        </div>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-4 rounded-md border border-border p-4">
        <legend className="px-2 text-base font-semibold">Opções</legend>
        {target === "sistema" ? (
          <>
            <div className="flex items-start gap-2">
              <input
                id={ids.directoryEnabled}
                type="checkbox"
                checked={values.directoryEnabled}
                onChange={(event) => change({ directoryEnabled: event.target.checked })}
                aria-describedby={`${ids.directoryEnabled}-hint`}
                className="mt-1 size-5 shrink-0 cursor-pointer"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor={ids.directoryEnabled} className="text-sm font-medium">
                  Mostrar o diretório de espaços
                </label>
                <p id={`${ids.directoryEnabled}-hint`} className="text-sm text-muted">
                  Lista os espaços públicos de usuários ativos que já publicaram algo, abaixo do texto (RN28).
                </p>
              </div>
            </div>
            <Field
              id={ids.directoryTitle}
              label="Título do diretório"
              hint={`O título da lista de espaços no portal. De 1 a ${DIRECTORY_TITLE_MAX} caracteres (${[...values.directoryTitle.trim()].length} de ${DIRECTORY_TITLE_MAX}).`}
              error={errors.directoryTitle}
            >
              <input
                id={ids.directoryTitle}
                type="text"
                autoComplete="off"
                required
                value={values.directoryTitle}
                onChange={(event) => change({ directoryTitle: event.target.value })}
                aria-invalid={errors.directoryTitle ? "true" : undefined}
                aria-describedby={describedBy(ids.directoryTitle, { hint: true, error: errors.directoryTitle })}
                className={INPUT}
              />
            </Field>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <input
              id={ids.showItems}
              type="checkbox"
              checked={values.showItems}
              onChange={(event) => change({ showItems: event.target.checked })}
              aria-describedby={`${ids.showItems}-hint`}
              className="mt-1 size-5 shrink-0 cursor-pointer"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={ids.showItems} className="text-sm font-medium">
                Mostrar as coleções e os documentos
              </label>
              <p id={`${ids.showItems}-hint`} className="text-sm text-muted">
                A lista das coleções e dos documentos publicados da raiz do espaço aparece abaixo do texto (ou da descrição).
              </p>
            </div>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p role="status" className="min-h-5 font-medium">
            {noticeMessage}
          </p>
          <p className="text-muted">{stateLine}</p>
          {link !== null && savedAsDraft ? (
            <p className="text-muted">O texto está em rascunho: a página pública mostra a descrição.</p>
          ) : null}
          {link !== null && !savedAsDraft && changed ? (
            <p className="text-muted">O link da página pública abre a versão salva, sem as alterações ainda não salvas.</p>
          ) : null}
          {savedDraft ? (
            <p>
              <button type="button" onClick={discardLocalCopy} className="cursor-pointer text-muted underline underline-offset-2">
                Descartar o rascunho local
              </button>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {link !== null && !savedAsDraft ? (
            <a href={link} target="_blank" rel="noopener" className={VIEW_LINK}>
              Ver página pública<span className="sr-only"> (abre em uma nova aba)</span>
              <ExternalLinkIcon className="size-4 shrink-0" />
            </a>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <div role="alert" className="empty:hidden">
        {problem ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {problem}
              {loginHint ? (
                <>
                  {" "}
                  <a href="/login" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                    Abrir o login em outra aba
                  </a>
                  .
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Os valores como um registro da API (para completar o que o servidor não devolveu).
 * @param {Values} values
 * @returns {HomeRecord}
 */
function toRecord(values) {
  return {
    homeBody: values.body.trim() === "" ? null : values.body.trim(),
    homeStatus: values.status,
    homeShowItems: values.showItems,
    directoryEnabled: values.directoryEnabled,
    directoryTitle: values.directoryTitle.trim(),
  };
}

/**
 * @param {Values} a
 * @param {Values} b
 */
function sameValues(a, b) {
  return a.body === b.body && a.status === b.status && a.showItems === b.showItems && a.directoryEnabled === b.directoryEnabled && a.directoryTitle === b.directoryTitle;
}
