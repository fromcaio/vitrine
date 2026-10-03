// `test` dos specs e2e: o do Playwright, mais uma guarda automática de CSP (ADR-022). Todo teste
// que importar daqui falha se o navegador registrar uma violação da Content-Security-Policy, seja
// pelo evento `securitypolicyviolation`, seja por uma mensagem de erro no console.
import { expect, test as base } from "@playwright/test";

/** Mensagens de console do Chromium sobre a CSP começam assim ("Refused to ..."/"Content Security Policy..."). */
const CSP_CONSOLE = /content security policy|refused to (apply|execute|load|connect|frame|run|create|evaluate|send)/i;

export const test = base.extend({
  cspViolations: [
    async ({ page }, use) => {
      /** @type {string[]} */
      const violations = [];
      // O evento é a fonte mais confiável (traz a diretiva); o console cobre o que o evento perde.
      await page.exposeFunction("__reportCspViolation", (/** @type {string} */ text) => violations.push(text));
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          // @ts-expect-error função exposta pelo Playwright
          window.__reportCspViolation(`${event.violatedDirective} bloqueou ${event.blockedURI || "inline"} em ${event.documentURI}`);
        });
      });
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          if (CSP_CONSOLE.test(message.text())) violations.push(`console: ${message.text()}`);
        }
      });
      await use(violations);
      expect(violations, "violações de CSP registradas pelo navegador").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
