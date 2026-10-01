import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadados estáticos do site, a partir dos valores padrão da RN08. O nome e a descrição vindos
// da configuração (RF18, RF25) e as variáveis de tema no <html> entram com o M11 e o M12.
export const metadata = {
  // O modelo vale para os segmentos filhos que definem o próprio título (/login, /admin).
  title: { default: "Vitrine", template: "%s | Vitrine" },
  description:
    "Plataforma de código aberto para blogs e portfólios acadêmicos, com editor Markdown, fórmulas em LaTeX e estrutura hierárquica de conteúdo.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
