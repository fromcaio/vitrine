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
import { ModerationDialog } from "@/components/admin/ModerationDialog";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon } from "@/components/ui/icons";
import { autosaveDraft, draftStorageKey, readDraft, removeDraft, resumeAutosave, writeDraft } from "./draft";
import { applyFormat, diffRange, findInsecureImages, slugFromTitle } from "./format";
import { Preview } from "./Preview";
import { EDITOR_FIELDS, editorResolver, valuesEqual } from "./schema";
import { Toolbar } from "./Toolbar";
import { useMediaQuery } from "./useMediaQuery";

/** @typedef {import("./draft").EditorValues} EditorValues */
/** @typedef {import("./draft").Draft} Draft */
/** @typedef {import("./content-client").SaveResult} SaveResult */
/** @typedef {{ kind: "sent" | "local" | "restored", at: string } | { kind: "discarded" | "removed" | "server-adopted" } | null} Notice */
/**
 * Conflito de versão à espera de decisão (RN18): o texto que o autor tentou enviar e o do servidor.
 * @typedef {{ mine: EditorValues, server: import("./content-client").ServerContent }} VersionConflict
 */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground " +
  "aria-invalid:border-danger";

/**
 * A altura do PAR: o bloco de edição (a barra, o espaço entre eles e o texto) e a pré-visualização têm exatamente esta
 * altura, em todas as larguras e nas duas abas do celular (a mesma classe nos dois lados; nada de `calc()` com a altura
 * da barra, que muda quando ela quebra de linha).
 */
const PANE_HEIGHT = "h-[26rem] md:h-[34rem]";

/** O link "Ver página pública": a mesma aparência de um botão de contorno. */
const VIEW_LINK =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-strong bg-background px-4 py-2 text-sm font-medium text-foreground " +
  "transition-[background-color,border-color] hover:border-foreground hover:bg-surface";

/**
 * O `viewHref` só vale se for um caminho DO SITE ("/maria/aula"): nada de "//outro-site", de barra invertida
 * (o navegador a lê como barra) nem de esquema. O Core o monta no servidor; esta é a defesa em profundidade.
 * @param {unknown} href
 * @returns {string | null}
 */
function siteRelative(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  // Sem espaço nem caractere de controle (códigos até 32) e sem a barra invertida (código 92).
  return [...href].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 92) ? null : href;
}

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
    case "server-adopted":
      return "Texto do servidor carregado. O seu texto continua salvo neste navegador.";
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
const KEEP_LOCALLY = new Set([
  "unauthenticated",
  "forbidden",
  "not-found",
  "version-conflict",
  "missing-version",
  "quota",
  "rate-limited",
  "too-complex",
  "busy",
  "server",
  "network",
]);

/** @type {Record<EditorValues["status"], string>} */
const STATUS_LABEL = { PUBLISHED: "Publicado", DRAFT: "Rascunho" };

/**
 * Uma das duas versões do conflito (RN18), só para leitura: título, endereço, estado e o texto
 * como foi escrito (sem renderizar). A região do texto rola e recebe o foco do teclado.
 * @param {{ heading: string, values: EditorValues }} props
 */
function ConflictVersion({ heading, values }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border-strong bg-background p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <dl className="text-sm">
        <div className="flex gap-1">
          <dt className="text-muted">Título:</dt>
          <dd className="min-w-0 break-words">{values.title}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Endereço:</dt>
          <dd className="min-w-0 break-words font-mono">{values.slug}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Estado:</dt>
          <dd>{STATUS_LABEL[values.status]}</dd>
        </div>
      </dl>
      <pre
        tabIndex={0}
        aria-label={`Texto: ${heading}`}
        className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2 font-mono text-sm"
      >
        {values.body}
      </pre>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.userId identificador do usuário autenticado; só entra na chave do rascunho
 * @param {string | null} props.contentId identificador do conteúdo; `null` enquanto não existe
 * @param {Partial<EditorValues> & { body?: string | null }} props.initialValue valores iniciais
 *   (do servidor, ou os padrões de um conteúdo novo)
 * @param {string | null} [props.version] versão do servidor em que `initialValue` se baseia (por
 *   exemplo, o `updatedAt`); serve para saber se um rascunho local ficou defasado
 * @param {(values: EditorValues, context: { version: string | null, reason?: string }) => Promise<SaveResult>} props.onSubmit
 *   envia a nova versão; `context.version` é a versão em que o texto se baseia (RN18); na moderação,
 *   `context.reason` é o motivo
 * @param {string | null} [props.viewHref] caminho da página PÚBLICA do documento ("/maria/aeds-i/p1/testes"), que o Core monta
 *   no servidor (handle ativo do dono e os slugs da raiz ao documento) e só entrega com o documento e seus ancestrais
 *   publicados; `null` (padrão) não mostra o link. O link "Ver página pública" abre em nova aba (o texto não salvo
 *   fica) e leva à versão SALVA. Se o estado salvo é rascunho, o lugar do link tem uma dica para publicar
 * @param {{ ownerName: string }} [props.moderation] modo de MODERAÇÃO (RF34): o conteúdo é de OUTRO usuário.
 *   Mostra um aviso permanente e, a cada envio, o `ModerationDialog` pede o motivo (o envio leva `reason`
 *   e `version`). O rascunho local usa uma chave PRÓPRIA da moderação (`<usuário>:moderacao`), que não
 *   colide com o do administrador editando o que é dele
 */
export function Editor({ userId, contentId, initialValue, version = null, viewHref = null, onSubmit, moderation = undefined }) {
  const draftKey = draftStorageKey(moderation ? `${userId}:moderacao` : userId, contentId);
  const base = useId();
  // `${id}-hint` e `${id}-error` são os identificadores que `Field` e `describedBy` esperam.
  const ids = {
    title: `${base}-titulo`,
    slug: `${base}-slug`,
    body: `${base}-texto`,
    bodyHint: `${base}-texto-hint`,
    bodyError: `${base}-texto-error`,
    statusHint: `${base}-estado-hint`,
    conflictTitle: `${base}-conflito`,
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
  /** @type {[VersionConflict | null, (conflict: VersionConflict | null) => void]} */
  const [versionConflict, setVersionConflict] = useState(/** @type {VersionConflict | null} */ (null));
  const conflictHeading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  /** @type {[Notice, (notice: Notice) => void]} */
  const [notice, setNotice] = useState(
    /** @type {Notice} */ (startup.restored ? { kind: "restored", at: startup.restored.savedAt } : null),
  );
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [loginHint, setLoginHint] = useState(false);
  const [slugSuggestion, setSlugSuggestion] = useState(/** @type {string | null} */ (null));
  const [tab, setTab] = useState(/** @type {"edit" | "preview"} */ ("edit"));
  // A pré-visualização só é renderizada quando está à vista: na tela larga, sempre; na estreita, só na aba dela.
  const wide = useMediaQuery("(min-width: 768px)");
  // Moderação: o envio que espera o motivo, e o último motivo dado (reaproveitado ao sobrescrever depois de um conflito).
  const [asking, setAsking] = useState(/** @type {{ data: EditorValues, baseVersion: string | null } | null} */ (null));
  const [lastReason, setLastReason] = useState(/** @type {string | null} */ (null));

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
  // Um rascunho em conflito, ou um conflito de versão, precisa de uma decisão antes de qualquer
  // gravação, para que nenhum dos dois textos seja perdido.
  const blocked = conflictDraft !== null || versionConflict !== null;

  // O painel do conflito de versão aparece depois de um envio: leva o foco para ele, que o leitor de
  // tela anuncia pelo título.
  useEffect(() => {
    if (versionConflict) conflictHeading.current?.focus();
  }, [versionConflict]);

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

  // O aviso acima só vale para recarregar ou fechar a página. Ao sair do editor por uma navegação
  // interna (um link do painel, o botão Voltar), o componente é desmontado sem aviso: o texto que
  // não está em lugar nenhum além dele é guardado como rascunho local, e a próxima abertura o
  // restaura. O estado mais recente fica em uma ref, porque a limpeza roda uma só vez.
  const leaving = useRef({ unsaved: false, key: draftKey, baseVersion: serverVersion });
  useEffect(() => {
    // Quem abre o editor está com a sessão ativa (ver `clearAllDrafts`).
    resumeAutosave();
  }, []);
  useEffect(() => {
    leaving.current = { unsaved: warnOnLeave && !blocked, key: draftKey, baseVersion: serverVersion };
  });
  useEffect(
    () => () => {
      const { unsaved, key, baseVersion } = leaving.current;
      if (unsaved) autosaveDraft(key, { values: pickValues(getValues()), baseVersion });
    },
    [getValues],
  );

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

  /**
   * Envia `data` baseado em `baseVersion` (RN18) e mostra o resultado. Quem chama decide a versão:
   * o envio comum usa a que o editor tem; a escolha de sobrescrever, depois de um conflito, usa a
   * atual do servidor.
   * @param {EditorValues} data
   * @param {string | null} baseVersion
   * @param {string} [reason] o motivo, só na moderação
   * @returns {Promise<SaveResult>}
   */
  async function send(data, baseVersion, reason = undefined) {
    setProblem(null);
    setLoginHint(false);
    setSlugSuggestion(null);
    const titleAsTyped = getValues("title");

    /** @type {SaveResult} */
    let result;
    try {
      result = await onSubmit(data, reason === undefined ? { version: baseVersion } : { version: baseVersion, reason });
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
      return result;
    }

    // RN18: o conteúdo mudou no servidor. Com o texto dele em mãos, o autor vê os dois e escolhe;
    // enquanto decide, o dele fica guardado neste navegador, para que nenhum se perca.
    if (result.kind === "version-conflict" && result.server) {
      const stored = writeDraft(draftKey, { values: data, baseVersion });
      if (stored) setSavedDraft(stored);
      setVersionConflict({ mine: data, server: result.server });
      return result;
    }

    // Moderação: o servidor recusou só o motivo (422): a mensagem vai ao diálogo, e o texto segue na tela.
    if (reason !== undefined && result.fieldErrors.length > 0 && result.fieldErrors.every((error) => error.field === "reason")) return result;

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
      const stored = writeDraft(draftKey, { values: data, baseVersion });
      if (stored) setSavedDraft(stored);
      message += stored
        ? " O texto foi salvo neste navegador."
        : " Não foi possível salvá-lo neste navegador: copie o texto antes de sair desta página.";
    }
    setLoginHint(result.kind === "unauthenticated");
    setProblem(message);
    return result;
  }

  const submit = handleSubmit(async (data) => {
    // O mesmo vale para o envio: removeria o rascunho em conflito, que o autor ainda não viu.
    if (blocked) return;
    // Moderação: o motivo vem antes do envio.
    if (moderation) {
      setAsking({ data, baseVersion: serverVersion });
      return;
    }
    await send(data, serverVersion);
  });

  /**
   * Moderação: envia com o motivo dado. Se o servidor recusou o motivo, a mensagem volta ao diálogo, que
   * fica aberto; qualquer outro resultado (enviado, conflito de versão, erro) fecha o diálogo e a tela
   * do editor mostra o que aconteceu, como num envio comum.
   * @param {string} reason
   * @returns {Promise<string | null>}
   */
  async function confirmModeration(reason) {
    if (!asking) return null;
    const { data, baseVersion } = asking;
    const result = await send(data, baseVersion, reason);
    const refused = result.ok ? undefined : result.fieldErrors.find((error) => error.field === "reason");
    if (refused) return refused.message;
    setAsking(null);
    setLastReason(result.ok ? null : reason);
    return null;
  }

  /**
   * Escolha explícita de sobrescrever (RN18): o texto do autor volta a ser o do formulário e é
   * reenviado com a versão atual do servidor. Se o conteúdo mudou de novo nesse intervalo, o
   * servidor recusa outra vez e o painel reaparece com o texto mais novo.
   */
  async function sendMine() {
    if (!versionConflict) return;
    const { mine, server } = versionConflict;
    setVersionConflict(null);
    reset(mine);
    // Moderação: reaproveita o motivo já dado; se não há, pede.
    if (moderation && lastReason === null) {
      setAsking({ data: mine, baseVersion: server.version });
      return;
    }
    const result = await send(mine, server.version, moderation ? (lastReason ?? undefined) : undefined);
    if (moderation && result.ok) setLastReason(null);
  }

  /**
   * Escolha de ficar com o texto do servidor: ele passa a ser o do formulário e a base das próximas
   * edições. O texto do autor continua no rascunho local (feito sobre a versão anterior), que a
   * próxima abertura oferece para restaurar ou descartar.
   */
  function adoptServerText() {
    if (!versionConflict) return;
    const { server } = versionConflict;
    reset(server.values);
    slugByHand.current = server.values.slug !== "";
    setBaseline(server.values);
    setServerVersion(server.version);
    setVersionConflict(null);
    setProblem(null);
    setLastReason(null);
    setNotice({ kind: "server-adopted" });
  }

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
  // A versão é o `updatedAt` do servidor; se vier em outro formato, o painel só omite a hora.
  const changedAt =
    versionConflict && !Number.isNaN(Date.parse(versionConflict.server.version)) ? formatDateTime(versionConflict.server.version) : null;

  // "Ver página pública": o link só existe com o `viewHref` do Core e com o estado SALVO publicado (um documento que
  // passou a rascunho nesta sessão deixou de ter página); com o estado salvo em rascunho, uma dica toma o lugar dele.
  const publicHref = siteRelative(viewHref);
  const savedAsDraft = baseline.status === "DRAFT";
  const showViewLink = publicHref !== null && !savedAsDraft;

  let stateLine = "Nenhuma alteração pendente.";
  if (unsent) {
    stateLine = savedLocally
      ? "Alterações ainda não enviadas. Há um rascunho salvo neste navegador."
      : "Alterações ainda não enviadas e sem rascunho salvo neste navegador.";
  }

  return (
    <>
    <form onSubmit={submit} noValidate aria-busy={isSubmitting} className="flex flex-col gap-5">
      {moderation ? (
        <div role="note" className="flex items-start gap-2 rounded-md border-2 border-foreground bg-surface p-3 text-sm">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <p className="wrap-anywhere">
            Você está editando o conteúdo de <strong className="font-semibold">{moderation.ownerName}</strong>. Cada envio pede um motivo, que a pessoa vê na
            notificação. Se ela alterou o texto depois de você abri-lo, você vê os dois textos antes de decidir.
          </p>
        </div>
      ) : null}
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

      {versionConflict ? (
        <section aria-labelledby={ids.conflictTitle} className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
          <h2 id={ids.conflictTitle} ref={conflictHeading} tabIndex={-1} className="flex items-start gap-2 text-base font-semibold">
            <AlertIcon className="mt-0.5 size-5 shrink-0" />
            Este conteúdo mudou no servidor
          </h2>
          <p className="text-sm">
            Ele foi alterado depois de você abri-lo{changedAt ? `, em ${changedAt}` : ""} (em outra aba, ou pelo administrador).
            Nada foi enviado. Compare os dois textos e escolha qual enviar: o seu texto está salvo neste navegador
            até você decidir.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <ConflictVersion heading="Versão do servidor" values={versionConflict.server.values} />
            <ConflictVersion heading="O seu texto" values={versionConflict.mine} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendMine}>Enviar o meu texto e substituir o do servidor</Button>
            <Button variant="outline" onClick={adoptServerText}>
              Ficar com o texto do servidor
            </Button>
          </div>
        </section>
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

        <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
          <section aria-label="Edição" className={`${tab === "edit" ? "flex" : "hidden"} min-w-0 flex-col gap-2 md:flex`}>
            {/* O BLOCO de edição (a barra, o espaço entre eles e o texto) tem a altura do par, a mesma da pré-visualização:
                a barra pode quebrar em 1, 2 ou 3 linhas e o texto (`flex-1 min-h-0`) fica com o que sobra. As dicas, o erro
                e o aviso de http:// vêm DEPOIS do bloco e não entram na conta (P-024, item 8). */}
            <div className={`${PANE_HEIGHT} flex min-h-0 flex-col gap-2`}>
              <div className="shrink-0">
                <Toolbar onCommand={runCommand} controls={ids.body} />
              </div>
              <label htmlFor={ids.body} className="sr-only">
                Texto do documento (Markdown)
              </label>
              <textarea
                id={ids.body}
                aria-invalid={bodyError ? "true" : undefined}
                aria-describedby={describedBy(ids.body, { hint: true, error: bodyError })}
                onKeyDown={handleBodyKeyDown}
                className={`${INPUT} min-h-0 flex-1 resize-none font-mono leading-relaxed`}
                {...bodyField}
                ref={(element) => {
                  bodyField.ref(element);
                  textareaRef.current = element;
                }}
              />
            </div>
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
            <Preview markdown={current.body} visible={wide || tab === "preview"} className={PANE_HEIGHT} />
          </section>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p role="status" className="min-h-5 font-medium">
            {noticeMessage}
          </p>
          <p className="text-muted">{stateLine}</p>
          {savedAsDraft ? <p className="text-muted">Publique o documento para ver a página pública.</p> : null}
          {showViewLink && unsent ? (
            <p className="text-muted">O link da página pública abre a versão salva, sem as alterações ainda não enviadas.</p>
          ) : null}
          {savedDraft ? (
            <p>
              <button type="button" onClick={removeLocalCopy} className="cursor-pointer text-muted underline underline-offset-2">
                Remover a cópia salva neste navegador
              </button>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {showViewLink ? (
            <a href={publicHref} target="_blank" rel="noopener" className={VIEW_LINK}>
              Ver página pública<span className="sr-only"> (abre em uma nova aba)</span>
            </a>
          ) : null}
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
    {asking && moderation ? (
      <ModerationDialog
        open
        title={`Enviar a nova versão do conteúdo de ${moderation.ownerName}`}
        description="O texto enviado substitui o vigente, que não fica guardado (o envio não mantém histórico)."
        confirmLabel="Enviar"
        ownerName={moderation.ownerName}
        onConfirm={confirmModeration}
        onCancel={() => setAsking(null)}
      />
    ) : null}
    </>
  );
}
