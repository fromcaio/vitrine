// @vitest-environment jsdom
// Senha provisória (RF27, RN21): mostrada UMA vez, em texto de um painel, sem ir a campo, URL,
// armazenamento, console nem região viva; "Copiar" e o fechamento.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvisionalPassword } from "@/components/admin/ProvisionalPassword";

const PASSWORD = "Zq7Hn3Rt9Kw2Mx5P";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Como a tela usa: a senha mora no estado de quem a mostra e sai ao fechar. */
function Harness({ initial = PASSWORD, onClose = () => {} }) {
  const [password, setPassword] = useState(/** @type {string | null} */ (initial));
  return password ? (
    <ProvisionalPassword
      password={password}
      email="ana@exemplo.com"
      onClose={() => {
        onClose();
        setPassword(null);
      }}
    />
  ) : (
    <p>Fechado</p>
  );
}

/** Todo o texto e todos os atributos do documento, para procurar a senha em qualquer lugar. */
function everything() {
  const attributes = [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => `${a.name}=${a.value}`));
  return `${document.documentElement.outerHTML}\n${attributes.join("\n")}`;
}

describe("o que aparece", () => {
  it("mostra a senha como texto, dizendo de quem é e que é a única vez", () => {
    render(<Harness />);
    expect(screen.getByText(PASSWORD)).toBeTruthy();
    expect(screen.getByRole("region", { name: /Conta criada: senha provisória de ana@exemplo\.com/ })).toBeTruthy();
    expect(screen.getByText(/uma única vez/)).toBeTruthy();
    expect(screen.getByText(/não poderá ser vista de novo/)).toBeTruthy();
  });

  it("a variante de redefinição tem o título certo", () => {
    render(<ProvisionalPassword password={PASSWORD} email="a@x.com" kind="reset" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /Senha redefinida/ })).toBeTruthy();
  });

  it("o foco vai ao título ao abrir", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });

  it("para o leitor de tela, o texto é lido como 'Senha provisória: ...'", () => {
    render(<Harness />);
    expect(screen.getByText("Senha provisória:", { exact: false, selector: ".sr-only" })).toBeTruthy();
  });

  it("não é um campo de formulário (o gerenciador de senhas não a salva)", () => {
    render(<Harness />);
    expect(document.querySelector("input, textarea, form")).toBeNull();
    for (const el of document.querySelectorAll("*")) expect(el.getAttribute("value") ?? "").not.toContain(PASSWORD);
  });

  it("só tokens de tema", () => {
    const { container } = render(<Harness />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});

describe("copiar", () => {
  it("copia a senha para a área de transferência e confirma, sem repetir a senha na região viva", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a senha" }));
    await screen.findByText("Senha copiada para a área de transferência.");
    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(screen.getByRole("status").textContent).not.toContain(PASSWORD);
  });

  it("se a área de transferência falha, diz como copiar à mão", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error("negado"); }) } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a senha" }));
    await screen.findByText(/Não foi possível copiar/);
    expect(screen.getByRole("status").textContent).not.toContain(PASSWORD);
  });

  it("sem a API da área de transferência, também não lança", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a senha" }));
    await screen.findByText(/Não foi possível copiar/);
  });
});

describe("a senha não vai a lugar nenhum além da tela", () => {
  it("nenhum armazenamento do navegador a recebe, nem durante o uso", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a senha" }));
    await screen.findByText("Senha copiada para a área de transferência.");
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(PASSWORD);
  });

  it("nem a URL, nem o console", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((method) => vi.spyOn(console, /** @type {any} */ (method)).mockImplementation(() => {}));
    const before = window.location.href;
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a senha" }));
    await screen.findByText("Senha copiada para a área de transferência.");
    fireEvent.click(screen.getByRole("button", { name: /Já anotei a senha/ }));
    expect(window.location.href).toBe(before);
    expect(window.location.href).not.toContain(PASSWORD);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("a senha só aparece no texto da tela (nenhum atributo a repete)", () => {
    render(<Harness />);
    const withPassword = [...document.querySelectorAll("*")].filter((el) => [...el.attributes].some((a) => a.value.includes(PASSWORD)));
    expect(withPassword).toEqual([]);
  });
});

describe("fechar", () => {
  it("chama onClose e a senha sai de TODA a árvore, dos atributos e dos armazenamentos", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(everything()).toContain(PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Já anotei a senha, fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Fechado")).toBeTruthy();
    expect(everything()).not.toContain(PASSWORD);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(PASSWORD);
  });

  it("reabrir sem senha nova não a traz de volta", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Já anotei a senha/ }));
    unmount();
    render(<Harness initial={/** @type {any} */ (null)} />);
    expect(everything()).not.toContain(PASSWORD);
  });
});
