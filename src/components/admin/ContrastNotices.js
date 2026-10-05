// Avisos de contraste de uma paleta (RN09, RN27; WCAG 2.1 AA): a lista dos avisos de um modo, com o
// ícone e o texto (nunca só a cor). Não bloqueiam o salvamento. A região é `aria-live="polite"` e
// está sempre presente, para o leitor de tela anunciar a lista quando ela muda. Componente de
// apresentação, só com tokens de tema.
import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";

/**
 * @param {object} props
 * @param {string} props.id identificador da região (para `aria-describedby` e testes)
 * @param {string} props.heading título do bloco (por exemplo, "Nesta tela")
 * @param {import("@/lib/theme").ContrastWarning[]} props.warnings avisos do modo
 * @param {string} [props.okText] texto quando não há avisos; sem ele, o bloco só some
 */
export function ContrastNotices({ id, heading, warnings, okText }) {
  return (
    <div id={id} aria-live="polite" className="flex flex-col gap-1 text-sm empty:hidden">
      {warnings.length > 0 || okText ? <p className="font-medium">{heading}</p> : null}
      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <li key={warning.field} data-field={warning.field} className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : okText ? (
        <p className="flex items-start gap-2 text-muted">
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          {okText}
        </p>
      ) : null}
    </div>
  );
}
