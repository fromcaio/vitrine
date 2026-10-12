// Folha e fontes do KaTeX (RF10; RNF02): um componente de Servidor que só importa o CSS e não renderiza nada. O
// `MarkdownRenderer` o carrega SOB DEMANDA (`next/dynamic`) quando o texto tem fórmula; assim o Next só envia a
// folha às páginas que a usam. Importada pelo bundle, nunca por CDN (a CSP só aceita folhas e fontes do próprio
// site; ADR-022).
import "katex/dist/katex.min.css";

export default function MathStyles() {
  return null;
}
