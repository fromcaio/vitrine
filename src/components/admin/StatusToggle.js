"use client";

// Estado de publicação de um conteúdo (RF26, RN16): o selo que mostra o estado e o botão que o
// alterna. O rascunho aparece em destaque, em cores invertidas (texto sobre o fundo escuro do
// tema), e nunca só pela cor: o selo traz um ícone e o nome do estado. Serve ao editor (M09) e
// servirá à árvore do painel (M10).
import { Button } from "@/components/ui/Button";
import { CheckCircleIcon, PencilIcon } from "@/components/ui/icons";

/** @typedef {"DRAFT" | "PUBLISHED"} ContentStatus */

/** Nome de cada estado, em português. */
export const STATUS_LABEL = /** @type {const} */ ({ DRAFT: "Rascunho", PUBLISHED: "Publicado" });

/**
 * Selo do estado de publicação.
 * @param {{ status: ContentStatus, id?: string, className?: string }} props
 */
export function StatusBadge({ status, id, className = "" }) {
  const draft = status === "DRAFT";
  const tone = draft
    ? "border-foreground bg-foreground text-background"
    : "border-border-strong bg-background text-foreground";
  return (
    <span
      id={id}
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${tone} ${className}`.trim()}
    >
      {draft ? <PencilIcon className="size-4 shrink-0" /> : <CheckCircleIcon className="size-4 shrink-0" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Selo e botão que alterna entre rascunho e publicado. Controlado: quem o usa guarda o estado e
 * decide quando aplicá-lo (o editor o envia com a nova versão; a árvore o enviaria na hora).
 * @param {object} props
 * @param {ContentStatus} props.status estado atual
 * @param {(next: ContentStatus) => void} props.onChange chamado com o estado pedido
 * @param {boolean} [props.disabled]
 * @param {string} [props.describedBy] identificador de um texto de ajuda, lido junto do botão
 */
export function StatusToggle({ status, onChange, disabled = false, describedBy }) {
  const draft = status === "DRAFT";
  return (
    <div role="group" aria-label="Estado de publicação" className="flex flex-wrap items-center gap-3">
      <StatusBadge status={status} />
      <Button
        variant="outline"
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => onChange(draft ? "PUBLISHED" : "DRAFT")}
      >
        {draft ? "Publicar" : "Passar para rascunho"}
      </Button>
    </div>
  );
}
