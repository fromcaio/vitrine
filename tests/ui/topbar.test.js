// @vitest-environment jsdom
// Barra superior (A-027, item 10 do épico v1; D-34, ADR-037): `showLogo` e `showName` na Navbar, no
// cabeçalho do painel e no cartão do login (as três combinações, o logo ANTES do nome, o logo
// embutido `DefaultLogo` quando não há imagem); o nome do site no painel leva a `/`; o botão de modo
// entra no painel; o título do diretório (D-38).
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminShell } from "@/components/admin/AdminShell";
import { LoginBrand } from "@/components/admin/LoginBrand";
import { DefaultLogo } from "@/components/layout/DefaultLogo";
import { Navbar } from "@/components/layout/Navbar";
import { PortalDirectory } from "@/components/layout/PortalDirectory";
import { PortalHome } from "@/components/layout/PortalHome";
import { SiteBrand } from "@/components/layout/SiteBrand";
import { SpaceLayout } from "@/components/layout/SpaceLayout";

afterEach(cleanup);

const USER = { name: "Maria", email: "maria@exemplo.test" };
const LOGO = "/media/abc123";

/** Os elementos da marca (logo e nome) na ordem do documento. */
const brandParts = (/** @type {HTMLElement} */ link) => [...link.querySelectorAll("img, svg, span")].map((el) => (el.tagName === "SPAN" ? "nome" : "logo"));

describe("SiteBrand: as três combinações (D-34)", () => {
  it("os dois ligados (padrão): o logo ANTES do nome", () => {
    const { container } = render(<div><SiteBrand name="Espaço da Maria" logoUrl={LOGO} /></div>);
    const parts = [...container.firstElementChild.children].map((el) => el.tagName.toLowerCase());
    expect(parts).toEqual(["img", "span"]);
    expect(screen.getByText("Espaço da Maria")).toBeTruthy();
    expect(container.querySelector("img").getAttribute("src")).toBe(LOGO);
  });

  it("só o logo: o nome some do texto e o logo ganha o nome como alt (o link continua tendo nome)", () => {
    const { container } = render(<SiteBrand name="Espaço da Maria" logoUrl={LOGO} showName={false} />);
    expect(screen.queryByText("Espaço da Maria")).toBeNull();
    expect(container.querySelector("img").getAttribute("alt")).toBe("Espaço da Maria");
  });

  it("só o nome: nenhuma imagem nem desenho", () => {
    const { container } = render(<SiteBrand name="Espaço da Maria" logoUrl={LOGO} showLogo={false} />);
    expect(container.querySelector("img, svg")).toBeNull();
    expect(screen.getByText("Espaço da Maria")).toBeTruthy();
  });

  it("os dois desligados (não deveria chegar): o nome aparece, a marca nunca fica vazia", () => {
    const { container } = render(<SiteBrand name="Espaço da Maria" logoUrl={LOGO} showLogo={false} showName={false} />);
    expect(screen.getByText("Espaço da Maria")).toBeTruthy();
    expect(container.querySelector("img, svg")).toBeNull();
  });

  it("sem imagem, o logo é o DefaultLogo (sempre existe um logo)", () => {
    const { container } = render(<SiteBrand name="Espaço da Maria" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("logo-padrao")).toBeTruthy();
    expect(screen.getByText("Espaço da Maria")).toBeTruthy();
  });

  it("sem imagem e sem nome: o DefaultLogo carrega o nome acessível", () => {
    render(<SiteBrand name="Espaço da Maria" showName={false} />);
    expect(screen.getByRole("img", { name: "Espaço da Maria" })).toBeTruthy();
  });

  it("com o nome ao lado, o desenho é decorativo (aria-hidden) e a imagem tem alt vazio", () => {
    const { container, unmount } = render(<SiteBrand name="X" />);
    expect(screen.getByTestId("logo-padrao").getAttribute("aria-hidden")).toBe("true");
    unmount();
    const second = render(<SiteBrand name="X" logoUrl={LOGO} />);
    expect(second.container.querySelector("img").getAttribute("alt")).toBe("");
    expect(container).toBeTruthy();
  });

  it("a imagem tem tamanho fixo (sem salto de layout) e o nome é sempre texto escapado", () => {
    const { container } = render(<SiteBrand name={"<img src=x onerror=alert(1)>"} logoUrl={LOGO} />);
    const img = container.querySelector("img");
    expect(img.getAttribute("width")).toBe("36");
    expect(img.getAttribute("height")).toBe("36");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("DefaultLogo", () => {
  it("usa só currentColor (as cores do tema), sem cor fixa nem arquivo", () => {
    const { container } = render(<DefaultLogo />);
    const html = container.innerHTML;
    expect(html).toContain("currentColor");
    expect(html).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|<image|href=/i);
  });
});

describe("Navbar (o espaço, o portal e o documento)", () => {
  it("o logo vem antes do nome dentro do link do início", () => {
    render(<Navbar name="Espaço da Maria" homeHref="/maria" logoUrl={LOGO} />);
    const link = screen.getByRole("link", { name: "Espaço da Maria" });
    expect(link.getAttribute("href")).toBe("/maria");
    expect(brandParts(link)).toEqual(["logo", "nome"]);
  });

  it("sem logo enviado, mostra o DefaultLogo na barra", () => {
    render(<Navbar name="Espaço da Maria" homeHref="/maria" />);
    expect(within(screen.getByRole("banner")).getByTestId("logo-padrao")).toBeTruthy();
  });

  it("showLogo=false esconde o logo; showName=false esconde o nome, e o link segue com nome", () => {
    const { rerender } = render(<Navbar name="Espaço da Maria" homeHref="/maria" logoUrl={LOGO} showLogo={false} />);
    expect(screen.getByRole("banner").querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Espaço da Maria" })).toBeTruthy();
    rerender(<Navbar name="Espaço da Maria" homeHref="/maria" logoUrl={LOGO} showName={false} />);
    expect(screen.queryByText("Espaço da Maria")).toBeNull();
    expect(screen.getByRole("link", { name: "Espaço da Maria" })).toBeTruthy();
  });

  it("repassa o par de ícones ao botão de modo", () => {
    const { rerender } = render(<Navbar name="X" homeHref="/x" modeIconPair="lightbulb" />);
    const lightbulb = screen.getAllByRole("button").map((b) => b.innerHTML);
    rerender(<Navbar name="X" homeHref="/x" modeIconPair="sun_moon" />);
    expect(screen.getAllByRole("button").map((b) => b.innerHTML)).not.toEqual(lightbulb);
  });

  it("o SpaceLayout repassa showLogo, showName e logoUrl à barra", () => {
    render(
      <SpaceLayout name="Espaço" homeHref="/e" logoUrl={LOGO} showName={false}>
        <p>x</p>
      </SpaceLayout>,
    );
    const header = screen.getByRole("banner");
    expect(header.querySelector("img").getAttribute("src")).toBe(LOGO);
    expect(within(header).queryByText("Espaço")).toBeNull();
  });

  it("o link Administração está na barra para quem tem o marcador de sessão, e a pré-visualização o omite", async () => {
    document.cookie = "vitrine-logado=1; Path=/";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { id: "u" } }), { status: 200 })));
    try {
      const first = render(<Navbar name="X" homeHref="/x" />);
      expect((await screen.findByRole("link", { name: "Administração" })).getAttribute("href")).toBe("/admin");
      first.unmount();
      render(<Navbar name="X" homeHref="/x" adminLink={false} />);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
      cleanup();
      render(<SpaceLayout name="X" homeHref="/x" modeToggle={false}><p>x</p></SpaceLayout>);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
    } finally {
      document.cookie = "vitrine-logado=; Path=/; Max-Age=0";
      vi.unstubAllGlobals();
    }
  });

  it("a pré-visualização (modeToggle=false) não leva o botão de modo nem o link de administração", () => {
    render(<Navbar name="X" homeHref="/x" modeToggle={false} adminLink={false} />);
    expect(screen.queryByRole("group", { name: "Modo de cor" })).toBeNull();
  });
});

describe("AdminHeader (o painel)", () => {
  const header = (/** @type {object} */ props = {}) =>
    render(<AdminHeader siteName="Vitrine da Casa" user={USER} signOutAction={vi.fn()} {...props} />);

  it("a marca do site leva a / (e não mais a /admin), com o logo antes do nome e 'Painel' depois", () => {
    header({ logoUrl: LOGO });
    const brand = screen.getByRole("link", { name: /Vitrine da Casa/ });
    expect(brand.getAttribute("href")).toBe("/");
    expect(brandParts(brand)).toEqual(["logo", "nome", "nome"]);
    expect(brand.textContent).toContain("Painel");
    expect(screen.queryAllByRole("link").filter((link) => link.getAttribute("href") === "/admin")).toHaveLength(0);
  });

  it("sem logo enviado, mostra o DefaultLogo", () => {
    header();
    expect(screen.getByTestId("logo-padrao")).toBeTruthy();
  });

  it("só o nome / só o logo", () => {
    const first = header({ logoUrl: LOGO, showLogo: false });
    expect(first.container.querySelector("img, svg[data-testid='logo-padrao']")).toBeNull();
    expect(screen.getByText("Vitrine da Casa")).toBeTruthy();
    first.unmount();
    header({ logoUrl: LOGO, showName: false });
    expect(screen.queryByText("Vitrine da Casa")).toBeNull();
    expect(screen.getByRole("link", { name: /Vitrine da Casa/ })).toBeTruthy();
  });

  it("tem o botão de modo claro/escuro (item 7), com o par de ícones do site", () => {
    const first = header({ modeIconPair: "contrast_half" });
    const group = screen.getByRole("group", { name: "Modo de cor" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    const contrast = group.innerHTML;
    first.unmount();
    header({ modeIconPair: "sun_moon" });
    expect(screen.getByRole("group", { name: "Modo de cor" }).innerHTML).not.toBe(contrast);
  });

  it("modeToggle=false o omite", () => {
    header({ modeToggle: false });
    expect(screen.queryByRole("group", { name: "Modo de cor" })).toBeNull();
  });

  it("o AdminShell repassa a marca e o par de ícones ao cabeçalho", () => {
    render(
      <AdminShell user={{ ...USER, role: "user" }} signOutAction={vi.fn()} siteName="Casa" logoUrl={LOGO} showName={false} modeIconPair="lightbulb">
        <p>x</p>
      </AdminShell>,
    );
    const banner = screen.getByRole("banner");
    expect(banner.querySelector("img").getAttribute("src")).toBe(LOGO);
    expect(within(banner).getByRole("group", { name: "Modo de cor" })).toBeTruthy();
    expect(within(banner).queryByText("Casa")).toBeNull();
  });
});

describe("LoginBrand (o cartão do /login)", () => {
  it("os dois ligados: logo antes do nome; sem imagem, o logo padrão", () => {
    const { container } = render(<LoginBrand name="Vitrine da Casa" logoUrl={LOGO} />);
    expect([...container.querySelector("[data-testid='marca-do-login']").children].map((el) => el.tagName.toLowerCase())).toEqual(["img", "span"]);
    cleanup();
    render(<LoginBrand name="Vitrine da Casa" />);
    expect(screen.getByTestId("logo-padrao")).toBeTruthy();
  });

  it("só o nome e só o logo", () => {
    const first = render(<LoginBrand name="Vitrine da Casa" logoUrl={LOGO} showLogo={false} />);
    expect(first.container.querySelector("img, svg")).toBeNull();
    expect(screen.getByText("Vitrine da Casa")).toBeTruthy();
    first.unmount();
    const second = render(<LoginBrand name="Vitrine da Casa" logoUrl={LOGO} showName={false} />);
    expect(screen.queryByText("Vitrine da Casa")).toBeNull();
    expect(second.container.querySelector("img").getAttribute("alt")).toBe("Vitrine da Casa");
  });
});

describe("título do diretório (D-38)", () => {
  const SPACES = [{ id: "1", handle: "maria", name: "Maria", description: null }];

  it("o PortalDirectory usa 'Espaços' por padrão", () => {
    render(<PortalDirectory spaces={SPACES} />);
    expect(screen.getByRole("heading", { level: 2, name: "Espaços" })).toBeTruthy();
  });

  it("o PortalHome passa o directoryTitle ao diretório", () => {
    render(<PortalHome title="Vitrine" spaces={SPACES} directoryTitle="Pessoas e projetos" />);
    expect(screen.getByRole("heading", { level: 2, name: "Pessoas e projetos" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Espaços" })).toBeNull();
  });

  it("sem directoryTitle (ou vazio) vale o padrão", () => {
    const first = render(<PortalHome title="Vitrine" spaces={SPACES} />);
    expect(screen.getByRole("heading", { level: 2, name: "Espaços" })).toBeTruthy();
    first.unmount();
    render(<PortalHome title="Vitrine" spaces={SPACES} directoryTitle="" />);
    expect(screen.getByRole("heading", { level: 2, name: "Espaços" })).toBeTruthy();
  });

  it("o título é sempre texto escapado", () => {
    render(<PortalHome title="Vitrine" spaces={SPACES} directoryTitle={"<b>negrito</b>"} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("<b>negrito</b>");
    expect(document.querySelector("h2 b")).toBeNull();
  });

  it("sem diretório (spaces nulo), o título nem aparece", () => {
    render(<PortalHome title="Vitrine" spaces={null} directoryTitle="Pessoas" />);
    expect(screen.queryByText("Pessoas")).toBeNull();
  });
});
