// Página /admin/senha e o destino da troca (A-014 Parte 3b, item 5; UC14, RN21; CT40): a página exige a
// sessão (sem a exceção da senha provisória, que é dela mesma), entrega ao formulário da UI se a troca é
// obrigatória e um destino interno e seguro. A sessão e o formulário (da UI) são substituídos.
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: { id: "u1", role: "user", mustChangePassword: true } }));
vi.mock("@/app/admin/_lib/session", () => ({ requireSession: vi.fn(async () => ({ user: session.user })) }));
vi.mock("@/components/admin/PasswordChangeForm", () => ({ PasswordChangeForm: () => null }));

import PasswordPage, { metadata } from "@/app/admin/senha/page";
import { PASSWORD_PAGE, passwordRedirectTarget } from "@/app/admin/_lib/password-redirect";
import { requireSession } from "@/app/admin/_lib/session";
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";

beforeEach(() => {
  session.user = { id: "u1", role: "user", mustChangePassword: true };
  vi.mocked(requireSession).mockClear();
});

const formOf = (element) => [element.props.children].flat().find((child) => child?.type === PasswordChangeForm).props;
const render = (redirectTo) => PasswordPage({ searchParams: Promise.resolve(redirectTo === undefined ? {} : { redirectTo }) });

describe("passwordRedirectTarget: o destino depois da troca", () => {
  it.each([
    ["/admin/conteudo/novo?pai=abc", "/admin/conteudo/novo?pai=abc"],
    ["/admin", "/admin"],
    ["/admin/conteudo/abc", "/admin/conteudo/abc"],
  ])("um caminho interno vale: %s", (value, expected) => expect(passwordRedirectTarget(value)).toBe(expected));

  it.each([
    ["outro site", "https://malicioso.test/admin"],
    ["outro site sem esquema", "//malicioso.test"],
    ["barra invertida", "/" + String.fromCharCode(92) + "malicioso.test"],
    ["sem a barra inicial", "admin"],
    ["lista", ["/admin", "/admin/x"]],
    ["ausente", undefined],
    ["vazio", ""],
    ["a própria página da troca (um laço)", "/admin/senha"],
    ["a própria página com consulta", "/admin/senha?redirectTo=%2Fadmin%2Fsenha"],
    ["uma subpágina da troca", "/admin/senha/x"],
  ])("%s volta ao painel: /admin", (_label, value) => expect(passwordRedirectTarget(value)).toBe("/admin"));

  it("uma página que só começa com o mesmo texto não é a da troca", () => {
    expect(passwordRedirectTarget("/admin/senhas")).toBe("/admin/senhas");
    expect(PASSWORD_PAGE).toBe("/admin/senha");
  });
});

describe("/admin/senha", () => {
  it("exige a sessão com a exceção da senha provisória, que é dela", async () => {
    await render();

    expect(requireSession).toHaveBeenCalledExactlyOnceWith({ path: "/admin/senha", allowTemporaryPassword: true });
  });

  it("com a senha provisória, a troca é obrigatória e o destino é o pedido", async () => {
    const props = formOf(await render("/admin/conteudo/novo"));

    expect(props).toEqual({ mandatory: true, redirectTo: "/admin/conteudo/novo" });
  });

  it("sem a senha provisória (a troca voluntária), não é obrigatória", async () => {
    session.user = { id: "u1", role: "user", mustChangePassword: false };

    expect(formOf(await render())).toEqual({ mandatory: false, redirectTo: "/admin" });
  });

  it("um destino de outro site ou a própria página volta ao painel", async () => {
    expect(formOf(await render("https://malicioso.test")).redirectTo).toBe("/admin");
    expect(formOf(await render("/admin/senha")).redirectTo).toBe("/admin");
  });

  it("tem título e noindex", () => {
    expect(metadata).toEqual({ title: "Trocar a senha", robots: { index: false, follow: false } });
  });
});
