import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UserMenu from "./UserMenu";

export default async function TopBar() {
  const session = await auth();
  const config = await prisma.configuration.findUnique({ where: { id: "singleton" } });

  return (
    <nav className="shadow-lg" style={{ backgroundColor: 'var(--secondary)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <Link href="/" className="flex items-center">
              <span className="text-white text-xl sm:text-2xl font-bold hover:opacity-80 transition">
                {config?.siteName || "Vitrine"}
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {session?.user ? (
              <UserMenu user={session.user} />
            ) : (
              <>
                <Link
                  href="/auth/register"
                  className="text-white text-sm sm:text-base font-semibold px-4 py-2 rounded-lg hover:bg-white hover:bg-opacity-10 transition"
                >
                  Cadastrar
                </Link>
                <Link
                  href="/auth/login"
                  className="bg-white text-sm sm:text-base font-semibold px-4 py-2 rounded-lg transition hover:bg-opacity-90"
                  style={{ color: 'var(--secondary)' }}
                >
                  Entrar
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}