"use client";

// Seletor de ícone do rodapé (RF24, RN17; ADR-035): a lista fechada de dezoito, em um `<select>` nativo
// (teclado, leitor de tela e celular de graça) com o desenho do ícone escolhido ao lado, como
// confirmação visual. Um ícone que outro link do mesmo rodapé já usa aparece desabilitado e marcado
// ("já usado"): cada ícone vale uma vez. O desenho é decorativo; o nome do ícone está no texto.
import { FooterIcon } from "@/components/layout/FooterIcon";
import { FOOTER_ICONS, FOOTER_ICON_LABELS } from "@/components/layout/footer-model";

/**
 * @param {object} props
 * @param {string} props.id identificador do `<select>` (o `htmlFor` do rótulo, que é de quem usa)
 * @param {string} props.value o ícone escolhido
 * @param {(icon: string) => void} props.onChange
 * @param {readonly string[]} [props.taken] ícones já usados em OUTROS links do rodapé
 * @param {string} [props.describedBy] ids que descrevem o campo (o erro, o aviso)
 * @param {boolean} [props.invalid]
 */
export function IconPicker({ id, value, onChange, taken = [], describedBy, invalid = false }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface">
        <FooterIcon icon={value} />
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid ? "true" : undefined}
        className="min-h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger"
      >
        {FOOTER_ICONS.map((icon) => {
          const used = icon !== value && taken.includes(icon);
          return (
            <option key={icon} value={icon} disabled={used}>
              {FOOTER_ICON_LABELS[icon]}
              {used ? " (já usado)" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
