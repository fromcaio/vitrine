// Botão do Vitrine (primitivos de interface do inventário do Cap. 5 §5.11). As cores vêm só dos
// tokens de tema (RF19): o texto sobre a primária usa --vitrine-on-primary, e não o branco fixo,
// para manter o contraste AA com a paleta padrão (RNF05).

// A transição não inclui o contorno: o indicador de foco aparece de imediato.
const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium " +
  "transition-[background-color,border-color,color] enabled:cursor-pointer " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS = {
  /** Ação principal, sobre fundos claros. */
  primary: "bg-primary text-on-primary enabled:hover:bg-secondary enabled:hover:text-on-secondary",
  /** Ação sobre a cor secundária (barra superior do painel). */
  inverse:
    "border border-on-secondary text-on-secondary enabled:hover:bg-on-secondary enabled:hover:text-secondary",
};

/**
 * @param {{ variant?: keyof typeof VARIANTS } & import("react").ComponentProps<"button">} props
 *   aceita as props de `<button>`; `type` é "button" por padrão, para não enviar formulários sem
 *   querer
 */
export function Button({ variant = "primary", type = "button", className = "", ...props }) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} {...props} />;
}
