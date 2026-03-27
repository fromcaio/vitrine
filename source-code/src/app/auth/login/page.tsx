'use client';

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Credenciais inválidas. Tente novamente.");
    } else {
      router.push("/admin");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-center text-3xl font-bold text-gray-900">Entrar no Vitrine</h2>
        
        {error && <p className="bg-red-50 text-red-500 p-3 rounded-lg text-sm text-center">{error}</p>}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <input
              type="email"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none transition"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none transition"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition shadow-md"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Acessar Sistema
          </button>
        </form>
        
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"></span></div>
          <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Ou continue com</span></div>
        </div>

        <button
          onClick={() => signIn("github", { callbackUrl: "/admin" })}
          className="w-full py-3 px-4 border border-gray-300 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition"
        >
          Github
        </button>
      </div>
    </div>
  );
}