// @vitest-environment jsdom
// O link do login nos avisos de 401 (A-015, etapa 4, acertos): os três formulários usam o <Link> do
// Next, e não um <a href="/login"> (a regra no-html-link-for-pages). O <Link> faz a navegação do
// cliente: a página muda e o componente é desmontado, o que descarta o estado (as senhas digitadas).
// Aqui o `next/link` é trocado por um marcador, para provar QUEM renderiza o link; a navegação de
// verdade é verificada no navegador, sobre o build de produção.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }) => createElement("a", { "data-next-link": "", href, ...rest }, children),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { NotificationList } from "@/components/admin/NotificationList";
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { DEFAULT_PALETTES } from "@/lib/theme";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const unauthenticated = () =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "m", details: [] } }), { status: 401, headers: { "Content-Type": "application/json" } })));

describe("os avisos de sessão expirada usam o <Link> do Next", () => {
  it("PasswordChangeForm: 'Ir para o login'", async () => {
    unauthenticated();
    render(<PasswordChangeForm />);
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "senha-antiga-123" } });
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha-nova-456" } });
    fireEvent.change(screen.getByLabelText("Confirmar a nova senha"), { target: { value: "senha-nova-456" } });
    fireEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
    const login = await screen.findByRole("link", { name: "Ir para o login" });
    expect(login.hasAttribute("data-next-link")).toBe(true);
    expect(login.getAttribute("href")).toBe("/login");
    // Navegação do cliente: sem target (a página atual é substituída e o estado, descartado).
    expect(login.hasAttribute("target")).toBe(false);
  });

  it("SiteAppearanceForm: 'Abrir o login em outra aba', que abre em outra aba e não substitui a tela", async () => {
    unauthenticated();
    render(<AppearanceForm initial={{ siteName: "Espaço", ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark }} />);
    fireEvent.change(screen.getByLabelText("Nome do espaço"), { target: { value: "Outro nome" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar a aparência" }));
    const login = await screen.findByRole("link", { name: "Abrir o login em outra aba" });
    expect(login.hasAttribute("data-next-link")).toBe(true);
    expect(login.getAttribute("href")).toBe("/login");
    expect(login.getAttribute("target")).toBe("_blank");
    expect(login.getAttribute("rel")).toBe("noopener noreferrer");
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText("Nome do espaço")).value).toBe("Outro nome");
  });

  it("NotificationList: 'Ir para o login'", async () => {
    unauthenticated();
    const note = { id: "n1", type: "ACCOUNT", severity: "INFO", title: "T", text: "x", readAt: null, resolvedAt: null, createdAt: "2026-10-05T12:00:00.000Z", updatedAt: "2026-10-05T12:00:00.000Z" };
    render(<NotificationList initial={{ items: [note], unreadCount: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar: T" }));
    const login = await screen.findByRole("link", { name: "Ir para o login" });
    expect(login.hasAttribute("data-next-link")).toBe(true);
    expect(login.getAttribute("href")).toBe("/login");
  });
});
