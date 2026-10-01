"use client";

// Formulário de autenticação do painel (UC08; RF01). O cliente do better-auth envia as
// credenciais a POST /api/auth/sign-in/email, rota com limitação de tentativas (RNF03). A
// mensagem de erro é uma só: não revela se o e-mail existe nem qual campo falhou (UC08, fluxo
// A1). As credenciais não passam pelo estado do componente, não são registradas nem guardadas:
// são lidas dos campos apenas no envio.
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/icons";
import { authClient } from "@/lib/auth-client";

const GENERIC_ERROR = "E-mail ou senha inválidos.";
const TOO_MANY_ATTEMPTS = "Muitas tentativas. Aguarde um minuto e tente novamente.";
// Sem resposta do servidor (rede fora do ar): nada a dizer sobre as credenciais.
const NO_RESPONSE = "Não foi possível conectar ao servidor. Tente novamente.";

const FIELD =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground";

/** @param {{ redirectTo: string }} props destino já validado no servidor (`safeRedirectPath`) */
export function LoginForm({ redirectTo }) {
  const emailId = useId();
  const passwordId = useId();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    // Esvaziar antes de enviar faz a mesma mensagem ser anunciada de novo a cada tentativa.
    setMessage("");

    try {
      const { error } = await authClient.signIn.email({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (!error) {
        // Navegação completa: a próxima requisição já leva o cookie de sessão ao Proxy e ao
        // servidor. O botão segue desabilitado até a página de destino carregar.
        window.location.assign(redirectTo);
        return;
      }
      setMessage(error.status === 429 ? TOO_MANY_ATTEMPTS : GENERIC_ERROR);
    } catch {
      setMessage(NO_RESPONSE);
    }
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="flex flex-col">
      <div className="mb-4 flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium">
          E-mail
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={FIELD}
        />
      </div>
      <div className="mb-4 flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-medium">
          Senha
        </label>
        <input
          id={passwordId}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className={FIELD}
        />
      </div>
      {/* Região viva sempre presente (e sem altura quando vazia): o leitor de tela anuncia o
          texto quando ele aparece. */}
      <div role="alert" aria-live="assertive">
        {message ? (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
