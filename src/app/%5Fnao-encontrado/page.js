// Alvo do `rewrite` do Proxy (ADR-030, item 4; CT45): responde `notFound()`, o mesmo 404 de qualquer
// caminho inexistente (RF14). Dinâmica de propósito: nada é gravado em `.next/` por URL inexistente. O
// segmento começa por sublinhado (`%5F` no nome da pasta): nenhum handle nem slug o tem.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function NotFoundTarget() {
  notFound();
}
