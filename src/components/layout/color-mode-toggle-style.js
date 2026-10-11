// Aparência do botão do modo de cor, compartilhada pelo botão real (`ColorModeToggle`) e pela imagem dele na
// pré-visualização da aparência (`ColorModeToggleStatic`): os dois têm o mesmo tamanho (alvo de toque de 40 px)
// e as mesmas cores neutras, de modo que a amostra mostra o botão como ele é. Só classes, sem estado.

/** O tamanho, a borda e as cores neutras do botão (o fundo e o texto não dependem da paleta da barra). */
export const COLOR_MODE_TOGGLE_LOOK = "inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-background text-foreground";
