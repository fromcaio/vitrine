// @vitest-environment jsdom
// P-024, itens 3 e 4: o botão de modo claro/escuro sem envoltório na Navbar e no AdminHeader (o fundo fica
// só dentro do botão) e o cabeçalho do espaço como um bloco só, sem borda entre o nome e as coleções e sem
// faixa embaixo, separado do conteúdo por uma sombra (classe do globals.css, sem cor fixa).
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Navbar } from "@/components/layout/Navbar";

afterEach(cleanup);

const ITEMS = [
  { id: "a", label: "Cálculo", href: "/maria/calculo", current: true },
  { id: "b", label: "Álgebra", href: "/maria/algebra", current: false },
];
const TOGGLE = { name: /^Mudar para o modo/ };

/** As classes do elemento, em lista. */
const classesOf = (/** @type {Element} */ node) => [...node.classList];

describe("o botão de modo sem envoltório (item 3)", () => {
  it("Navbar: o botão é filho direto da linha da barra, sem <div> com fundo em volta", () => {
    render(<Navbar name="Espaço" homeHref="/maria" items={ITEMS} adminLink={false} />);
    const button = screen.getByRole("button", TOGGLE);
    const row = /** @type {HTMLElement} */ (button.parentElement);
    expect(row.tagName).toBe("DIV");
    expect(classesOf(row)).toContain("flex");
    expect(classesOf(row)).not.toContain("bg-background");
    expect(classesOf(row)).not.toContain("p-1");
    // O fundo é do próprio botão, com borda e texto neutros.
    expect(classesOf(button)).toEqual(expect.arrayContaining(["bg-background", "text-foreground", "border", "border-border-strong"]));
  });

  it("AdminHeader: o botão é filho direto do <header>", () => {
    render(<AdminHeader siteName="Casa" user={{ name: "Maria", email: "m@exemplo.test" }} signOutAction={vi.fn()} />);
    const button = screen.getByRole("button", TOGGLE);
    expect(button.parentElement?.tagName).toBe("HEADER");
    expect(screen.getByRole("banner").innerHTML).not.toContain("p-1");
  });

  it("nos dois cabeçalhos, nenhum envoltório com bg-background e p-1 contém o botão", () => {
    const first = render(<Navbar name="Espaço" homeHref="/maria" adminLink={false} />);
    expect(first.container.querySelector(".bg-background.p-1")).toBeNull();
    first.unmount();
    const second = render(<AdminHeader siteName="Casa" user={{ name: "Maria", email: "m@exemplo.test" }} signOutAction={vi.fn()} />);
    expect(second.container.querySelector(".bg-background.p-1")).toBeNull();
  });

  it("o alvo de toque tem pelo menos 40 px (size-10) e o foco/hover são do botão", () => {
    render(<Navbar name="Espaço" homeHref="/maria" adminLink={false} />);
    const button = screen.getByRole("button", TOGGLE);
    expect(classesOf(button)).toEqual(expect.arrayContaining(["size-10", "hover:border-foreground", "hover:bg-surface"]));
  });
});

describe("o cabeçalho do espaço, um bloco só com sombra (item 4)", () => {
  it("sem a faixa de baixo (border-b-4 border-accent) e sem a linha entre o nome e as coleções (border-t)", () => {
    render(<Navbar name="Espaço" homeHref="/maria" items={ITEMS} adminLink={false} />);
    const header = screen.getByRole("banner");
    // (A borda das setas da faixa, `border-on-secondary/40`, é do botão, não do cabeçalho: só a linha antiga, `/30`, vale aqui.)
    expect(header.innerHTML).not.toMatch(/border-b-4|border-accent|border-t|border-on-secondary[/]30/);
    // O innerHTML não inclui as classes do próprio <header>: confere-as à parte.
    expect(classesOf(header).filter((name) => name.startsWith("border"))).toEqual([]);
    const nav = within(header).getByRole("navigation", { name: "Coleções" });
    expect(classesOf(nav).some((name) => name.startsWith("border"))).toBe(false);
  });

  it("os dois blocos têm o mesmo fundo (só o cabeçalho tem bg-secondary) e a sombra vem da classe vitrine-cabecalho", () => {
    render(<Navbar name="Espaço" homeHref="/maria" items={ITEMS} adminLink={false} />);
    const header = screen.getByRole("banner");
    expect(classesOf(header)).toEqual(expect.arrayContaining(["vitrine-cabecalho", "bg-secondary", "text-on-secondary", "relative", "z-10"]));
    // Nenhum filho tem fundo próprio: a primeira linha e as coleções são o mesmo bloco.
    expect(header.querySelectorAll(".bg-secondary")).toHaveLength(0);
    // Sem rolagem fixa: não foi pedido.
    expect(classesOf(header)).not.toContain("sticky");
  });

  it("sem coleções o cabeçalho é só a primeira linha, com a mesma sombra", () => {
    render(<Navbar name="Espaço" homeHref="/maria" adminLink={false} />);
    expect(screen.queryByRole("navigation", { name: "Coleções" })).toBeNull();
    expect(classesOf(screen.getByRole("banner"))).toContain("vitrine-cabecalho");
  });

  it("o item corrente continua distinto por aria-current, negrito e sublinhado (WCAG 1.4.1)", () => {
    render(<Navbar name="Espaço" homeHref="/maria" items={ITEMS} adminLink={false} />);
    const current = screen.getByRole("link", { name: "Cálculo" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(classesOf(current)).toEqual(expect.arrayContaining(["font-semibold", "underline", "decoration-2"]));
    expect(screen.getByRole("link", { name: "Álgebra" }).getAttribute("aria-current")).toBeNull();
  });

  it("o AdminHeader mantém o leiaute atual: sem a sombra do espaço", () => {
    render(<AdminHeader siteName="Casa" user={{ name: "Maria", email: "m@exemplo.test" }} signOutAction={vi.fn()} />);
    expect(classesOf(screen.getByRole("banner"))).not.toContain("vitrine-cabecalho");
  });
});

describe("a sombra no globals.css", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  /** O corpo da regra que começa em `selector {` (sem expressão regular: nada a escapar). */
  const rule = (/** @type {string} */ selector) => {
    const start = css.indexOf(`${selector} {`);
    return start < 0 ? null : css.slice(start, css.indexOf("}", start));
  };

  it("claro suave e noturno mais forte, em preto translúcido (nenhuma cor de tema fixa)", () => {
    const light = rule(".vitrine-cabecalho");
    const dark = rule(".dark .vitrine-cabecalho,\n.vitrine-modo-escuro .vitrine-cabecalho");
    expect(light).toMatch(/box-shadow:[^;]*rgb\(0 0 0 \/ 0\.1\)/);
    expect(dark).toMatch(/box-shadow: 0 2px 12px rgb\(0 0 0 \/ 0\.4\)/);
    expect(`${light}${dark}`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("os modos forçados da pré-visualização vêm depois da regra .dark (a última vale)", () => {
    const dark = css.indexOf(".dark .vitrine-cabecalho");
    const forcedLight = css.indexOf(".vitrine-modo-claro .vitrine-cabecalho");
    expect(dark).toBeGreaterThan(-1);
    expect(forcedLight).toBeGreaterThan(dark);
    expect(css).toContain(".vitrine-modo-escuro .vitrine-cabecalho");
  });
});
