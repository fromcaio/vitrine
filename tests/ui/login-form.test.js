// Renderização no servidor do LoginForm (UC08; RNF03): o HTML que o navegador recebe e usa
// enquanto a página não hidrata. Se a hidratação falhar, vale o envio nativo do formulário.
import { describe, expect, it, vi } from "vitest";

// O cliente do better-auth só é chamado no envio, no navegador; aqui basta o módulo existir.
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: vi.fn() } } }));

import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "@/components/admin/LoginForm";
import { authClient } from "@/lib/auth-client";

const html = renderToStaticMarkup(<LoginForm redirectTo="/admin" />);

/** Atributos da marca de abertura que casa com o padrão, como objeto (atributo sem valor = ""). */
function attributesOf(pattern) {
  const opening = html.match(pattern)?.[0] ?? "";
  return Object.fromEntries(
    [...opening.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? ""]),
  );
}

describe("LoginForm (renderização no servidor)", () => {
  it('envia por POST: sem hidratação, as credenciais não vão para a URL (method="post")', () => {
    const form = attributesOf(/<form[^>]*>/);
    expect(form.method).toBe("post");
    // Sem action: o envio nativo vai para a própria página, nunca para outro site.
    expect(form).not.toHaveProperty("action");
    expect(html.match(/<form/g)).toHaveLength(1);
  });

  it("tem os campos de e-mail e senha com rótulo, nome e autocomplete", () => {
    const email = attributesOf(/<input[^>]*name="email"[^>]*>/);
    const password = attributesOf(/<input[^>]*name="password"[^>]*>/);

    expect(email).toMatchObject({ type: "email", autoComplete: "username", required: "" });
    expect(password).toMatchObject({ type: "password", autoComplete: "current-password", required: "" });
    expect(html).toContain(`<label for="${email.id}"`);
    expect(html).toContain(`<label for="${password.id}"`);
    expect(email.id).not.toBe(password.id);
  });

  it("não traz credenciais nem o destino no HTML", () => {
    expect(html).not.toMatch(/<input[^>]*\svalue=/);
    expect(html).not.toContain("/admin");
  });

  it("tem a região de alerta vazia e o botão de envio habilitado", () => {
    expect(html).toContain('<div role="alert" aria-live="assertive"></div>');
    const button = attributesOf(/<button[^>]*>/);
    expect(button.type).toBe("submit");
    expect(button).not.toHaveProperty("disabled");
    expect(html).toMatch(/<button[^>]*>Entrar<\/button>/);
  });

  it("não chama a autenticação ao renderizar", () => {
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });
});
