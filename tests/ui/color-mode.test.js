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

describe("ColorModeToggle", () => {
  const pressed = () =>
    screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.getAttribute("aria-label"));

  it("tem DUAS opções num grupo rotulado, Modo claro marcado para quem nunca escolheu (sem 'Automático')", () => {
    render(<ColorModeToggle />);
    expect(screen.getByRole("group", { name: "Modo de cor" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Modo claro", "Modo escuro"]);
    expect(screen.queryByText(/Autom/)).toBeNull();
    expect(pressed()).toEqual(["Modo claro"]);
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("primeira visita com o sistema escuro continua clara", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
    render(<ColorModeToggle />);
    expect(pressed()).toEqual(["Modo claro"]);
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("Escuro: grava o cookie, aplica a classe e marca a opção", () => {
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
    expect(readModeCookie(document.cookie)).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(pressed()).toEqual(["Modo escuro"]);
  });

  it("Claro: grava o cookie, remove a classe e marca a opção", () => {
    setCookie("dark");
    html.classList.add("dark"); // aplicada pelo script antes da hidratação
    render(<ColorModeToggle />);
    expect(pressed()).toEqual(["Modo escuro"]);
    fireEvent.click(screen.getByRole("button", { name: "Modo claro" }));
    expect(readModeCookie(document.cookie)).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
    expect(pressed()).toEqual(["Modo claro"]);
  });

  it("escrever o cookie apaga o localStorage antigo (vitrine:modo some)", () => {
    localStorage.setItem("vitrine:modo", "auto");
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
    expect(localStorage.getItem("vitrine:modo")).toBeNull();
  });

  it("nunca grava nada no localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
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
    expect(pressed()).toEqual(["Modo escuro"]);
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("um cookie inválido (inclusive o antigo 'auto') vale como claro", () => {
    for (const value of ["roxo", "auto", ""]) {
      cleanup();
      setCookie(value);
      render(<ColorModeToggle />);
      expect(pressed(), value).toEqual(["Modo claro"]);
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
    expect(pressed()).toEqual(["Modo claro"]);
    act(() => {
      setCookie("dark");
      window.dispatchEvent(new Event("focus"));
    });
    expect(pressed()).toEqual(["Modo escuro"]);
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("duas instâncias na mesma página ficam em sincronia", () => {
    render(
      <>
        <ColorModeToggle />
        <ColorModeToggle />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Modo escuro" })[0]);
    expect(screen.getAllByRole("button", { name: "Modo escuro" }).map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
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
      fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
      expect(html.classList.contains("dark")).toBe(true);
      expect(pressed()).toEqual(["Modo escuro"]);
    } finally {
      delete (/** @type {any} */ (document).cookie);
    }
  });

  it("a opção marcada usa os tokens de tema, nunca cores fixas", () => {
    render(<ColorModeToggle />);
    const [light, dark] = screen.getAllByRole("button");
    fireEvent.click(dark);
    expect(dark.className).toMatch(/bg-primary/);
    expect(dark.className).toMatch(/text-on-primary/);
    expect(light.className).not.toMatch(/bg-primary/);
    expect(screen.getByRole("group").outerHTML).not.toMatch(/text-white|bg-white|bg-black|#[0-9a-f]{3,6}/i);
  });

  it("os botões têm nome acessível e título, e o ícone é decorativo", () => {
    render(<ColorModeToggle />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("title")).toBe(button.getAttribute("aria-label"));
      expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("o par de ícones (D-35)", () => {
  /** O desenho dos dois botões, para comparar pares. */
  const drawings = () => screen.getAllByRole("button").map((button) => button.querySelector("svg")?.innerHTML);

  it("são quatro pares fechados, o primeiro é o padrão", () => {
    expect([...MODE_ICON_PAIRS]).toEqual(["sun_moon", "sun_moon_outline", "lightbulb", "contrast_half"]);
    expect(Object.keys(MODE_ICON_PAIR_OPTIONS)).toEqual([...MODE_ICON_PAIRS]);
  });

  it("sem prop vale sun_moon, e um valor desconhecido também", () => {
    const { unmount } = render(<ColorModeToggle />);
    const standard = drawings();
    unmount();
    render(<ColorModeToggle iconPair="nao-existe" />);
    expect(drawings()).toEqual(standard);
    expect(modeIconsOf(undefined)).toBe(MODE_ICON_PAIR_OPTIONS.sun_moon);
    expect(modeIconsOf("<script>")).toBe(MODE_ICON_PAIR_OPTIONS.sun_moon);
  });

  it("cada par desenha dois ícones diferentes entre si, e os pares diferem uns dos outros", () => {
    /** @type {string[]} */
    const seen = [];
    for (const pair of MODE_ICON_PAIRS) {
      cleanup();
      render(<ColorModeToggle iconPair={pair} />);
      const [light, dark] = drawings();
      expect(light, pair).toBeTruthy();
      expect(light, pair).not.toBe(dark);
      seen.push(`${light}|${dark}`);
    }
    expect(new Set(seen).size).toBe(4);
  });

  it("trocar o modo não troca o par: o ícone de cada botão é sempre o do seu modo", () => {
    render(<ColorModeToggle iconPair="lightbulb" />);
    const before = drawings();
    fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
    expect(drawings()).toEqual(before);
  });
});
