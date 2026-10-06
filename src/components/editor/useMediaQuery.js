"use client";

// Uma media query como valor do React (`useSyncExternalStore`): `true` quando casa. Sem `matchMedia` (o
// jsdom dos testes), vale `fallback`, que o editor deixa em `true` (a tela larga, com os dois painéis à vista).
import { useSyncExternalStore } from "react";

/**
 * @param {string} query por exemplo, `(min-width: 768px)`
 * @param {boolean} [fallback] o valor quando o navegador não tem `matchMedia`
 * @returns {boolean}
 */
export function useMediaQuery(query, fallback = true) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}
