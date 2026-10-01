"use client";

// Formulário de login provisório (Core). A mensagem de erro é genérica: não revela se o e-mail
// existe nem qual campo falhou (UC08, fluxo A1; RNF03).
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const GENERIC_ERROR = "E-mail ou senha inválidos.";
const TOO_MANY_ATTEMPTS = "Muitas tentativas. Aguarde um minuto e tente novamente.";

/** @param {{ redirectTo: string }} props destino já validado no servidor */
export function LoginForm({ redirectTo }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");

    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setMessage(error.status === 429 ? TOO_MANY_ATTEMPTS : GENERIC_ERROR);
      setPending(false);
      return;
    }
    // Navegação completa: a próxima requisição já leva o cookie de sessão ao Proxy e ao servidor.
    window.location.assign(redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        E-mail
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Senha
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <p role="alert" aria-live="polite">
        {message}
      </p>
      <button type="submit" disabled={pending} className="rounded border px-4 py-2">
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
