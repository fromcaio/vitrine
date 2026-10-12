// @vitest-environment jsdom
// Visão geral do painel (RF03, RF28, RF29, RF33; RN20, RN25; M10): identificação da sessão, números do
// espaço, atalhos por papel (e "em breve" para o que ainda não existe) e o aviso de quem não tem handle.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminOverview } from "@/components/admin/AdminOverview";

afterEach(cleanup);

const USER = { name: "Ana Souza", email: "ana@exemplo.com", handle: "ana", role: /** @type {const} */ ("user") };
const COUNTS = { contents: 12, published: 9, drafts: 3 };
const ALL_PATHS = ["/admin", "/admin/conteudo", "/admin/aparencia", "/admin/notificacoes", "/admin/perfil", "/admin/senha", "/admin/pagina-inicial", "/admin/usuarios"];

/** O valor mostrado em um cartão de número. @param {string} label */
const stat = (label) => {
  const term = screen.getByText(label, { selector: "dt" });
  return /** @type {HTMLElement} */ (term.nextElementSibling).textContent;
};

describe("identificação", () => {
  it("mostra o nome e o e-mail da sessão como texto", () => {
    render(<AdminOverview user={{ ...USER, name: "<b>Ana</b>" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Visão geral" })).toBeTruthy();
    expect(screen.getByText("<b>Ana</b>", { selector: "strong" })).toBeTruthy();
    expect(document.querySelector("strong b")).toBeNull();
  });

  it("só com o usuário (como o Core ainda passa): mostra a identificação e os atalhos, sem números", () => {
    render(<AdminOverview user={USER} />);
    expect(screen.queryByText("Seu espaço em números")).toBeNull();
    expect(screen.getByRole("heading", { name: "Atalhos" })).toBeTruthy();
  });
});

describe("números", () => {
  it("conteúdos de quanto da cota, publicados, rascunhos e não lidas", () => {
    render(<AdminOverview user={USER} counts={COUNTS} limits={{ maxContents: 500 }} unreadCount={4} />);
    expect(stat("Conteúdos")).toBe("12 de 500");
    expect(stat("Publicados")).toBe("9");
    expect(stat("Rascunhos")).toBe("3");
    expect(stat("Notificações não lidas")).toBe("4");
    expect(screen.getByText("2% da cota usada.")).toBeTruthy();
  });

  it("sem unreadCount, não há cartão de notificações; com zero, mostra 0", () => {
    const { unmount } = render(<AdminOverview user={USER} counts={COUNTS} />);
    expect(screen.queryByText("Notificações não lidas")).toBeNull();
    unmount();
    render(<AdminOverview user={USER} counts={COUNTS} unreadCount={0} />);
    expect(stat("Notificações não lidas")).toBe("0");
  });

  it("sem limite informado, não inventa cota nem porcentagem", () => {
    render(<AdminOverview user={USER} counts={COUNTS} />);
    expect(stat("Conteúdos")).toBe("12");
    expect(screen.queryByText(/da cota usada/)).toBeNull();
  });

  it("no limite: avisa, e a barra não passa de 100%", () => {
    const { container } = render(<AdminOverview user={USER} counts={{ contents: 520, published: 500, drafts: 20 }} limits={{ maxContents: 500 }} />);
    expect(screen.getByText(/Você atingiu o limite de 500 conteúdos/)).toBeTruthy();
    expect(screen.getByText("100% da cota usada.")).toBeTruthy();
    expect(/** @type {HTMLElement} */ (container.querySelector("[style]")).style.width).toBe("100%");
  });

  it("espaço vazio: zeros, sem erro de divisão", () => {
    render(<AdminOverview user={USER} counts={{ contents: 0, published: 0, drafts: 0 }} limits={{ maxContents: 500 }} />);
    expect(stat("Conteúdos")).toBe("0 de 500");
    expect(screen.getByText("0% da cota usada.")).toBeTruthy();
  });

  it("a barra é decorativa: o número está em texto", () => {
    const { container } = render(<AdminOverview user={USER} counts={COUNTS} limits={{ maxContents: 500 }} />);
    expect(container.querySelector("[style]")?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("aviso de quem não tem handle (RN20)", () => {
  it("sem handle: o aviso diz que o espaço público não existe", () => {
    render(<AdminOverview user={{ ...USER, handle: null }} />);
    expect(screen.getByText("não existe", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/ainda não tem um/).textContent).toMatch(/espaço público/);
    expect(screen.getByText(/Peça ao administrador/)).toBeTruthy();
  });

  it("handle vazio também conta como sem handle", () => {
    render(<AdminOverview user={{ ...USER, handle: "" }} />);
    expect(screen.getByText(/Peça ao administrador/)).toBeTruthy();
  });

  it("com handle: sem aviso; com spaceHref, o link para o espaço", () => {
    const { unmount } = render(<AdminOverview user={USER} />);
    expect(screen.queryByText(/Peça ao administrador/)).toBeNull();
    expect(screen.queryByRole("link", { name: "/ana" })).toBeNull();
    unmount();
    render(<AdminOverview user={USER} spaceHref="/ana" />);
    expect(screen.getByRole("link", { name: "/ana" }).getAttribute("href")).toBe("/ana");
  });
});

describe("atalhos", () => {
  const links = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

  it("usuário comum: as seis seções dele (a Página inicial entre elas), e nenhuma de administrador", () => {
    render(<AdminOverview user={USER} availablePaths={ALL_PATHS} />);
    expect(links()).toEqual(["/admin/conteudo", "/admin/pagina-inicial", "/admin/aparencia", "/admin/notificacoes", "/admin/perfil", "/admin/senha"]);
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.queryByText("Configurações")).toBeNull();
  });

  it("administrador: também Usuários (a Configurações virou a Página inicial, de todos)", () => {
    render(<AdminOverview user={{ ...USER, role: "admin" }} availablePaths={ALL_PATHS} />);
    expect(links()).toContain("/admin/pagina-inicial");
    expect(links()).toContain("/admin/usuarios");
    expect(links()).not.toContain("/admin/configuracoes");
  });

  it("uma página que ainda não existe aparece sem link e com 'em breve'", () => {
    render(<AdminOverview user={USER} availablePaths={["/admin", "/admin/senha"]} />);
    expect(links()).toEqual(["/admin/senha"]);
    const item = /** @type {HTMLElement} */ (screen.getByText("Conteúdo", { selector: "span" }).closest("li"));
    expect(within(item).getByText("em breve")).toBeTruthy();
  });

  it("sem availablePaths, todos os atalhos ficam 'em breve' (nada leva a uma página inexistente)", () => {
    render(<AdminOverview user={USER} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getAllByText("em breve")).toHaveLength(6);
  });
});

describe("tema", () => {
  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<AdminOverview user={USER} counts={COUNTS} limits={{ maxContents: 500 }} unreadCount={1} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate|green)-\d/);
  });
});
