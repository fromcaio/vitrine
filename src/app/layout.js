import { Geist, Geist_Mono } from "next/font/google";
import { buildThemeStyle, getSiteConfiguration, siteDescriptionOf, siteNameOf } from "./_lib/site";
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
 * Metadados do site a partir da configuração (RF18): o nome vira o título padrão e o modelo dos
 * segmentos filhos que definem o próprio título (/login, /admin, página 404). Sem configuração,
 * valem "Vitrine" (RN08) e a descrição padrão. Logotipo, favicon e links sociais não entram aqui.
 */
export async function generateMetadata() {
  const configuration = await getSiteConfiguration();
  const siteName = siteNameOf(configuration);
  return {
    title: { default: siteName, template: `%s | ${siteName}` },
    description: siteDescriptionOf(configuration),
  };
}

/**
 * Layout raiz (M11): lê a configuração e injeta a paleta no atributo style de <html>, como
 * variáveis CSS (Cap. 5 §5.9). O PUT /api/configuration revalida este layout, e as páginas
 * passam à nova paleta na requisição seguinte, sem novo build.
 */
export default async function RootLayout({ children }) {
  const themeStyle = buildThemeStyle(await getSiteConfiguration());
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Sem configuração (ou sem cor válida) o atributo é omitido: valem os padrões do globals.css.
      style={Object.keys(themeStyle).length > 0 ? themeStyle : undefined}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
