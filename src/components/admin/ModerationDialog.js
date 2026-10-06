"use client";

// Diálogo de moderação (RF27, RF34; RN19, RN26; M10, M20): pede o MOTIVO de uma ação do administrador
// sobre outro usuário (suspender, despublicar ou excluir conteúdo alheio, editar conteúdo alheio).
// Construído sobre o `ConfirmDialog` (foco no campo, Esc, foco preso, devolução do foco).
//
// O motivo (1 a 500 caracteres, DEPOIS de aparado) é obrigatório: vazio ou só de espaços é recusado
// antes de enviar, com o contador `n/500` e a mensagem ligada ao campo por `aria-describedby`. O
// diálogo avisa que o dono será notificado e verá o motivo (RN26) e que moderar não é editar a
// estrutura. `onConfirm(reason)` recebe o motivo JÁ aparado; se devolve um texto, ele aparece DENTRO
// do diálogo (erro do servidor: 422, 409, 403), que continua aberto com o motivo digitado. Quem o usa
// fecha o diálogo (deixando de renderizá-lo) quando a ação dá certo. O estado do motivo mora no
// componente interno, que só existe enquanto o diálogo está aberto: reabrir começa em branco. Todo
// texto é escapado; só tokens de tema.
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, describedBy } from "@/components/ui/Field";
import { REASON_MAX_LENGTH, validateReason } from "./moderation-model";

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {import("react").ReactNode} [props.description] o que a ação faz
 * @param {string} [props.confirmLabel]
 * @param {boolean} [props.danger] ação destrutiva (excluir): botão e papel de perigo
 * @param {string} [props.ownerName] o nome do dono, para o aviso "o dono será notificado" ("X será notificado(a)…")
 * @param {(reason: string) => (string | null | void | Promise<string | null | void>)} props.onConfirm
 *   chamado com o motivo aparado; devolva um texto para mostrar um erro no diálogo
 * @param {() => void} props.onCancel
 * @param {import("react").ReactNode} [props.children] campos extras, depois do motivo (o prazo da suspensão)
 */
export function ModerationDialog({ open, ...rest }) {
  return open ? <OpenDialog {...rest} /> : null;
}

/** @param {Omit<Parameters<typeof ModerationDialog>[0], "open">} props */
function OpenDialog({ title, description, confirmLabel = "Confirmar", danger = false, ownerName, onConfirm, onCancel, children }) {
  const id = useId();
  const reasonRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const fieldId = `${id}-motivo`;
  const countId = `${id}-contagem`;
  const trimmed = text.trim().length;

  async function confirm() {
    if (pending) return;
    const { reason, error: invalid } = validateReason(text);
    setError(invalid ?? "");
    setServerError("");
    if (invalid) {
      reasonRef.current?.focus();
      return;
    }
    setPending(true);
    let failed = null;
    try {
      failed = await onConfirm(reason);
    } catch {
      failed = "Não foi possível concluir a ação agora. Tente de novo em instantes.";
    }
    // Se deu certo, quem usa já fechou o diálogo (este componente saiu da tela): nada a atualizar.
    if (typeof failed === "string" && failed !== "") setServerError(failed);
    setPending(false);
  }

  return (
    <ConfirmDialog
      open
      danger={danger}
      initialFocus="field"
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pending={pending}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <Field
        id={fieldId}
        label="Motivo"
        hint={
          <>
            {ownerName ? <strong className="font-semibold">{ownerName}</strong> : "A pessoa"} será notificada e verá este motivo. Moderar não é editar
            a estrutura do espaço: só a ação descrita acima é feita.
          </>
        }
        error={error}
      >
        <textarea
          ref={reasonRef}
          id={fieldId}
          rows={4}
          value={text}
          readOnly={pending}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError("");
          }}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={`${describedBy(fieldId, { hint: true, error }) ?? ""} ${countId}`.trim()}
          className={INPUT}
        />
        <p id={countId} className={`text-xs ${trimmed > REASON_MAX_LENGTH ? "font-semibold text-danger" : "text-muted"}`}>
          {trimmed}/{REASON_MAX_LENGTH}
        </p>
      </Field>
      {children}
      <div role="alert" className="empty:hidden">
        {serverError ? <p className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger wrap-anywhere">{serverError}</p> : null}
      </div>
    </ConfirmDialog>
  );
}
