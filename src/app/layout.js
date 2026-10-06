// Layout raiz ESTÁTICO (ADR-030, ADR-025; Cap. 5 §5.11): só o idioma, as fontes, as classes de
// estrutura, o `suppressHydrationWarning` e o script do modo de cor. NÃO lê o banco e NÃO define as
// cores: o tema do site é do envoltório `.vitrine-tema` do portal, do login e do painel, e o do dono,
// do layout de `/{handle}`. O 404 global usa as paletas padrão do `:root` e do `.dark`.
import { Geist, Geist_Mono } from "next/font/google";
import { COLOR_MODE_SCRIPT } from "@/components/layout/color-mode-script";
import { publicBaseUrl } from "@/lib/seo";
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_NAME } from "./_lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadados padrão, sem consulta ao banco: valem para a página 404 e para o que não tem layout próprio. O
 * portal, o login e o painel definem os seus (nome e descrição do site) no `generateMetadata` dos layouts.
 * O `metadataBase` é a URL pública (`BETTER_AUTH_URL`, RF25): torna absolutos o endereço canônico e o Open
 * Graph de todas as páginas; sem ela, ficam relativos. É lido na hora, e não no `next build`, que no
 * estágio de build da imagem Docker não a tem.
 */
export function generateMetadata() {
  const base = publicBaseUrl();
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: { default: DEFAULT_SITE_NAME, template: `%s | ${DEFAULT_SITE_NAME}` },
    description: DEFAULT_SITE_DESCRIPTION,
  };
}

/**
 * O `<html>` leva `suppressHydrationWarning` porque o script do `<head>` adiciona a classe `dark`
 * antes da hidratação (CT47). O conteúdo do script é FIXO (uma constante da UI), nunca montado com
 * dado do banco ou do usuário; a CSP o admite (`script-src 'unsafe-inline'`, ADR-022).
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
