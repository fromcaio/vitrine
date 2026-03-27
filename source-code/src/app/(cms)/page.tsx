import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LoginButton from "@/components/auth/LoginButton";
import Link from "next/link";

export default async function Home() {
  const session = await auth();
  const config = await prisma.configuration.findUnique({ where: { id: "singleton" } });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--secondary)' }}>
        {config?.siteName || "Vitrine CMS"}
      </h1>
      
      <p className="text-gray-600 mb-8 max-w-md text-center">
        {config?.siteDescription || "Bem-vindo à sua plataforma de conteúdo educacional."}
      </p>

      {session ? (
        <div className="flex flex-col items-center gap-4">
          <p>Olá, <strong>{session.user?.name}</strong>!</p>
          <Link 
            href="/admin" 
            className="px-6 py-2 border border-primary text-primary rounded-lg hover:bg-gray-50"
            style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
          >
            Acessar Painel Admin
          </Link>
        </div>
      ) : (
        <LoginButton />
      )}
    </div>
  );
}