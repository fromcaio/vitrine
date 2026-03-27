import type { Metadata } from "next";
import "./globals.css";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Vitrine CMS",
  description: "Plataforma modular para educadores",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Busca a configuração (Singleton)
  const config = await prisma.configuration.findUnique({
    where: { id: "singleton" },
  });

  // Estilos dinâmicos baseados no banco de dados
  const dynamicStyles = {
    "--primary": config?.primaryColor || "#3b82f6",
    "--secondary": config?.secondaryColor || "#1e293b",
    "--accent": config?.accentColor || "#f59e0b",
  } as React.CSSProperties;

  return (
    <html lang="pt-br">
      <body style={dynamicStyles} className="antialiased">
        <main>{children}</main>
      </body>
    </html>
  );
}