// Avisos de contraste devolvidos pelos `PUT` de configuração e de aparência (Cap. 5 §5.9.1, RN09).
// A verificação é de `contrastWarnings` (src/lib/theme.js, da UI), que hoje só conhece a paleta
// clara; os avisos da paleta noturna, sobre os neutros do modo noturno, dependem de a UI entregar a
// função por modo (A-014, Parte 1, item 4; M18). Até lá, `warnings` traz os da paleta clara.
import { contrastWarnings } from "@/lib/theme";

/**
 * @param {{ primaryColor: string, secondaryColor: string, accentColor: string }} palette registro gravado
 */
export function contrastWarningsOf(palette) {
  return contrastWarnings({
    primaryColor: palette.primaryColor,
    secondaryColor: palette.secondaryColor,
    accentColor: palette.accentColor,
  });
}
