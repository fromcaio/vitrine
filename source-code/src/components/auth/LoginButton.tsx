'use client';

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

export default function LoginButton() {
  return (
    <button
      onClick={() => signIn("github", { callbackUrl: "/admin" })}
      className="flex items-center gap-2 px-6 py-3 font-medium transition-opacity rounded-lg bg-primary text-white hover:opacity-90"
      style={{ backgroundColor: 'var(--primary)' }} // Garantia extra de cor dinâmica
    >
      <Github className="w-5 h-5" />
      Entrar com GitHub
    </button>
  );
}