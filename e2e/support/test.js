// `test` dos specs e2e: o do Playwright, mais uma guarda automática de CSP (ADR-022). Todo teste
// que importar daqui falha se o navegador registrar uma violação da Content-Security-Policy, seja
// pelo evento `securitypolicyviolation`, seja por uma mensagem de erro no console.
//
// A guarda cobre a fixture `page` E os contextos de navegador que o spec abre por conta própria (sessões de
// donos diferentes, duas abas): quem precisa de um contexto novo o cria com `newGuardedContext(browser, ...)`,
// nunca com `browser.newContext(...)` (A-021, item 5; R-022), e as violações dele entram na mesma lista.
import { expect, test as base } from "@playwright/test";

/** Mensagens de console do Chromium sobre a CSP começam assim ("Refused to ..."/"Content Security Policy..."). */
const CSP_CONSOLE = /content security policy|refused to (apply|execute|load|connect|frame|run|create|evaluate|send)/i;

/**
 * As violações do teste em andamento (os specs de um worker rodam em série): onde `newGuardedContext` as
 * acrescenta. `null` fora de um teste.
 * @type {string[] | null}
 */
let current = null;

/**
 * Passa a registrar as violações de CSP de uma página ou de um contexto (todas as páginas dele).
 * @param {import("@playwright/test").Page | import("@playwright/test").BrowserContext} target
 * @param {string[]} violations
 */
async function watchCsp(target, violations) {
  // O evento é a fonte mais confiável (traz a diretiva); o console cobre o que o evento perde.
  await target.exposeFunction("__reportCspViolation", (/** @type {string} */ text) => violations.push(text));
  await target.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      // @ts-expect-error função exposta pelo Playwright
      window.__reportCspViolation(`${event.violatedDirective} bloqueou ${event.blockedURI || "inline"} em ${event.documentURI}`);
    });
  });
  target.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      if (CSP_CONSOLE.test(message.text())) violations.push(`console: ${message.text()}`);
    }
  });
}

/**
 * Um contexto de navegador novo (outra sessão, outro cookie) COM a guarda de CSP: as violações de qualquer
 * página dele derrubam o teste em andamento. Só vale dentro de um teste.
 * @param {import("@playwright/test").Browser} browser
 * @param {Parameters<import("@playwright/test").Browser["newContext"]>[0]} [options]
 */
export async function newGuardedContext(browser, options) {
  if (!current) throw new Error("newGuardedContext só vale dentro de um teste (a guarda de CSP precisa dele).");
  const context = await browser.newContext(options);
  await watchCsp(context, current);
  return context;
}

export const test = base.extend({
  cspViolations: [
    async ({ page }, use) => {
      /** @type {string[]} */
      const violations = [];
      await watchCsp(page, violations);
      current = violations;
      await use(violations);
      current = null;
      expect(violations, "violações de CSP registradas pelo navegador").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
