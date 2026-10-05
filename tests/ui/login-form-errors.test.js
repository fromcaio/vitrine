// @vitest-environment jsdom
// Erros do LoginForm no navegador (UC08, fluxos A1 e A4; RN23, RNF03): a mensagem é genérica para
// qualquer falha de credencial e só a conta suspensa (403 BANNED_USER, que o servidor só responde
// com a senha CORRETA) mostra o texto do servidor, com o motivo e o prazo.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: vi.fn() } } }));

import { LoginForm } from "@/components/admin/LoginForm";
import { authClient } from "@/lib/auth-client";

const signIn = /** @type {import("vitest").Mock<any>} */ (authClient.signIn.email);

const BANNED_MESSAGE = "Sua conta está suspensa. Motivo: Violação das regras da plataforma. A suspensão vai até 10/10/2026, 12:00 (UTC).";
const GENERIC = "E-mail ou senha inválidos.";

beforeEach(() => signIn.mockReset());
afterEach(cleanup);

/** Preenche e envia o formulário; devolve o texto da região de alerta depois da resposta. */
async function submitWith(/** @type {unknown} */ outcome) {
  if (outcome instanceof Error) signIn.mockRejectedValueOnce(outcome);
  else signIn.mockResolvedValueOnce(outcome);
  render(<LoginForm redirectTo="/admin" />);
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "fulano@exemplo.test" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-ficticia-1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
  const alert = screen.getByRole("alert");
  await waitFor(() => expect(alert.textContent).not.toBe(""));
  return alert.textContent;
}

describe("LoginForm: erro de entrada", () => {
  it("403 BANNED_USER: mostra o texto do servidor, com o motivo e o prazo", async () => {
    const shown = await submitWith({ error: { status: 403, code: "BANNED_USER", message: BANNED_MESSAGE } });
    expect(shown).toBe(BANNED_MESSAGE);
  });

  it("403 BANNED_USER sem texto do servidor: ainda diz que a conta está suspensa", async () => {
    expect(await submitWith({ error: { status: 403, code: "BANNED_USER" } })).toBe("Sua conta está suspensa.");
  });

  it("403 BANNED_USER com texto em branco: o mesmo", async () => {
    expect(await submitWith({ error: { status: 403, code: "BANNED_USER", message: "   " } })).toBe("Sua conta está suspensa.");
  });

  it("um 403 de outro motivo continua com a mensagem genérica (não vaza o texto do servidor)", async () => {
    expect(await submitWith({ error: { status: 403, code: "OUTRO", message: "Texto interno do servidor." } })).toBe(GENERIC);
  });

  it("o código BANNED_USER sem o status 403 não vale: a mensagem continua genérica", async () => {
    expect(await submitWith({ error: { status: 400, code: "BANNED_USER", message: BANNED_MESSAGE } })).toBe(GENERIC);
  });

  it.each([
    [401, { status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }],
    [400, { status: 400, message: "Bad request" }],
    [500, { status: 500, message: "Erro interno" }],
    ["sem status", { message: "?" }],
  ])("%s: mensagem genérica, que não revela qual campo falhou nem se o e-mail existe", async (_name, error) => {
    expect(await submitWith({ error })).toBe(GENERIC);
  });

  it("429: pede para aguardar", async () => {
    expect(await submitWith({ error: { status: 429, message: "Too many requests" } })).toBe("Muitas tentativas. Aguarde um minuto e tente novamente.");
  });

  it("sem resposta do servidor: mensagem de conexão", async () => {
    expect(await submitWith(new TypeError("Failed to fetch"))).toBe("Não foi possível conectar ao servidor. Tente novamente.");
  });

  it("depois do erro, o botão volta a habilitar e o formulário pode ser reenviado", async () => {
    await submitWith({ error: { status: 403, code: "BANNED_USER", message: BANNED_MESSAGE } });
    const button = /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Entrar" }));
    expect(button.disabled).toBe(false);
    signIn.mockResolvedValueOnce({ error: { status: 401 } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(GENERIC));
  });
});
