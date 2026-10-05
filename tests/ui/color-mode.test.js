// @vitest-environment jsdom
// Modo de cor do leitor (RF32, RN27; CT47, parte de unidade): o script do <head>, que aplica a
// classe .dark antes da primeira pintura, e o seletor Claro, Escuro, Automático. A primeira
// pintura sem piscar e a CSP são verificadas no navegador, sobre o build de produção.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorModeToggle } from "@/components/layout/ColorModeToggle";
import { COLOR_MODE_SCRIPT, COLOR_MODE_STORAGE_KEY, wantsDark } from "@/components/layout/color-mode-script";

const html = document.documentElement;

/**
 * Simula `matchMedia("(prefers-color-scheme: dark)")`: `set` muda a preferência e avisa quem escuta.
 * @param {boolean} matches
 */
function stubSystem(matches) {
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (/** @type {string} */ _type, /** @type {() => void} */ listener) => listeners.add(listener),
    removeEventListener: (/** @type {string} */ _type, /** @type {() => void} */ listener) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return {
    listeners,
    set(/** @type {boolean} */ value) {
      matches = value;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** Executa o script do <head> como o navegador o faria, no documento atual. */
const runScript = () => new Function(COLOR_MODE_SCRIPT)();

beforeEach(() => {
  localStorage.clear();
  html.className = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  html.className = "";
});

describe("a chave e o script do <head>", () => {
  it("a chave é vitrine:modo", () => {
    expect(COLOR_MODE_STORAGE_KEY).toBe("vitrine:modo");
  });

  it("tem conteúdo fixo: lê só a chave, não interpola dado e não fecha o <script>", () => {
    expect(COLOR_MODE_SCRIPT).toContain('localStorage.getItem("vitrine:modo")');
    expect(COLOR_MODE_SCRIPT).not.toMatch(/<\/script/i);
    expect(COLOR_MODE_SCRIPT).not.toContain("${");
    expect(COLOR_MODE_SCRIPT).not.toContain("undefined");
    // Só toca a classe do <html>.
    expect(COLOR_MODE_SCRIPT).toContain('document.documentElement.classList.add("dark")');
    expect(COLOR_MODE_SCRIPT).not.toMatch(/\bfetch\b|XMLHttpRequest|document\.cookie|innerHTML|eval\(/);
  });

  it.each([
    // [guardado, sistema escuro, espera .dark]
    ["dark", false, true],
    ["dark", true, true],
    ["light", true, false],
    ["light", false, false],
    ["auto", true, true],
    ["auto", false, false],
    [null, true, true],
    [null, false, false],
    ["valor-estranho", true, true],
    ["valor-estranho", false, false],
    ["DARK", false, false],
  ])("guardado %j, sistema escuro %s: classe .dark = %s", (stored, systemDark, expected) => {
    if (stored !== null) localStorage.setItem("vitrine:modo", stored);
    stubSystem(systemDark);
    runScript();
    expect(html.classList.contains("dark")).toBe(expected);
    // A função que o seletor usa decide do mesmo modo que o script.
    expect(wantsDark(stored, systemDark)).toBe(expected);
  });

  it("armazenamento bloqueado: não lança e deixa o modo claro", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    stubSystem(true);
    expect(runScript).not.toThrow();
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("sem matchMedia: não lança, e o modo escuro explícito ainda vale", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(runScript).not.toThrow();
    expect(html.classList.contains("dark")).toBe(false);
    localStorage.setItem("vitrine:modo", "dark");
    runScript();
    expect(html.classList.contains("dark")).toBe(true);
  });
});

describe("ColorModeToggle", () => {
  const pressed = () =>
    screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.textContent);

  it("tem três opções num grupo rotulado, Automático marcado para quem nunca escolheu", () => {
    stubSystem(false);
    render(<ColorModeToggle />);
    expect(screen.getByRole("group", { name: "Modo de cor" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Claro", "Escuro", "Automático"]);
    expect(pressed()).toEqual(["Automático"]);
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("Escuro: grava a escolha, aplica a classe e marca a opção", () => {
    stubSystem(false);
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    expect(localStorage.getItem("vitrine:modo")).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(pressed()).toEqual(["Escuro"]);
  });

  it("Claro: grava, remove a classe mesmo com o sistema escuro e marca a opção", () => {
    stubSystem(true);
    html.classList.add("dark"); // aplicada pelo script antes da hidratação
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Claro" }));
    expect(localStorage.getItem("vitrine:modo")).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
    expect(pressed()).toEqual(["Claro"]);
  });

  it("Automático: grava auto e segue o sistema, inclusive quando ele muda com a página aberta", () => {
    const system = stubSystem(true);
    localStorage.setItem("vitrine:modo", "light");
    render(<ColorModeToggle />);
    expect(html.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Automático" }));
    expect(localStorage.getItem("vitrine:modo")).toBe("auto");
    expect(html.classList.contains("dark")).toBe(true);

    act(() => system.set(false));
    expect(html.classList.contains("dark")).toBe(false);
    act(() => system.set(true));
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("só acompanha o sistema em Automático: em Claro ou Escuro a mudança é ignorada", () => {
    const system = stubSystem(false);
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Claro" }));
    expect(system.listeners.size).toBe(0);
    act(() => system.set(true));
    expect(html.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    act(() => system.set(false));
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("deixa de escutar o sistema ao desmontar", () => {
    const system = stubSystem(false);
    const { unmount } = render(<ColorModeToggle />);
    expect(system.listeners.size).toBe(1);
    unmount();
    expect(system.listeners.size).toBe(0);
  });

  it("lê a escolha guardada ao montar e a aplica", () => {
    stubSystem(false);
    localStorage.setItem("vitrine:modo", "dark");
    render(<ColorModeToggle />);
    expect(pressed()).toEqual(["Escuro"]);
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("um valor guardado inválido vale como Automático", () => {
    stubSystem(false);
    localStorage.setItem("vitrine:modo", "roxo");
    render(<ColorModeToggle />);
    expect(pressed()).toEqual(["Automático"]);
  });

  it("acompanha a escolha feita em outra aba (evento storage)", () => {
    stubSystem(false);
    render(<ColorModeToggle />);
    act(() => {
      localStorage.setItem("vitrine:modo", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "vitrine:modo", newValue: "dark" }));
    });
    expect(pressed()).toEqual(["Escuro"]);
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("duas instâncias na mesma página ficam em sincronia", () => {
    stubSystem(false);
    render(
      <>
        <ColorModeToggle />
        <ColorModeToggle />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Escuro" })[0]);
    expect(screen.getAllByRole("button", { name: "Escuro" }).map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("armazenamento bloqueado: a escolha ainda vale nesta página, sem lançar", () => {
    stubSystem(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    render(<ColorModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    expect(html.classList.contains("dark")).toBe(true);
    expect(pressed()).toEqual(["Escuro"]);
  });

  it("a opção marcada usa os tokens de tema, nunca cores fixas", () => {
    stubSystem(false);
    render(<ColorModeToggle />);
    const [light, dark] = screen.getAllByRole("button");
    fireEvent.click(dark);
    expect(dark.className).toMatch(/bg-primary/);
    expect(dark.className).toMatch(/text-on-primary/);
    expect(light.className).not.toMatch(/bg-primary/);
    expect(screen.getByRole("group").outerHTML).not.toMatch(/text-white|bg-white|bg-black|#[0-9a-f]{3,6}/i);
  });
});
