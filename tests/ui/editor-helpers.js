// Auxiliares dos testes de interação do editor (não é um arquivo de teste). Quem os usa precisa
// declarar, no próprio arquivo, o `vi.mock` do MarkdownRenderer (o `vi.mock` é por arquivo).
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Editor } from "@/components/editor/Editor";

export const INITIAL = { title: "Cálculo", slug: "calculo", body: "# Olá", status: /** @type {const} */ ("PUBLISHED") };
export const OK = { ok: true, id: "c1", version: "v2" };

/** Troca simulada do MarkdownRenderer: mostra o texto que recebeu. */
export const RendererStub = ({ markdown }) => <div data-testid="renderizado">{markdown}</div>;

/**
 * Renderiza o Editor com valores padrão e um `onSubmit` simulado que dá certo.
 * @param {Partial<import("react").ComponentProps<typeof Editor>>} [props]
 */
export function renderEditor(props = {}) {
  // O `onSubmit` devolvido é o que o Editor recebe: o do teste, se ele passou um.
  const onSubmit = /** @type {import("vitest").Mock<any>} */ (props.onSubmit ?? vi.fn(async () => OK));
  const view = render(<Editor userId="u1" contentId="c1" initialValue={INITIAL} version="v1" {...props} onSubmit={onSubmit} />);
  return { onSubmit, ...view };
}

export const title = () => /** @type {HTMLInputElement} */ (screen.getByLabelText("Título"));
export const slug = () => /** @type {HTMLInputElement} */ (screen.getByLabelText("Endereço (slug)"));
export const body = () => /** @type {HTMLTextAreaElement} */ (screen.getByLabelText("Texto do documento (Markdown)"));
export const send = () => screen.getByRole("button", { name: /Enviar nova versão|Enviando/ });
export const saveLocal = () => screen.getByRole("button", { name: "Salvar localmente" });
export const toolbarButton = (/** @type {string} */ name) => screen.getByRole("button", { name });

/** Digita em um campo: troca o valor e dispara o evento que o React escuta. */
export function type(/** @type {HTMLInputElement | HTMLTextAreaElement} */ field, /** @type {string} */ value) {
  fireEvent.change(field, { target: { value } });
}

/** Seleciona um trecho do texto, como o autor faria com o mouse. */
export function select(/** @type {HTMLTextAreaElement} */ area, /** @type {number} */ start, /** @type {number} */ end = start) {
  area.focus();
  area.setSelectionRange(start, end);
}

/**
 * Faz o `document.execCommand` se comportar como o do navegador: troca a seleção do campo
 * focado e dispara o evento `input`. O jsdom não o implementa.
 */
export function installExecCommand() {
  const execCommand = vi.fn((/** @type {string} */ command, /** @type {boolean} */ _showUi, /** @type {string} */ value) => {
    const area = /** @type {HTMLTextAreaElement} */ (document.activeElement);
    area.setRangeText(command === "delete" ? "" : value, area.selectionStart, area.selectionEnd, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  /** @type {any} */ (document).execCommand = execCommand;
  return execCommand;
}
