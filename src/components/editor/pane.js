// Medidas e aparência que os editores de Markdown compartilham (o `Editor` do documento e o `HomeEditor` da página
// inicial): a mesma altura do bloco de edição e da pré-visualização, e o link "Ver página pública". Módulo sem React.

/**
 * A altura do PAR: o bloco de edição (a barra, o espaço entre eles e o texto) e a pré-visualização têm exatamente esta
 * altura, em todas as larguras e nas duas abas do celular (a mesma classe nos dois lados; nada de `calc()` com a altura
 * da barra, que muda quando ela quebra de linha).
 */
export const PANE_HEIGHT = "h-[26rem] md:h-[34rem]";

/** O link "Ver página pública": a mesma aparência de um botão de contorno. */
export const VIEW_LINK =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-strong bg-background px-4 py-2 text-sm font-medium text-foreground " +
  "transition-[background-color,border-color] hover:border-foreground hover:bg-surface";
