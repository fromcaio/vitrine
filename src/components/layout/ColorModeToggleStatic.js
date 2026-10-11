// A IMAGEM do botão do modo de cor, para a pré-visualização da aparência (P-024, item 6; RF31): o mesmo tamanho
// e a mesma aparência do `ColorModeToggle`, mas só de apresentação. Não é um botão (não recebe foco nem clique),
// NÃO lê nem escreve o cookie `vitrine-modo`, NÃO tem efeito e jamais mexe na classe `dark` do <html>: o botão
// real faz tudo isso e quebraria a página. Fica dentro do `inert` da amostra e leva `aria-hidden`.
//
// Mostra o ícone do modo PARA O QUAL o botão leva, como o real: na amostra clara, o do escuro; na escura, o do
// claro. O par de ícones vem por `iconPair`; sem ele, `sun_moon`. Server Component, só com tokens de tema.
import { COLOR_MODE_TOGGLE_LOOK } from "./color-mode-toggle-style";
import { modeIconsOf } from "./mode-icon-pairs";

/**
 * @param {object} props
 * @param {"light" | "dark"} props.mode o modo da amostra em que o botão aparece
 * @param {string} [props.iconPair] o par de ícones (`sun_moon`, `sun_moon_outline`, `lightbulb` ou
 *   `contrast_half`); um valor desconhecido vale `sun_moon`
 */
export function ColorModeToggleStatic({ mode, iconPair }) {
  const icons = modeIconsOf(iconPair);
  const Icon = mode === "dark" ? icons.Light : icons.Dark;
  return (
    <span aria-hidden="true" data-testid="botao-de-modo-amostra" data-mode={mode} className={COLOR_MODE_TOGGLE_LOOK}>
      <Icon />
    </span>
  );
}
