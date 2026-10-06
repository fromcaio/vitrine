// @vitest-environment jsdom
// Diálogo de confirmação (RF07, RN07, RNF05; M10): modal acessível, foco preso, Esc, devolução do
// foco, estado "enviando" e nunca `window.confirm`. O foco preso e o fundo inerte do <dialog> de verdade
// são verificados no navegador; aqui, o que o componente faz por conta própria.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// O jsdom pode não ter showModal/close: um equivalente que marca o atributo `open`.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close() {
      this.removeAttribute("open");
    };
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const dialog = () => /** @type {HTMLDialogElement} */ (document.querySelector("dialog"));
const isOpen = () => dialog().hasAttribute("open");

/** Um botão que abre o diálogo, como a árvore o usa. */
function Harness({ onConfirm = () => {}, onCancel = () => {}, pending = false, danger = true, children = undefined, description = "Esta ação não pode ser desfeita." }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Apagar item</button>
      <button>Outro botão</button>
      <ConfirmDialog
        open={open}
        title="Excluir o conteúdo?"
        description={description}
        confirmLabel="Excluir"
        danger={danger}
        pending={pending}
        onConfirm={() => {
          onConfirm();
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      >
        {children}
      </ConfirmDialog>
    </>
  );
}

const opener = () => screen.getByRole("button", { name: "Apagar item" });
const openIt = () => fireEvent.click(opener());
const cancelButton = () => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Cancelar" }));
const confirmButton = () => /** @type {HTMLButtonElement} */ (within(dialog()).getByRole("button", { name: /^(Excluir|Enviando…)$/, hidden: true }));

describe("estrutura e acessibilidade", () => {
  it("fechado: o <dialog> existe, sem o atributo open", () => {
    render(<Harness />);
    expect(isOpen()).toBe(false);
  });

  it("aberto: usa showModal e fica com o atributo open", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Harness />);
    openIt();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(true);
  });

  it("liga o título e a descrição ao diálogo e declara aria-modal", () => {
    render(<Harness />);
    openIt();
    const el = dialog();
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(/** @type {string} */ (el.getAttribute("aria-labelledby")))?.textContent).toBe("Excluir o conteúdo?");
    expect(document.getElementById(/** @type {string} */ (el.getAttribute("aria-describedby")))?.textContent).toBe("Esta ação não pode ser desfeita.");
    expect(screen.getByRole("alertdialog", { name: "Excluir o conteúdo?" })).toBeTruthy();
  });

  it("a variante de perigo é um alertdialog; a comum, um dialog", () => {
    const { unmount } = render(<Harness danger />);
    expect(dialog().getAttribute("role")).toBe("alertdialog");
    unmount();
    render(<Harness danger={false} />);
    expect(dialog().getAttribute("role")).toBe("dialog");
  });

  it("sem descrição, não há aria-describedby", () => {
    render(<Harness description={null} />);
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);
  });

  it("o botão de confirmar de perigo usa o token de erro, e o outro, a primária", () => {
    const { unmount } = render(<Harness danger />);
    expect(confirmButton().className).toMatch(/bg-danger/);
    unmount();
    render(<Harness danger={false} />);
    expect(confirmButton().className).toMatch(/bg-primary/);
  });

  it("mostra o conteúdo extra entre a descrição e os botões", () => {
    render(<Harness>{<p data-testid="extra">3 descendentes saem junto.</p>}</Harness>);
    expect(screen.getByTestId("extra").textContent).toBe("3 descendentes saem junto.");
  });

  it("o texto do título é texto, nunca HTML", () => {
    render(<ConfirmDialog open title={"<img src=x onerror=alert(1)>"} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.querySelector("dialog img")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<Harness />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });

  it("nunca chama window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);
    openIt();
    fireEvent.click(confirmButton());
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("foco", () => {
  it("ao abrir, o foco vai para o botão de cancelar (a opção segura)", () => {
    render(<Harness />);
    opener().focus();
    openIt();
    expect(document.activeElement).toBe(cancelButton());
  });

  it("prende o foco: Tab no último volta ao primeiro, e Shift+Tab no primeiro vai ao último", () => {
    render(<Harness />);
    openIt();
    cancelButton().focus();
    const keyTab = (/** @type {boolean} */ shiftKey) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
    // Primeiro -> segundo é o comportamento natural (o navegador); no último, o componente dá a volta.
    confirmButton().focus();
    keyTab(false);
    expect(document.activeElement).toBe(cancelButton());
    keyTab(true);
    expect(document.activeElement).toBe(confirmButton());
  });

  it("cancelar devolve o foco a quem abriu", () => {
    render(<Harness />);
    opener().focus();
    openIt();
    fireEvent.click(cancelButton());
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it("Esc devolve o foco a quem abriu", () => {
    render(<Harness />);
    opener().focus();
    openIt();
    fireEvent(dialog(), new Event("cancel", { cancelable: true, bubbles: false }));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it("quem abriu é o elemento que tinha o foco, e não sempre o primeiro botão", () => {
    render(<Harness />);
    const other = /** @type {HTMLElement} */ (screen.getByRole("button", { name: "Outro botão" }));
    other.focus();
    openIt(); // o clique abre; o foco estava no outro botão
    fireEvent.click(cancelButton());
    expect(document.activeElement).toBe(other);
  });

  it("se quem abriu sumiu, não lança e deixa o foco para quem chama", () => {
    function Vanishing() {
      const [open, setOpen] = useState(true);
      const [alive, setAlive] = useState(true);
      return (
        <>
          {alive ? <button onClick={() => setOpen(true)}>Abrir</button> : null}
          <ConfirmDialog
            open={open}
            title="Título"
            onConfirm={() => {}}
            onCancel={() => {
              setAlive(false);
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<Vanishing />);
    screen.getByRole("button", { name: "Abrir" }).focus();
    expect(() => fireEvent.click(cancelButton())).not.toThrow();
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("desmontar aberto fecha o diálogo e devolve o foco", () => {
    const { unmount } = render(<Harness />);
    opener().focus();
    openIt();
    const closeSpy = vi.spyOn(HTMLDialogElement.prototype, "close");
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("abrir de novo depois de fechar funciona e guarda o novo opener", () => {
    render(<Harness />);
    opener().focus();
    openIt();
    fireEvent.click(cancelButton());
    expect(document.activeElement).toBe(opener());
    openIt();
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(cancelButton());
    fireEvent.click(cancelButton());
    expect(document.activeElement).toBe(opener());
  });
});

describe("confirmar, cancelar e o estado de envio", () => {
  it("confirmar chama onConfirm; cancelar, onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    openIt();
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(cancelButton());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Esc cancela e impede o fechamento nativo (o componente é controlado)", () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    openIt();
    const event = new Event("cancel", { cancelable: true, bubbles: false });
    fireEvent(dialog(), event);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("o clique no fundo (no próprio <dialog>) cancela; o clique no conteúdo, não", () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    openIt();
    fireEvent.click(screen.getByRole("heading", { name: "Excluir o conteúdo?" }));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(dialog());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("com o envio em andamento: o botão diz 'Enviando…', ambos desabilitados e aria-busy", () => {
    render(<Harness pending />);
    openIt();
    expect(confirmButton().textContent).toBe("Enviando…");
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().getAttribute("aria-busy")).toBe("true");
    expect(cancelButton().disabled).toBe(true);
  });

  it("com o envio em andamento, Esc e o clique no fundo NÃO cancelam", () => {
    const onCancel = vi.fn();
    render(<Harness pending onCancel={onCancel} />);
    openIt();
    const event = new Event("cancel", { cancelable: true, bubbles: false });
    fireEvent(dialog(), event);
    fireEvent.click(dialog());
    expect(onCancel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true); // e o navegador também não fecha
  });

  it("sem envio, o botão traz o texto de confirmação e está habilitado", () => {
    render(<Harness />);
    openIt();
    expect(confirmButton().textContent).toBe("Excluir");
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().hasAttribute("aria-busy")).toBe(false);
  });
});
