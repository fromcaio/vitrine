"use client";

// Diálogo de confirmação (primitivo de interface; Cap. 5 §5.11; RF07, RN07; RNF05): um modal acessível
// que SUBSTITUI o `window.confirm`. Usa o elemento `<dialog>` aberto por `showModal()`, que já inerta o
// resto da página e prende o foco no navegador; por cima, e para valer também onde o `<dialog>` não
// faz tudo (testes, navegadores antigos), este componente:
//   - leva o foco ao botão de cancelar ao abrir (a opção segura; com `initialFocus="field"`, ao
//     primeiro campo do conteúdo extra) e o prende no diálogo (Tab e Shift+Tab fazem a volta);
//   - cancela com Esc (o evento `cancel` do `<dialog>`) e com o clique no fundo, nunca enquanto o
//     envio está em andamento;
//   - DEVOLVE o foco a quem o abriu (o elemento focado quando `open` virou verdadeiro);
//   - liga o título e a descrição por `aria-labelledby` e `aria-describedby`, com `aria-modal`.
// É controlado: quem o usa guarda `open` e decide o que fazer em `onConfirm` e em `onCancel`. Tudo
// fica em um `<form>`: o botão de confirmar é o de envio, e o Enter em um campo do conteúdo extra
// confirma. Só tokens de tema.
import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open o diálogo está aberto
 * @param {string} props.title título (o nome do diálogo)
 * @param {import("react").ReactNode} [props.description] explicação; fica ligada ao diálogo (`aria-describedby`)
 * @param {string} [props.confirmLabel] texto do botão de confirmar
 * @param {string} [props.cancelLabel] texto do botão de cancelar
 * @param {boolean} [props.danger] ação destrutiva: botão de confirmar em destaque de perigo e papel `alertdialog`
 * @param {boolean} [props.pending] a ação está sendo enviada: o botão diz "Enviando…" e nada fecha o diálogo
 * @param {"cancel" | "field"} [props.initialFocus] onde o foco começa: no botão de cancelar (padrão) ou no primeiro campo do conteúdo extra
 * @param {() => void} props.onConfirm chamado ao confirmar
 * @param {() => void} props.onCancel chamado ao cancelar (botão, Esc ou clique no fundo)
 * @param {import("react").ReactNode} [props.children] conteúdo extra, entre a descrição e os botões
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  pending = false,
  initialFocus = "cancel",
  onConfirm,
  onCancel,
  children,
}) {
  const base = useId();
  const dialogRef = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const cancelRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const opener = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return undefined;
    // Quem abriu: o elemento focado agora, antes de o foco ir para o diálogo.
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const field = initialFocus === "field" ? dialog.querySelector("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)") : null;
    (field instanceof HTMLElement ? field : cancelRef.current)?.focus();
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      const target = opener.current;
      opener.current = null;
      // Devolve o foco a quem abriu (se ele ainda existe: ao excluir um item, quem chama escolhe outro).
      if (target?.isConnected) target.focus();
    };
    // `initialFocus` só vale na abertura: mudá-lo com o diálogo aberto não deve mover o foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Mantém o Tab dentro do diálogo. @param {import("react").KeyboardEvent<HTMLDialogElement>} event */
  function trapTab(event) {
    if (event.key !== "Tab") return;
    const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])].filter((item) => item instanceof HTMLElement);
    if (items.length === 0) return;
    const first = /** @type {HTMLElement} */ (items[0]);
    const last = /** @type {HTMLElement} */ (items[items.length - 1]);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const titleId = `${base}-titulo`;
  const descriptionId = `${base}-descricao`;
  return (
    <dialog
      ref={dialogRef}
      role={danger ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onKeyDown={trapTab}
      // Esc: o evento `cancel` do <dialog>. O componente é controlado, então o fechamento é de quem o usa.
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      // Um clique no próprio <dialog> (e não no conteúdo) é um clique no fundo.
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) onCancel();
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-w-full rounded-lg border border-border-strong bg-background p-0 text-foreground backdrop:bg-foreground/60"
    >
      <form
        className="flex flex-col gap-4 p-5 sm:p-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onConfirm();
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold break-words">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="text-sm break-words">
            {description}
          </div>
        ) : null}
        {children}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Enviando…" : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
