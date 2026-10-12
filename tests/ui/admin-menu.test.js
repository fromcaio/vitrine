// @vitest-environment jsdom
// Menu do painel por papel e por senha provisória, e a casca com o sino (RF33, RN21, RNF05, RNF06;
// M19, M20): AdminSidebar, AdminShell e AdminHeader. A rota corrente é simulada.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSidebar, DEFAULT_AVAILABLE_PATHS, NAV_ITEMS, menuFor } from "@/components/admin/AdminSidebar";

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => {
  cleanup();
  pathname = "/admin";
});

const ALL = NAV_ITEMS.map((item) => item.href);
const labels = (/** @type {ReturnType<typeof menuFor>} */ items) => items.map((item) => item.label);
const signOut = vi.fn(async () => {});
const USER = { name: "Ana Souza", email: "ana@exemplo.test" };

/** Os itens do menu de uma das duas cópias (a recolhível e a lateral). */
const navs = () => screen.getAllByRole("navigation", { name: "Navegação do painel", hidden: true });
const itemTexts = (/** @type {HTMLElement} */ nav) => [...nav.querySelectorAll("li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());

describe("menuFor: o menu por papel e por senha provisória", () => {
  it("o usuário comum tem Visão geral, Conteúdo, Página inicial, Aparência, Notificações, Perfil e a troca de senha", () => {
    expect(labels(menuFor({ role: "user" }))).toEqual(["Visão geral", "Conteúdo", "Página inicial", "Aparência", "Notificações", "Perfil", "Trocar a senha"]);
  });

  it("o administrador acrescenta só Usuários, ao fim (P-032: Configurações virou a Página inicial, de todos os papéis)", () => {
    expect(labels(menuFor({ role: "admin" }))).toEqual([
      "Visão geral", "Conteúdo", "Página inicial", "Aparência", "Notificações", "Perfil", "Trocar a senha", "Usuários",
    ]);
    expect(labels(menuFor({ role: "admin" }))).not.toContain("Configurações");
  });

  it("sem informar o papel, vale o de usuário comum (nunca o de administrador)", () => {
    expect(labels(menuFor({}))).not.toContain("Usuários");
    expect(labels(menuFor())).not.toContain("Usuários");
    expect(labels(menuFor({ role: /** @type {any} */ ("root") }))).not.toContain("Usuários");
  });

  it("com a senha provisória, só 'Trocar a senha', seja qual for o papel", () => {
    expect(labels(menuFor({ role: "user", mustChangePassword: true }))).toEqual(["Trocar a senha"]);
    expect(labels(menuFor({ role: "admin", mustChangePassword: true }))).toEqual(["Trocar a senha"]);
    expect(menuFor({ mustChangePassword: true })[0].href).toBe("/admin/senha");
  });

  it("Usuários é só do administrador; a Página inicial é de todos os papéis (P-032)", () => {
    expect(NAV_ITEMS.filter((item) => item.adminOnly).map((item) => item.href)).toEqual(["/admin/usuarios"]);
    expect(NAV_ITEMS.find((item) => item.href === "/admin/pagina-inicial")).toMatchObject({ label: "Página inicial" });
    expect(NAV_ITEMS.find((item) => item.href === "/admin/pagina-inicial")?.adminOnly).toBeUndefined();
  });
});

describe("AdminSidebar", () => {
  it("tem duas cópias da navegação (a recolhível e a lateral), com o mesmo menu", () => {
    render(<AdminSidebar role="admin" availablePaths={ALL} />);
    const [collapsible, side] = navs();
    expect(itemTexts(collapsible)).toEqual(itemTexts(side));
    expect(itemTexts(side)).toHaveLength(8);
    expect(collapsible.closest("details")).toBeTruthy();
  });

  it("o usuário comum vê a Página inicial e não vê Usuários; o administrador vê as duas", () => {
    const { unmount } = render(<AdminSidebar role="user" availablePaths={ALL} />);
    expect(screen.getAllByText("Página inicial")).toHaveLength(2);
    expect(screen.queryByText("Usuários", { exact: false })).toBeNull();
    unmount();
    render(<AdminSidebar role="admin" availablePaths={ALL} />);
    expect(screen.getAllByText("Página inicial")).toHaveLength(2);
    expect(screen.getAllByText("Usuários")).toHaveLength(2);
  });

  it("com a senha provisória, só 'Trocar a senha' (um link), sem o resto do menu", () => {
    render(<AdminSidebar role="admin" mustChangePassword availablePaths={ALL} />);
    for (const nav of navs()) {
      expect(itemTexts(nav)).toEqual(["Trocar a senha"]);
      expect(within(nav).getByRole("link", { name: "Trocar a senha", hidden: true }).getAttribute("href")).toBe("/admin/senha");
    }
    expect(screen.queryByText("Visão geral")).toBeNull();
    expect(screen.queryByText("Notificações")).toBeNull();
  });

  it("as páginas que existem são links; as que não existem aparecem como 'em breve', sem link", () => {
    render(<AdminSidebar role="user" />);
    const side = navs()[1];
    expect(within(side).getByRole("link", { name: "Visão geral" }).getAttribute("href")).toBe("/admin");
    expect(within(side).getByRole("link", { name: "Trocar a senha" }).getAttribute("href")).toBe("/admin/senha");
    for (const label of ["Conteúdo", "Página inicial", "Aparência", "Notificações", "Perfil"]) {
      const row = /** @type {HTMLElement} */ (within(side).getByText(label, { exact: false }).closest("li"));
      expect(row.textContent).toContain("em breve");
      expect(row.querySelector("a")).toBeNull();
    }
    expect(DEFAULT_AVAILABLE_PATHS).toEqual(["/admin", "/admin/senha"]);
  });

  it("availablePaths liga os itens que o Core já entregou", () => {
    render(<AdminSidebar role="admin" availablePaths={["/admin", "/admin/aparencia", "/admin/notificacoes", "/admin/pagina-inicial"]} />);
    const side = navs()[1];
    for (const [name, href] of [["Aparência", "/admin/aparencia"], ["Notificações", "/admin/notificacoes"], ["Página inicial", "/admin/pagina-inicial"]]) {
      expect(within(side).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
    expect(within(side).queryByRole("link", { name: "Usuários" })).toBeNull();
    expect(itemTexts(side).filter((text) => text?.includes("em breve"))).toHaveLength(4);
  });

  it("marca a página corrente com aria-current; subpáginas contam, mas a visão geral só na própria rota", () => {
    pathname = "/admin/notificacoes";
    const { unmount } = render(<AdminSidebar role="user" availablePaths={ALL} />);
    expect(within(navs()[1]).getByRole("link", { name: "Notificações" }).getAttribute("aria-current")).toBe("page");
    expect(within(navs()[1]).getByRole("link", { name: "Visão geral" }).getAttribute("aria-current")).toBeNull();
    unmount();
    pathname = "/admin/conteudo/abc123";
    render(<AdminSidebar role="user" availablePaths={ALL} />);
    expect(within(navs()[1]).getByRole("link", { name: "Conteúdo" }).getAttribute("aria-current")).toBe("page");
    expect(within(navs()[1]).getByRole("link", { name: "Visão geral" }).getAttribute("aria-current")).toBeNull();
  });

  it("o item da página corrente usa os tokens de destaque, e nenhum item usa cor fixa", () => {
    pathname = "/admin/senha";
    const { container } = render(<AdminSidebar role="user" />);
    const current = within(navs()[1]).getByRole("link", { name: "Trocar a senha" });
    expect(current.className).toMatch(/bg-primary/);
    expect(current.className).toMatch(/text-on-primary/);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });

  it("o botão do menu recolhível se chama Menu e a outra cópia fica oculta em telas estreitas", () => {
    render(<AdminSidebar role="user" />);
    expect(screen.getByText("Menu")).toBeTruthy();
    expect(navs()[0].closest("details")?.className).toMatch(/md:hidden/);
    expect(navs()[1].className).toMatch(/hidden/);
    expect(navs()[1].className).toMatch(/md:block/);
  });
});

describe("AdminShell", () => {
  const BELL = <div data-testid="sino">sino</div>;
  const shell = (/** @type {object} */ props = {}) =>
    render(
      <AdminShell user={USER} signOutAction={signOut} siteName="Vitrine" notificationBell={BELL} availablePaths={ALL} {...props}>
        <p>Conteúdo da página</p>
      </AdminShell>,
    );

  it("tem os marcos do painel: atalho, banner, navegação, main e o botão Sair", () => {
    shell();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "Navegação do painel", hidden: true })).toHaveLength(2);
    expect(within(screen.getByRole("main")).getByText("Conteúdo da página")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo-principal");
  });

  it("o sino fica na barra superior quando o Core o passa", () => {
    shell();
    expect(within(screen.getByRole("banner")).getByTestId("sino")).toBeTruthy();
  });

  it("sem sino, a barra continua como era", () => {
    shell({ notificationBell: undefined });
    expect(screen.queryByTestId("sino")).toBeNull();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
  });

  it("o papel e a senha provisória vêm das props", () => {
    shell({ role: "admin" });
    expect(screen.getAllByText("Usuários")).toHaveLength(2);
    cleanup();
    shell({ role: "admin", mustChangePassword: true });
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.getAllByText("Trocar a senha")).toHaveLength(2);
  });

  it("sem as props, o papel e a senha provisória saem do próprio usuário da sessão", () => {
    shell({ user: { ...USER, role: "admin" } });
    expect(screen.getAllByText("Usuários")).toHaveLength(2);
    cleanup();
    shell({ user: { ...USER, role: "user" } });
    expect(screen.queryByText("Usuários")).toBeNull();
    cleanup();
    shell({ user: { ...USER, role: "admin", mustChangePassword: true } });
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.getAllByText("Trocar a senha")).toHaveLength(2);
  });

  it("sem papel nenhum, nunca vira administrador", () => {
    shell();
    expect(screen.queryByText("Usuários")).toBeNull();
    cleanup();
    shell({ user: { ...USER, role: "outro" } });
    expect(screen.queryByText("Usuários")).toBeNull();
  });

  it("as props valem mais que o usuário", () => {
    shell({ user: { ...USER, role: "admin", mustChangePassword: true }, role: "user", mustChangePassword: false });
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.getAllByText("Visão geral")).toHaveLength(2);
  });

  it("com a senha provisória o sino NÃO é montado (a API de notificações responderia 403) e o Sair continua", () => {
    shell({ mustChangePassword: true });
    expect(screen.queryByTestId("sino")).toBeNull();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    cleanup();
    shell({ user: { ...USER, mustChangePassword: true } });
    expect(screen.queryByTestId("sino")).toBeNull();
  });

  it("repassa availablePaths ao menu", () => {
    shell({ availablePaths: ["/admin"] });
    expect(itemTexts(navs()[1]).filter((text) => text?.includes("em breve")).length).toBeGreaterThanOrEqual(4);
  });
});

describe("AdminHeader", () => {
  it("mostra o sino antes do usuário, só se existir", () => {
    const { rerender } = render(<AdminHeader siteName="Vitrine" user={USER} signOutAction={signOut} notificationBell={<span data-testid="sino" />} />);
    const header = screen.getByRole("banner");
    const bell = within(header).getByTestId("sino");
    const name = within(header).getByText("Ana Souza");
    expect(bell.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<AdminHeader siteName="Vitrine" user={USER} signOutAction={signOut} />);
    expect(screen.queryByTestId("sino")).toBeNull();
  });
});
