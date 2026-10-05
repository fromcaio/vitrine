"use client";

// Seletor do modo de cor do leitor: Claro, Escuro ou Automático (RF32, RN27; Cap. 5 §5.9). A
// escolha fica no localStorage (chave `vitrine:modo`) e vale só neste navegador; o script do
// <head> (color-mode-script.js) a aplica antes da primeira pintura, e este componente a
// alterna depois, trocando a classe .dark do <html>. Em Automático, acompanha a preferência do
// sistema enquanto a página está aberta.
//
// Não conhece o dono nem o tema do espaço: só cores de tokens (Button). O lugar dele nos
// cabeçalhos é das páginas (etapas 2 e 5 da A-015).
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { COLOR_MODE_STORAGE_KEY, wantsDark } from "./color-mode-script";

/** @typedef {import("./color-mode-script").ColorModeChoice} ColorModeChoice */

/** Evento próprio: o `storage` do navegador só dispara nas OUTRAS abas. */
const CHANGE_EVENT = "vitrine:modo-change";

/** @type {{ value: ColorModeChoice | null }} */
const memory = { value: null };

const OPTIONS = /** @type {const} */ ([
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "auto", label: "Automático" },
]);

/** @param {unknown} value */
function toChoice(value) {
  return value === "light" || value === "dark" ? value : "auto";
}

/** @returns {ColorModeChoice} a escolha guardada; `auto` sem escolha ou sem armazenamento */
function readChoice() {
  try {
    return toChoice(localStorage.getItem(COLOR_MODE_STORAGE_KEY));
  } catch {
    // Armazenamento bloqueado: vale o que o leitor escolheu nesta página, se escolheu.
    return memory.value ?? "auto";
  }
}

/** @param {ColorModeChoice} choice */
function writeChoice(choice) {
  memory.value = choice;
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, choice);
  } catch {
    // Sem armazenamento: a escolha vale até a página fechar.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** @param {() => void} notify */
function subscribe(notify) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

/** @returns {boolean} a preferência do sistema é noturna */
function systemPrefersDark() {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** @param {ColorModeChoice} choice */
function applyChoice(choice) {
  document.documentElement.classList.toggle("dark", wantsDark(choice, systemPrefersDark()));
}

/** @param {{ className?: string }} props */
export function ColorModeToggle({ className = "" }) {
  // No servidor e na hidratação vale `auto`; o valor guardado entra logo depois, sem divergência.
  const choice = useSyncExternalStore(subscribe, readChoice, () => /** @type {ColorModeChoice} */ ("auto"));

  // Aplica a escolha (também a feita em outra aba) e, em Automático, acompanha o sistema.
  useEffect(() => {
    applyChoice(choice);
    if (choice !== "auto" || typeof matchMedia !== "function") return undefined;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyChoice("auto");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [choice]);

  return (
    <div role="group" aria-label="Modo de cor" className={`inline-flex gap-1 ${className}`.trim()}>
      {OPTIONS.map(({ value, label }) => (
        <Button
          key={value}
          variant={choice === value ? "primary" : "outline"}
          aria-pressed={choice === value}
          onClick={() => writeChoice(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
