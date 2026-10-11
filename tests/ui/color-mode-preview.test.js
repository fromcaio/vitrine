// @vitest-environment jsdom
// P-024, item 6: a pré-visualização da aparência mostra o botão de modo claro/escuro SÓ COMO IMAGEM
// (`ColorModeToggleStatic`): o ícone do modo para o qual o botão leva, o par de ícones do site, o mesmo
// tamanho e aparência do botão real, dentro do `inert`, sem foco, sem ler nem escrever o cookie e sem mexer
// na classe `dark` do <html> (o botão real faz tudo isso e quebraria a página).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});
vi.mock("@/components/markdown/MarkdownRenderer", async () => {
  const { createElement } = await import("react");
  return { MarkdownRenderer: ({ markdown }) => createElement("div", { "data-testid": "renderizado" }, markdown) };
});

import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { PalettePreview } from "@/components/admin/PalettePreview";
import { SiteIdentityForm } from "@/components/admin/SiteIdentityForm";
import { ColorModeToggle } from "@/components/layout/ColorModeToggle";
import { ColorModeToggleStatic } from "@/components/layout/ColorModeToggleStatic";
import { COLOR_MODE_TOGGLE_LOOK } from "@/components/layout/color-mode-toggle-style";
import { MODE_ICON_PAIRS } from "@/components/layout/mode-icon-names";
import { modeIconsOf } from "@/components/layout/mode-icon-pairs";
import { DEFAULT_PALETTES } from "@/lib/theme";

const SAMPLE = { "--vitrine-light-primary": "#2563eb" };
const RECORD = { siteName: "Espaço da Maria", siteDescription: null, ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark };

beforeEach(() => {
  document.cookie = "vitrine-modo=; Path=/; Max-Age=0";
  document.documentElement.classList.remove("dark");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.cookie = "vitrine-modo=; Path=/; Max-Age=0";
  document.documentElement.classList.remove("dark");
});

/** O desenho (o HTML do SVG) de um ícone do par. */
const drawing = (/** @type {(props: object) => import("react").ReactElement} */ Icon) => render(<Icon />).container.innerHTML;

/** A imagem do botão dentro de uma amostra. */
const sampleButton = (/** @type {"claro" | "noturno"} */ mode) =>
  /** @type {HTMLElement} */ (within(screen.getByRole("group", { name: `Pré-visualização do modo ${mode}` })).getByTestId("botao-de-modo-amostra"));

describe("ColorModeToggleStatic", () => {
  it("na amostra clara mostra o ícone do ESCURO; na escura, o do CLARO (para onde o botão leva), em cada par", () => {
    for (const pair of MODE_ICON_PAIRS) {
      const { Light, Dark } = modeIconsOf(pair);
      const light = render(<ColorModeToggleStatic mode="light" iconPair={pair} />);
      expect(light.container.firstElementChild?.innerHTML, pair).toBe(drawing(Dark));
      light.unmount();
      const dark = render(<ColorModeToggleStatic mode="dark" iconPair={pair} />);
      expect(dark.container.firstElementChild?.innerHTML, pair).toBe(drawing(Light));
      dark.unmount();
    }
  });

  it("sem par (ou com um desconhecido) vale sun_moon", () => {
    const { Dark } = modeIconsOf("sun_moon");
    for (const iconPair of [undefined, "roxo", ""]) {
      const { container, unmount } = render(<ColorModeToggleStatic mode="light" iconPair={iconPair} />);
      expect(container.firstElementChild?.innerHTML).toBe(drawing(Dark));
      unmount();
    }
  });

  it("é só uma imagem: aria-hidden, sem botão, sem tabindex e sem nome acessível", () => {
    render(<ColorModeToggleStatic mode="light" />);
    const image = screen.getByTestId("botao-de-modo-amostra");
    expect(image.getAttribute("aria-hidden")).toBe("true");
    expect(image.tagName).toBe("SPAN");
    expect(image.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tem o mesmo tamanho e a mesma aparência do botão real (as mesmas classes de base, size-10 incluso)", () => {
    const real = render(<ColorModeToggle />).container.querySelector("button");
    const image = render(<ColorModeToggleStatic mode="light" />).getByTestId("botao-de-modo-amostra");
    for (const name of COLOR_MODE_TOGGLE_LOOK.split(" ")) {
      expect(real?.classList.contains(name), `botão real: ${name}`).toBe(true);
      expect(image.classList.contains(name), `imagem: ${name}`).toBe(true);
    }
    expect(image.classList.contains("size-10")).toBe(true);
    // Sem o que é de botão: ponteiro e hover.
    expect(image.className).not.toMatch(/cursor-pointer|hover:/);
  });

  it("NÃO lê nem escreve o cookie e NÃO toca na classe dark do <html> (nenhuma escolha, nenhuma classe)", () => {
    const cookieWrites = vi.spyOn(document, "cookie", "set");
    const cookieReads = vi.spyOn(document, "cookie", "get");
    const classToggle = vi.spyOn(document.documentElement.classList, "toggle");
    const classAdd = vi.spyOn(document.documentElement.classList, "add");
    const classRemove = vi.spyOn(document.documentElement.classList, "remove");
    for (const mode of /** @type {const} */ (["light", "dark"])) {
      const { unmount } = render(<ColorModeToggleStatic mode={mode} iconPair="lightbulb" />);
      unmount();
    }
    expect(cookieWrites).not.toHaveBeenCalled();
    expect(cookieReads).not.toHaveBeenCalled();
    expect(classToggle).not.toHaveBeenCalled();
    expect(classAdd).not.toHaveBeenCalled();
    expect(classRemove).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("com o <html> já escuro e o cookie 'dark', a imagem não muda nem um nem outro", () => {
    document.cookie = "vitrine-modo=dark; Path=/";
    document.documentElement.classList.add("dark");
    render(<ColorModeToggleStatic mode="light" />);
    expect(document.cookie).toContain("vitrine-modo=dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("não assina nenhum evento (o botão real escuta o foco e o evento de modo)", () => {
    const listen = vi.spyOn(window, "addEventListener");
    render(<ColorModeToggleStatic mode="dark" />);
    expect(listen).not.toHaveBeenCalled();
  });
});

describe("PalettePreview com o botão", () => {
  it("cada amostra mostra a imagem do botão (a clara com o ícone do escuro e a escura com o do claro), dentro do inert", () => {
    const { Light, Dark } = modeIconsOf("lightbulb");
    render(
      <div>
        <PalettePreview mode="light" id="a" name="X" themeStyle={SAMPLE} modeIconPair="lightbulb" />
        <PalettePreview mode="dark" id="b" name="X" themeStyle={SAMPLE} modeIconPair="lightbulb" />
      </div>,
    );
    const light = sampleButton("claro");
    const dark = sampleButton("noturno");
    expect(light.getAttribute("data-mode")).toBe("light");
    expect(dark.getAttribute("data-mode")).toBe("dark");
    expect(light.innerHTML).toBe(drawing(Dark));
    expect(dark.innerHTML).toBe(drawing(Light));
    for (const image of [light, dark]) {
      expect(image.closest("[inert]")).not.toBeNull();
      expect(image.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("nenhum botão de modo REAL na amostra, e a página não é tocada (cookie e classe dark)", () => {
    render(<PalettePreview mode="dark" id="b" name="X" themeStyle={SAMPLE} />);
    expect(screen.queryByRole("button", { name: /^Mudar para o modo/ })).toBeNull();
    expect(document.cookie).not.toContain("vitrine-modo");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("sem modeIconPair vale o Sol e a lua", () => {
    render(<PalettePreview mode="light" id="a" name="X" themeStyle={SAMPLE} />);
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("sun_moon").Dark));
  });
});

describe("a prop chega à amostra pelos formulários", () => {
  it("na aparência do USUÁRIO, vem da prop modeIconPair (opcional): o par do site; sem ela, Sol e lua", () => {
    const first = render(<AppearanceForm initial={RECORD} modeIconPair="contrast_half" />);
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("contrast_half").Dark));
    expect(sampleButton("noturno").innerHTML).toBe(drawing(modeIconsOf("contrast_half").Light));
    first.unmount();
    render(<AppearanceForm initial={RECORD} />);
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("sun_moon").Dark));
  });

  it("na tela do SISTEMA, a amostra acompanha o que está selecionado no seletor de ícones", () => {
    render(<SiteIdentityForm initial={{ ...RECORD, modeIconPair: "sun_moon" }} />);
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("sun_moon").Dark));
    const group = screen.getByRole("group", { name: /Ícones do botão de modo/ });
    fireEvent.click(within(group).getByRole("radio", { name: "Lâmpada acesa e apagada" }));
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("lightbulb").Dark));
    expect(sampleButton("noturno").innerHTML).toBe(drawing(modeIconsOf("lightbulb").Light));
    fireEvent.click(within(group).getByRole("radio", { name: "Círculo meio cheio" }));
    expect(sampleButton("claro").innerHTML).toBe(drawing(modeIconsOf("contrast_half").Dark));
  });

  it("o desenho do botão na página (real) e o da amostra são o mesmo ícone do mesmo modo-alvo", () => {
    const real = render(<ColorModeToggle iconPair="sun_moon_outline" />).container.querySelector("button svg")?.outerHTML;
    cleanup();
    render(<ColorModeToggleStatic mode="light" iconPair="sun_moon_outline" />);
    // Página clara: o botão real leva ao escuro, como a amostra clara.
    expect(screen.getByTestId("botao-de-modo-amostra").querySelector("svg")?.outerHTML).toBe(real);
  });
});
