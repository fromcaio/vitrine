"use client";

// Botão do modo de cor do leitor: UM botão que alterna entre Claro e Escuro, só dois estados (RF32,
// RN32, D-33, ADR-036; Cap. 5 §5.9). O nome acessível diz o que o clique faz, "Mudar para o modo escuro"
// ou "Mudar para o modo claro", e o ícone é o do modo para o qual ele muda. A escolha vai ao cookie `vitrine-modo` (um ano, `SameSite=Lax`, sem `HttpOnly`),
// ESCRITO por este componente e LIDO só pelo script do <head> (color-mode-script.js), que a aplica
// antes da primeira pintura; este componente a alterna depois, trocando a classe .dark do <html>.
// Quem nunca escolheu vê o modo claro. O servidor nunca lê o cookie (o ISR continua valendo).
//
// O par de ícones (o do modo claro e o do escuro) vem por `iconPair` (escolha do administrador para o site, `modeIconPair`): sol e
// lua (padrão), sol e lua de contorno, lâmpada ou círculo meio cheio. Não conhece o dono nem o tema
// do espaço: só tokens de cor. O lugar dele nos cabeçalhos é das páginas.
import { useEffect, useSyncExternalStore } from "react";
import {
  LEGACY_STORAGE_KEY,
  modeCookieString,
  readModeCookie,
  wantsDark,
} from "./color-mode-script";
import { COLOR_MODE_TOGGLE_LOOK } from "./color-mode-toggle-style";
import { modeIconsOf } from "./mode-icon-pairs";

/** @typedef {import("./color-mode-script").ColorModeChoice} ColorModeChoice */

/** Evento próprio: o cookie não avisa a própria aba quando muda. */
const CHANGE_EVENT = "vitrine:modo-change";

/** @type {{ value: ColorModeChoice | null }} */
const memory = { value: null };

/** @returns {ColorModeChoice} a escolha guardada; `light` sem escolha ou sem cookies */
function readChoice() {
  try {
    const stored = readModeCookie(document.cookie);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Cookies bloqueados: vale o que o leitor escolheu nesta página, se escolheu.
  }
  return memory.value ?? "light";
}

/** @param {ColorModeChoice} choice */
function writeChoice(choice) {
  // A memória só guarda a escolha se o navegador NÃO guardou o cookie (cookies bloqueados): a
  // escolha vale então até a página fechar. Com o cookie funcionando, ele é a única fonte.
  memory.value = choice;
  try {
    document.cookie = modeCookieString(choice, window.location.protocol === "https:");
    if (readModeCookie(document.cookie) === choice) memory.value = null;
  } catch {
    // Sem cookies: fica a memória.
  }
  try {
    // A versão anterior guardava a escolha aqui, com o "automático": some de vez.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Armazenamento bloqueado: nada a apagar.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** @param {() => void} notify */
function subscribe(notify) {
  window.addEventListener(CHANGE_EVENT, notify);
  // Outra aba pode ter mudado o cookie: ao voltar a esta, relê.
  window.addEventListener("focus", notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("focus", notify);
  };
}

/**
 * @param {object} props
 * @param {string} [props.iconPair] o par de ícones (`sun_moon`, `sun_moon_outline`, `lightbulb` ou
 *   `contrast_half`); um valor desconhecido vale `sun_moon`
 * @param {string} [props.className]
 */
export function ColorModeToggle({ iconPair, className = "" }) {
  // No servidor e na hidratação vale `light`; o valor guardado entra logo depois, sem divergência.
  const choice = useSyncExternalStore(subscribe, readChoice, () => /** @type {ColorModeChoice} */ ("light"));
  const icons = modeIconsOf(iconPair);

  // Aplica a escolha (também a feita em outra aba).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", wantsDark(choice));
  }, [choice]);

  const dark = choice === "dark";
  // O botão leva ao OUTRO modo: o nome e o ícone dizem para onde ele vai.
  const label = dark ? "Mudar para o modo claro" : "Mudar para o modo escuro";
  const Icon = dark ? icons.Light : icons.Dark;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => writeChoice(dark ? "light" : "dark")}
      className={`${COLOR_MODE_TOGGLE_LOOK} cursor-pointer hover:border-foreground hover:bg-surface ${className}`.trim()}
    >
      <Icon />
    </button>
  );
}
