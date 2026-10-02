"use client";

// Editor de conteúdo (M09; RF05, RF08, RF09, RF15, RF16, RF26; CT19, CT20): título, slug, estado de
// publicação e texto em Markdown com fórmulas, em painel dividido (edição e pré-visualização).
// Núcleo da página de criação e edição de documentos.
//
// O componente não conhece o dono do conteúdo nem a rota da página: recebe o valor inicial e a
// ação de envio por props. O identificador do usuário só entra na chave do rascunho local, que
// é por usuário e por conteúdo (`draft.js`). O envio substitui o conteúdo vigente, sem histórico
// de versões (D-15). A validação do servidor é a autoridade (RF21): o Zod aqui só avisa antes.
//
// Lê o localStorage ao montar: use-o só no navegador (`ContentEditor` o carrega com `ssr: false`).
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { StatusToggle } from "@/components/admin/StatusToggle";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon } from "@/components/ui/icons";
import { draftStorageKey, readDraft, removeDraft, writeDraft } from "./draft";
import { applyFormat, diffRange, findInsecureImages, slugFromTitle } from "./format";
import { Preview } from "./Preview";
import { EDITOR_FIELDS, editorResolver, valuesEqual } from "./schema";
import { Toolbar } from "./Toolbar";

/** @typedef {import("./draft").EditorValues} EditorValues */
/** @typedef {import("./draft").Draft} Draft */
/** @typedef {import("./content-client").SaveResult} SaveResult */
/** @typedef {{ kind: "sent" | "local" | "restored", at: string } | { kind: "discarded" | "removed" } | null} Notice */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground " +
  "aria-invalid:border-danger";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** @param {string} iso */
const formatTime = (iso) => time.format(new Date(iso));
/** @param {string} iso */
const formatDateTime = (iso) => dateTime.format(new Date(iso));

/**
 * Só os campos que o editor altera, com o texto sempre como cadeia.
 * @param {Partial<EditorValues> & { body?: string | null }} value
 * @returns {EditorValues}
 */
function pickValues(value) {
  return {
    title: value.title ?? "",
    slug: value.slug ?? "",
    body: value.body ?? "",
    status: value.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
  };
}

/**
 * Estado inicial do formulário: os valores do servidor ou o rascunho local deste conteúdo. Um
 * rascunho feito sobre a mesma versão do servidor é restaurado; um feito sobre uma versão
 * anterior (o conteúdo mudou depois) fica à parte, para o autor decidir.
 * @param {string} draftKey
 * @param {EditorValues} server
 * @param {string | null} version
 */
function readStartup(draftKey, server, version) {
  const draft = typeof window === "undefined" ? null : readDraft(draftKey);
  if (!draft) return { values: server, restored: null, conflict: null };
  if (draft.baseVersion === version) return { values: draft.values, restored: draft, conflict: null };
  return { values: server, restored: null, conflict: draft };
}

/** @param {Notice} notice */
function noticeText(notice) {
  if (!notice) return "";
  switch (notice.kind) {
    case "sent":
      return `Nova versão enviada às ${formatTime(notice.at)}.`;
    case "local":
      return `Rascunho salvo neste navegador às ${formatTime(notice.at)}.`;
    case "restored":
      return `Rascunho local restaurado (salvo em ${formatDateTime(notice.at)}).`;
    case "discarded":
      return "Rascunho local descartado.";
    default:
      return "Cópia local removida.";
  }
}

/**
 * Resultado de um envio que falhou por um erro inesperado do próprio envio (a ação lançou).
 * @type {SaveResult}
 */
const UNEXPECTED_FAILURE = {
  ok: false,
  kind: "server",
  message: "Não foi possível enviar agora. Tente de novo em instantes.",
  fieldErrors: [],
};

/**
 * Falhas depois das quais o texto é guardado no navegador, para não se perder: as que o autor não
 * resolve só corrigindo um campo. As de validação e de slug em conflito ficam de fora, porque ele
 * as corrige na hora.
 */
const KEEP_LOCALLY = new Set(["unauthenticated", "forbidden", "not-found", "quota", "rate-limited", "server", "network"]);

/**
 * @param {object} props
 * @param {string} props.userId identificador do usuário autenticado; só entra na chave do rascunho
 * @param {string | null} props.contentId identificador do conteúdo; `null` enquanto não existe
 * @param {Partial<EditorValues> & { body?: string | null }} props.initialValue valores iniciais
 *   (do servidor, ou os padrões de um conteúdo novo)
 * @param {string | null} [props.version] versão do servidor em que `initialValue` se baseia (por
 *   exemplo, o `updatedAt`); serve para saber se um rascunho local ficou defasado
 * @param {(values: EditorValues) => Promise<SaveResult>} props.onSubmit envia a nova versão
 */
export function Editor({ userId, contentId, initialValue, version = null, onSubmit }) {
  const draftKey = draftStorageKey(userId, contentId);
  const base = useId();
  // `${id}-hint` e `${id}-error` são os identificadores que `Field` e `describedBy` esperam.
  const ids = {
    title: `${base}-titulo`,
    slug: `${base}-slug`,
    body: `${base}-texto`,
    bodyHint: `${base}-texto-hint`,
    bodyError: `${base}-texto-error`,
    statusHint: `${base}-estado-hint`,
  };

  // Lido uma vez, ao montar (só no navegador).
  const [startup] = useState(() => readStartup(draftKey, pickValues(initialValue), version));
  /** Valores que o servidor tem hoje: o que já foi enviado. */
  const [baseline, setBaseline] = useState(() => pickValues(initialValue));
  const [serverVersion, setServerVersion] = useState(version);
  /** @type {[Draft | null, (draft: Draft | null) => void]} */
  const [savedDraft, setSavedDraft] = useState(startup.restored);
  /** @type {[Draft | null, (draft: Draft | null) => void]} */
  const [conflictDraft, setConflictDraft] = useState(startup.conflict);
  /** @type {[Notice, (notice: Notice) => void]} */
  const [notice, setNotice] = useState(
    /** @type {Notice} */ (startup.restored ? { kind: "restored", at: startup.restored.savedAt } : null),
  );
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [loginHint, setLoginHint] = useState(false);
  const [slugSuggestion, setSlugSuggestion] = useState(/** @type {string | null} */ (null));
  const [tab, setTab] = useState(/** @type {"edit" | "preview"} */ ("edit"));

  const textareaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  // O slug acompanha o título (UC05) até o autor escrever nele; um conteúdo que já existe não muda.
  const slugByHand = useRef(contentId !== null || startup.values.slug !== "");

  const { control, register, handleSubmit, setValue, setError, getValues, reset, formState } = useForm({
    defaultValues: startup.values,
    resolver: editorResolver,
    mode: "onBlur",
  });
  const { errors, isSubmitting } = formState;

  const watched = useWatch({ control });
  const current = pickValues({ title: watched.title, slug: watched.slug, body: watched.body, status: watched.status });
  // O texto longo não trava a digitação: a pré-visualização acompanha com uma renderização adiada.
  const deferredBody = useDeferredValue(current.body);
  const insecureImages = findInsecureImages(deferredBody);

  const unsent = !valuesEqual(current, baseline);
  const savedLocally = savedDraft !== null && valuesEqual(current, savedDraft.values);
  // Um rascunho em conflito precisa de uma decisão antes de qualquer gravação, para não ser perdido.
  const blocked = conflictDraft !== null;

  // Alterações que não estão em lugar nenhum além desta página: avisa antes de sair dela.
  const warnOnLeave = unsent && !savedLocally;
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

  // -------------------------------------------------------------------------------------------
  // Campos
  // -------------------------------------------------------------------------------------------

  const titleField = register("title", {
    onChange: (/** @type {{ target: { value: string } }} */ event) => {
      if (!slugByHand.current) setValue("slug", slugFromTitle(event.target.value));
    },
  });
  const slugField = register("slug", {
    onChange: (/** @type {{ target: { value: string } }} */ event) => {
      slugByHand.current = event.target.value !== "";
      setSlugSuggestion(null);
    },
  });
  const bodyField = register("body");

  /** Enter nos campos de uma linha não envia o formulário: o envio substitui o conteúdo. */
  const ignoreEnter = (/** @type {import("react").KeyboardEvent} */ event) => {
    if (event.key === "Enter") event.preventDefault();
  };

  // -------------------------------------------------------------------------------------------
  // Barra de ferramentas e atalhos
  // -------------------------------------------------------------------------------------------

  /** @param {import("./format").FormatCommand} command */
  function runCommand(command) {
    const area = textareaRef.current;
    if (!area) return;
    const before = { value: area.value, start: area.selectionStart, end: area.selectionEnd };
    const after = applyFormat(command, before);
    const change = diffRange(before.value, after.value);

    area.focus();
    area.setSelectionRange(change.start, change.end);
    // Como edição de verdade, para que Ctrl+Z desfaça o comando; onde o navegador não a oferece,
    // grava o texto direto.
    const edit = change.text === "" ? "delete" : "insertText";
    const edited = typeof document.execCommand === "function" && document.execCommand(edit, false, change.text);
    if (!edited || area.value !== after.value) setValue("body", after.value, { shouldDirty: true, shouldTouch: true });
    area.setSelectionRange(after.start, after.end);
  }

  /** @param {import("react").KeyboardEvent<HTMLTextAreaElement>} event */
  function handleBodyKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const command = /** @type {Record<string, import("./format").FormatCommand>} */ ({ b: "bold", i: "italic", k: "link" })[key];
    if (command) {
      event.preventDefault();
      runCommand(command);
    } else if (key === "s") {
      event.preventDefault();
      saveLocally();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Rascunho local
  // -------------------------------------------------------------------------------------------

  /** Guarda o texto atual neste navegador. Devolve se conseguiu. */
  function saveLocally() {
    // Com um rascunho em conflito à espera de decisão, gravar o apagaria (o atalho Ctrl+S não
    // passa pelo botão desabilitado).
    if (blocked) return false;
    const stored = writeDraft(draftKey, { values: pickValues(getValues()), baseVersion: serverVersion });
    if (!stored) {
      setProblem("Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio). Envie a versão para não perder o texto.");
      return false;
    }
    setSavedDraft(stored);
    setProblem(null);
    setLoginHint(false);
    setNotice({ kind: "local", at: stored.savedAt });
    return true;
  }

  function removeLocalCopy() {
    removeDraft(draftKey);
    setSavedDraft(null);
    setNotice({ kind: "removed" });
  }

  /** Usa o rascunho que ficou defasado: o texto dele substitui o que está na tela. */
  function restoreConflictingDraft() {
    if (!conflictDraft) return;
    reset(conflictDraft.values);
    slugByHand.current = conflictDraft.values.slug !== "";
    setSavedDraft(conflictDraft);
    setConflictDraft(null);
    setNotice({ kind: "restored", at: conflictDraft.savedAt });
  }

  function discardConflictingDraft() {
    removeDraft(draftKey);
    setConflictDraft(null);
    setNotice({ kind: "discarded" });
  }

  // -------------------------------------------------------------------------------------------
  // Envio
  // -------------------------------------------------------------------------------------------

  const submit = handleSubmit(async (data) => {
    // O mesmo vale para o envio: removeria o rascunho em conflito, que o autor ainda não viu.
    if (blocked) return;
    setProblem(null);
    setLoginHint(false);
    setSlugSuggestion(null);
    const titleAsTyped = getValues("title");

    /** @type {SaveResult} */
    let result;
    try {
      result = await onSubmit(data);
    } catch {
      result = UNEXPECTED_FAILURE;
    }

    if (result.ok) {
      removeDraft(draftKey);
      setSavedDraft(null);
      setBaseline(data);
      setServerVersion(result.version);
      setNotice({ kind: "sent", at: new Date().toISOString() });
      // O servidor guardou o título sem espaços nas pontas: a tela passa a mostrá-lo assim, a
      // não ser que o autor já tenha voltado a editá-lo enquanto o envio estava em andamento.
      if (titleAsTyped !== data.title && getValues("title") === titleAsTyped) setValue("title", data.title);
      return;
    }

    // Erros de campo (422 e 409) ficam junto do campo; o resto, em uma mensagem geral.
    const outsideTheForm = [];
    let focused = false;
    for (const error of result.fieldErrors) {
      if (EDITOR_FIELDS.includes(/** @type {any} */ (error.field))) {
        setError(/** @type {"title" | "slug" | "status" | "body"} */ (error.field), { type: "server", message: error.message }, { shouldFocus: !focused });
        focused = true;
        if (error.field === "slug" && error.suggestion) setSlugSuggestion(error.suggestion);
      } else {
        outsideTheForm.push(error.message);
      }
    }

    let message = [result.message, ...outsideTheForm].join(" ");
    if (KEEP_LOCALLY.has(result.kind)) {
      const stored = writeDraft(draftKey, { values: data, baseVersion: serverVersion });
      if (stored) setSavedDraft(stored);
      message += stored
        ? " O texto foi salvo neste navegador."
        : " Não foi possível salvá-lo neste navegador: copie o texto antes de sair desta página.";
    }
    setLoginHint(result.kind === "unauthenticated");
    setProblem(message);
  });

  function applySuggestedSlug() {
    if (!slugSuggestion) return;
    slugByHand.current = true;
    setValue("slug", slugSuggestion, { shouldValidate: true, shouldDirty: true });
    setSlugSuggestion(null);
  }

  // -------------------------------------------------------------------------------------------
  // Marcação
  // -------------------------------------------------------------------------------------------

  const titleError = errors.title?.message;
  const slugError = errors.slug?.message;
  const bodyError = errors.body?.message;
  const statusError = errors.status?.message;
  const noticeMessage = noticeText(notice);

  let stateLine = "Nenhuma alteração pendente.";
  if (unsent) {
    stateLine = savedLocally
      ? "Alterações ainda não enviadas. Há um rascunho salvo neste navegador."
      : "Alterações ainda não enviadas e sem rascunho salvo neste navegador.";
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={isSubmitting} className="flex flex-col gap-5">
      {conflictDraft ? (
        <div role="region" aria-label="Rascunho local em conflito" className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertIcon className="mt-0.5 size-5 shrink-0" />
            <span>
              Há um rascunho local, salvo em {formatDateTime(conflictDraft.savedAt)}, feito sobre uma versão anterior deste
              conteúdo: ele foi alterado no servidor depois. O que está na tela é a versão atual do servidor. Escolha o que
              fazer com o rascunho antes de salvar ou enviar.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={restoreConflictingDraft}>
              Restaurar o rascunho local
            </Button>
            <Button variant="outline" onClick={discardConflictingDraft}>
              Descartar o rascunho local
            </Button>
          </div>
        </div>
      ) : null}

      <div role="group" aria-label="Dados do conteúdo" className="grid gap-4 md:grid-cols-2">
        <Field id={ids.title} label="Título" error={titleError}>
          <input
            id={ids.title}
            type="text"
            autoComplete="off"
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={describedBy(ids.title, { error: titleError })}
            onKeyDown={ignoreEnter}
            className={INPUT}
            {...titleField}
          />
        </Field>
        <Field
          id={ids.slug}
          label="Endereço (slug)"
          error={slugError}
          hint={
            contentId === null
              ? "Sugerido a partir do título; você pode editá-lo. Letras minúsculas, números e hífens."
              : "Alterar o endereço quebra os links que levam a este conteúdo."
          }
        >
          <input
            id={ids.slug}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={slugError ? "true" : undefined}
            aria-describedby={describedBy(ids.slug, { hint: true, error: slugError })}
            onKeyDown={ignoreEnter}
            className={`${INPUT} font-mono`}
            {...slugField}
          />
          {slugSuggestion ? (
            <p className="text-sm">
              <button
                type="button"
                onClick={applySuggestedSlug}
                className="cursor-pointer font-medium underline underline-offset-2"
              >
                Usar o endereço sugerido “{slugSuggestion}”
              </button>
            </p>
          ) : null}
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <StatusToggle status={field.value} onChange={field.onChange} describedBy={ids.statusHint} />
          )}
        />
        <p id={ids.statusHint} className="text-sm text-muted">
          O estado só muda quando você envia a nova versão. Um rascunho não aparece para os leitores.
        </p>
        {statusError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            <span className="sr-only">Erro: </span>
            {statusError}
          </p>
        ) : null}
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

        <div className="grid gap-4 md:grid-cols-2">
          <section aria-label="Edição" className={`${tab === "edit" ? "flex" : "hidden"} min-w-0 flex-col gap-2 md:flex`}>
            <Toolbar onCommand={runCommand} controls={ids.body} />
            <label htmlFor={ids.body} className="sr-only">
              Texto do documento (Markdown)
            </label>
            <textarea
              id={ids.body}
              aria-invalid={bodyError ? "true" : undefined}
              aria-describedby={describedBy(ids.body, { hint: true, error: bodyError })}
              onKeyDown={handleBodyKeyDown}
              className={`${INPUT} h-[26rem] resize-y font-mono leading-relaxed md:h-[34rem]`}
              {...bodyField}
              ref={(element) => {
                bodyField.ref(element);
                textareaRef.current = element;
              }}
            />
            <p id={ids.bodyHint} className="text-sm text-muted">
              Markdown com tabelas e listas de tarefas. Fórmulas: <code>$x^2$</code> em linha e <code>$$…$$</code> em bloco.
            </p>
            {bodyError ? (
              <p id={ids.bodyError} role="alert" className="text-sm font-medium text-danger">
                <span className="sr-only">Erro: </span>
                {bodyError}
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
            <Preview markdown={deferredBody} pending={deferredBody !== current.body} className="h-[26rem] md:h-[34rem]" />
          </section>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p role="status" className="min-h-5 font-medium">
            {noticeMessage}
          </p>
          <p className="text-muted">{stateLine}</p>
          {savedDraft ? (
            <p>
              <button type="button" onClick={removeLocalCopy} className="cursor-pointer text-muted underline underline-offset-2">
                Remover a cópia salva neste navegador
              </button>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={blocked} onClick={saveLocally}>
            Salvar localmente
          </Button>
          <Button type="submit" disabled={blocked || isSubmitting}>
            {isSubmitting ? "Enviando…" : "Enviar nova versão"}
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
