// @vitest-environment jsdom
// Modo de cor do leitor (RF32, RN27, D-33, D-35, ADR-036; CT47, parte de unidade): o cookie
// `vitrine-modo`, o script do <head> (que aplica a classe .dark antes da primeira pintura) e o botão
// Claro/Escuro de DOIS estados (sem "automático") com o par de ícones. A primeira pintura sem piscar e
// a CSP são verificadas no navegador, sobre o build de produção.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorModeToggle } from "@/components/layout/ColorModeToggle";
import {
  COLOR_MODE_COOKIE,
  COLOR_MODE_MAX_AGE,
  COLOR_MODE_SCRIPT,
  modeCookieString,
  readModeCookie,
  wantsDark,
} from "@/components/layout/color-mode-script";
import { MODE_ICON_PAIRS, MODE_ICON_PAIR_OPTIONS, modeIconsOf } from "@/components/layout/mode-icon-pairs";

const html = document.documentElement;

/** Apaga o cookie de modo do jsdom. */
const clearCookie = () => {
  document.cookie = `${COLOR_MODE_COOKIE}=; Path=/; Max-Age=0`;
};
/** Grava o cookie de modo como o botão o faria. */
const setCookie = (/** @type {string} */ value) => {
  document.cookie = `${COLOR_MODE_COOKIE}=${value}; Path=/`;
};

/** Executa o script do <head> como o navegador o faria, no documento atual. */
const runScript = () => new Function(COLOR_MODE_SCRIPT)();

beforeEach(() => {
  clearCookie();
  localStorage.clear();
  html.className = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookie();
  html.className = "";
});

describe("o cookie e o script do <head>", () => {
  it("o cookie se chama vitrine-modo", () => {
    expect(COLOR_MODE_COOKIE).toBe("vitrine-modo");
  });

  it("tem conteúdo fixo: lê só o cookie, não interpola dado, não fecha o <script> e não usa matchMedia", () => {
    expect(COLOR_MODE_SCRIPT).toContain("document.cookie");
    expect(COLOR_MODE_SCRIPT).toContain("vitrine-modo");
    expect(COLOR_MODE_SCRIPT).not.toMatch(/<\/script/i);
    expect(COLOR_MODE_SCRIPT).not.toContain("${");
    expect(COLOR_MODE_SCRIPT).not.toContain("undefined");
    // Sem "automático": o sistema operacional não decide mais.
    expect(COLOR_MODE_SCRIPT).not.toMatch(/matchMedia|prefers-color-scheme|localStorage/);
    // Só toca a classe do <html>.
    expect(COLOR_MODE_SCRIPT).toContain('document.documentElement.classList.add("dark")');
    expect(COLOR_MODE_SCRIPT).not.toMatch(/\bfetch\b|XMLHttpRequest|innerHTML|eval\(/);
  });

  it.each([
    // [cookie, espera .dark]
    ["dark", true],
    ["light", false],
    [null, false], // primeira visita: claro
    ["auto", false], // o valor antigo já não vale
    ["DARK", false],
    ["valor-estranho", false],
    ["", false],
  ])("cookie %j: classe .dark = %s", (stored, expected) => {
    if (stored !== null) setCookie(stored);
    runScript();
    expect(html.classList.contains("dark")).toBe(expected);
    // A função que o botão usa decide do mesmo modo que o script.
    expect(wantsDark(stored)).toBe(expected);
  });

  it("o sistema escuro NÃO liga o modo escuro (não há automático)", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
    runScript();
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("um localStorage antigo (vitrine:modo=dark) é ignorado", () => {
    localStorage.setItem("vitrine:modo", "dark");
    runScript();
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("acha o cookie entre outros, com espaços e sem confundir nomes parecidos", () => {
    document.cookie = "outro=1; Path=/";
    document.cookie = "x-vitrine-modo=light; Path=/";
    setCookie("dark");
    document.cookie = "depois=2; Path=/";
    runScript();
    expect(html.classList.contains("dark")).toBe(true);
    document.cookie = "outro=; Path=/; Max-Age=0";
    document.cookie = "x-vitrine-modo=; Path=/; Max-Age=0";
    document.cookie = "depois=; Path=/; Max-Age=0";
  });

  it("um cookie alheio de nome parecido não liga o modo escuro", () => {
    document.cookie = "x-vitrine-modo=dark; Path=/";
    runScript();
    expect(html.classList.contains("dark")).toBe(false);
    document.cookie = "x-vitrine-modo=; Path=/; Max-Age=0";
  });

  it("cookies bloqueados: não lança e deixa o modo claro", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      expect(runScript).not.toThrow();
      expect(html.classList.contains("dark")).toBe(false);
    } finally {
      delete (/** @type {any} */ (document).cookie);
    }
  });

  it("modeCookieString: Path=/, um ano, SameSite=Lax, sem HttpOnly; Secure só em HTTPS", () => {
    const http = modeCookieString("dark", false);
    expect(http).toBe(`vitrine-modo=dark; Path=/; Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax`);
    expect(COLOR_MODE_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(http).not.toMatch(/HttpOnly|Secure/i);
    expect(modeCookieString("light", true)).toBe(`vitrine-modo=light; Path=/; Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax; Secure`);
  });

  it("readModeCookie lê o valor do cookie certo", () => {
    expect(readModeCookie("a=1; vitrine-modo=dark; b=2")).toBe("dark");
    expect(readModeCookie("vitrine-modo=light")).toBe("light");
    expect(readModeCookie("x-vitrine-modo=dark")).toBeNull();
    expect(readModeCookie("")).toBeNull();
    expect(readModeCookie("semigual")).toBeNull();
  });
});

describe("ColorModeToggle: UM botão que alterna entre dois modos", () => {
  const button = () => screen.getByRole("button", { name: /^Mudar para o modo/ });

  it("é um único botão, sem 'Automático': na primeira visita muda para o modo escuro", () => {
    render(<ColorModeToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo escuro");
    expect(button().getAttribute("title")).toBe("Mudar para o modo escuro");
    expect(button().hasAttribute("aria-pressed")).toBe(false);
    expect(screen.queryByText(/Autom/)).toBeNull();
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("primeira visita com o sistema escuro continua clara", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
    render(<ColorModeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo escuro");
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("clicar no claro: grava dark, aplica a classe e o botão passa a oferecer o modo claro", () => {
    render(<ColorModeToggle />);
    fireEvent.click(button());
    expect(readModeCookie(document.cookie)).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo claro");
  });

  it("clicar no escuro: grava light, remove a classe e volta a oferecer o modo escuro", () => {
    setCookie("dark");
    html.classList.add("dark"); // aplicada pelo script antes da hidratação
    render(<ColorModeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo claro");
    fireEvent.click(button());
    expect(readModeCookie(document.cookie)).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo escuro");
  });

  it("escrever o cookie apaga o localStorage antigo (vitrine:modo some)", () => {
    localStorage.setItem("vitrine:modo", "auto");
    render(<ColorModeToggle />);
    fireEvent.click(button());
    expect(localStorage.getItem("vitrine:modo")).toBeNull();
  });

  it("nunca grava nada no localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ColorModeToggle />);
    fireEvent.click(button());
    expect(setItem).not.toHaveBeenCalled();
  });

  it("o cookie escrito é o do contrato (Path=/, um ano, SameSite=Lax) e o script o aplica de volta", () => {
    const writes = /** @type {string[]} */ ([]);
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => original?.get?.call(document) ?? "",
      set: (value) => {
        writes.push(value);
        original?.set?.call(document, value);
      },
    });
    try {
      render(<ColorModeToggle />);
      fireEvent.click(button());
    } finally {
      delete (/** @type {any} */ (document).cookie);
    }
    expect(writes).toEqual([`vitrine-modo=dark; Path=/; Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax`]);
    html.className = "";
    runScript();
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("lê a escolha guardada ao montar e a aplica", () => {
    setCookie("dark");
    render(<ColorModeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo claro");
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("um cookie inválido (inclusive o antigo 'auto') vale como claro", () => {
    for (const value of ["roxo", "auto", ""]) {
      cleanup();
      setCookie(value);
      render(<ColorModeToggle />);
      expect(button().getAttribute("aria-label"), value).toBe("Mudar para o modo escuro");
    }
  });

  it("não escuta o sistema: a mudança do sistema não troca o modo", () => {
    const listeners = new Set();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: (/** @type {string} */ _t, /** @type {unknown} */ l) => listeners.add(l), removeEventListener() {} })),
    );
    render(<ColorModeToggle />);
    expect(listeners.size).toBe(0);
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("volta a ler o cookie ao recuperar o foco (a escolha feita em outra aba)", () => {
    render(<ColorModeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo escuro");
    act(() => {
      setCookie("dark");
      window.dispatchEvent(new Event("focus"));
    });
    expect(button().getAttribute("aria-label")).toBe("Mudar para o modo claro");
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("duas instâncias na mesma página ficam em sincronia", () => {
    render(
      <>
        <ColorModeToggle />
        <ColorModeToggle />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Mudar para o modo claro", "Mudar para o modo claro"]);
  });

  it("cookies bloqueados: a escolha ainda vale nesta página, sem lançar", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
      set() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      render(<ColorModeToggle />);
      fireEvent.click(button());
      expect(html.classList.contains("dark")).toBe(true);
      expect(button().getAttribute("aria-label")).toBe("Mudar para o modo claro");
      // Devolve a memória do módulo ao claro, para não vazar para os outros testes.
      fireEvent.click(button());
      expect(html.classList.contains("dark")).toBe(false);
    } finally {
      delete (/** @type {any} */ (document).cookie);
    }
  });

  it("só usa tokens de tema, nunca cores fixas, e o ícone é decorativo", () => {
    render(<ColorModeToggle />);
    expect(button().outerHTML).not.toMatch(/text-white|bg-white|bg-black|#[0-9a-f]{3,6}/i);
    expect(button().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("o par de ícones (D-35)", () => {
  /** O desenho do botão, para comparar pares. */
  const drawing = () => screen.getByRole("button").querySelector("svg")?.innerHTML;

  it("são quatro pares fechados, o primeiro é o padrão", () => {
    expect([...MODE_ICON_PAIRS]).toEqual(["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);
    expect(Object.keys(MODE_ICON_PAIR_OPTIONS)).toEqual([...MODE_ICON_PAIRS]);
  });

  it("sem prop vale sun_moon, e um valor desconhecido também", () => {
    const { unmount } = render(<ColorModeToggle />);
    const standard = drawing();
    unmount();
    render(<ColorModeToggle iconPair="nao-existe" />);
    expect(drawing()).toEqual(standard);
    expect(modeIconsOf(undefined)).toBe(MODE_ICON_PAIR_OPTIONS.sun_moon);
    expect(modeIconsOf("<script>")).toBe(MODE_ICON_PAIR_OPTIONS.sun_moon);
  });

  it("no modo claro o botão mostra o ícone do modo ESCURO do par (para onde ele muda) e vice-versa", () => {
    for (const pair of MODE_ICON_PAIRS) {
      cleanup();
      html.className = "";
      clearCookie();
      const { unmount } = render(<ColorModeToggle iconPair={pair} />);
      const inLight = drawing();
      fireEvent.click(screen.getByRole("button"));
      const inDark = drawing();
      expect(inLight, pair).toBeTruthy();
      expect(inLight, pair).not.toBe(inDark);
      unmount();
      const { Light, Dark } = MODE_ICON_PAIR_OPTIONS[pair];
      const reference = render(<Dark />);
      expect(inLight, pair).toBe(reference.container.querySelector("svg")?.innerHTML);
      reference.unmount();
      const reference2 = render(<Light />);
      expect(inDark, pair).toBe(reference2.container.querySelector("svg")?.innerHTML);
    }
  });

  it("os quatro pares desenham botões diferentes", () => {
    /** @type {string[]} */
    const seen = [];
    for (const pair of MODE_ICON_PAIRS) {
      cleanup();
      render(<ColorModeToggle iconPair={pair} />);
      seen.push(String(drawing()));
    }
    expect(new Set(seen).size).toBe(4);
  });
});
