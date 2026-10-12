"use client";

// Folha e fontes do KaTeX para um texto com fórmula que NÃO é um documento (a página inicial do sistema e do espaço;
// P-032, RNF02). Componente Cliente que não renderiza nada: depois da hidratação pede a folha (`import()`, um
// pedaço à parte, com as fontes só quando uma fórmula as usa). O `MarkdownRenderer` o monta só quando o texto tem
// fórmula (`hasMath`); sem ele, a página não recebe a folha. Do pacote instalado, nunca de uma CDN (ADR-022).
import { useEffect } from "react";

export default function MathStyles() {
  useEffect(() => {
    void import("katex/dist/katex.min.css");
  }, []);
  return null;
}
