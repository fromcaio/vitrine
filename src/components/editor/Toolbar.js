"use client";

// Barra de ferramentas do editor (M09; RF08): negrito, itálico, tachado, títulos, links, imagens,
// código, citação, listas, tabela e fórmula. Cada botão tem um rótulo acessível em português; o
// ícone é só decoração. O padrão de acessibilidade é o de uma barra de ferramentas (APG): a barra
// toda é uma única parada do Tab, e as setas, Home e End movem o foco entre os botões.
import { useRef, useState } from "react";
import {
  CodeBlockIcon,
  CodeIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MathBlockIcon,
  MathIcon,
  QuoteIcon,
  TableIcon,
  TaskListIcon,
} from "@/components/ui/icons";

/**
 * @typedef {object} ToolbarItem
 * @property {import("./format").FormatCommand} command
 * @property {string} label rótulo acessível, também usado como dica
 * @property {import("react").ReactNode} content ícone ou glifo
 * @property {string} [shortcut] atalho de teclado, no formato de `aria-keyshortcuts`
 * @property {string} [shortcutText] atalho, como o autor o lê
 */

const ICON = "size-5 shrink-0";

/** @type {{ label: string, items: ToolbarItem[] }[]} */
export const TOOLBAR_GROUPS = [
  {
    label: "Estilo do texto",
    items: [
      { command: "bold", label: "Negrito", content: <span className="font-bold">N</span>, shortcut: "Control+B Meta+B", shortcutText: "Ctrl+B" },
      { command: "italic", label: "Itálico", content: <span className="italic">I</span>, shortcut: "Control+I Meta+I", shortcutText: "Ctrl+I" },
      { command: "strike", label: "Tachado", content: <span className="line-through">ab</span> },
      { command: "code", label: "Código em linha", content: <CodeIcon className={ICON} /> },
    ],
  },
  {
    label: "Títulos",
    items: [
      { command: "heading1", label: "Título de nível 1", content: <span className="text-sm font-semibold">H1</span> },
      { command: "heading2", label: "Título de nível 2", content: <span className="text-sm font-semibold">H2</span> },
      { command: "heading3", label: "Título de nível 3", content: <span className="text-sm font-semibold">H3</span> },
    ],
  },
  {
    label: "Blocos",
    items: [
      { command: "quote", label: "Citação", content: <QuoteIcon className={ICON} /> },
      { command: "ul", label: "Lista com marcadores", content: <ListIcon className={ICON} /> },
      { command: "ol", label: "Lista numerada", content: <ListOrderedIcon className={ICON} /> },
      { command: "tasks", label: "Lista de tarefas", content: <TaskListIcon className={ICON} /> },
      { command: "codeBlock", label: "Bloco de código", content: <CodeBlockIcon className={ICON} /> },
      { command: "table", label: "Tabela", content: <TableIcon className={ICON} /> },
    ],
  },
  {
    label: "Inserções",
    items: [
      { command: "link", label: "Link", content: <LinkIcon className={ICON} />, shortcut: "Control+K Meta+K", shortcutText: "Ctrl+K" },
      { command: "image", label: "Imagem", content: <ImageIcon className={ICON} /> },
      { command: "math", label: "Fórmula em linha", content: <MathIcon className={ICON} /> },
      { command: "mathBlock", label: "Fórmula em bloco", content: <MathBlockIcon className={ICON} /> },
    ],
  },
];

/** Todos os botões, na ordem em que aparecem (a posição de cada um no foco "roving"). */
const ALL_ITEMS = TOOLBAR_GROUPS.flatMap((group) => group.items);

const BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent text-foreground " +
  "transition-[background-color,border-color] enabled:cursor-pointer enabled:hover:border-border enabled:hover:bg-surface";

/**
 * @param {object} props
 * @param {(command: import("./format").FormatCommand) => void} props.onCommand chamado ao acionar um botão
 * @param {string} props.controls identificador do campo de texto que a barra controla
 */
export function Toolbar({ onCommand, controls }) {
  const toolbarRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  // Só um botão fica na ordem do Tab (o último em que o foco esteve).
  const [active, setActive] = useState(0);

  /** @param {import("react").KeyboardEvent<HTMLDivElement>} event */
  function handleKeyDown(event) {
    const buttons = [...(toolbarRef.current?.querySelectorAll("button") ?? [])];
    const current = buttons.indexOf(/** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (event.target).closest("button")));
    if (current === -1) return;
    const last = buttons.length - 1;
    const next = { ArrowRight: current === last ? 0 : current + 1, ArrowLeft: current === 0 ? last : current - 1, Home: 0, End: last }[
      /** @type {"ArrowRight" | "ArrowLeft" | "Home" | "End"} */ (event.key)
    ];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    buttons[next].focus();
  }

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatação do texto"
      aria-controls={controls}
      onKeyDown={handleKeyDown}
      className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-border bg-surface p-1"
    >
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          className={`flex items-center gap-1 ${groupIndex > 0 ? "border-l border-border pl-1" : ""}`.trim()}
        >
          {group.items.map((item) => {
            const index = ALL_ITEMS.indexOf(item);
            return (
              <button
                key={item.command}
                type="button"
                aria-label={item.label}
                title={item.shortcutText ? `${item.label} (${item.shortcutText})` : item.label}
                aria-keyshortcuts={item.shortcut}
                tabIndex={index === active ? 0 : -1}
                onFocus={() => setActive(index)}
                onClick={() => onCommand(item.command)}
                className={BUTTON}
              >
                {item.content}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
