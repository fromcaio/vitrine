// Auxiliares da varredura de acessibilidade (A-023; RNF05): o axe-core sobre uma página já aberta, a troca de
// modo (claro e noturno) e de largura, e o relatório. Arquivo NOVO: nada de e2e/support/ foi alterado.
//
// O axe roda com as regras WCAG 2.0 A e AA, WCAG 2.1 A e AA e as boas práticas. A meta é zero violações de
// impacto `serious` e `critical`; as `moderate` e `minor` vão ao relatório, e cada uma é corrigida ou
// justificada. NENHUMA regra é desligada e nenhum elemento é excluído da varredura.
import { AxeBuilder } from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

/** As marcas do axe: WCAG 2.1 A e AA (com as 2.0) e as boas práticas. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

/** Os modos de cor e as larguras da varredura (1280 e 320 px: a tela larga e o mínimo do RNF06). */
export const MODES = /** @type {const} */ (["claro", "noturno"]);
export const SIZES = /** @type {const} */ ([
  { label: "1280", width: 1280, height: 900 },
  { label: "320", width: 320, height: 700 },
]);

/** Os impactos que derrubam a varredura. */
export const BLOCKING = new Set(["serious", "critical"]);

/**
 * @typedef {object} Finding
 * @property {string} id a regra do axe (por exemplo, `color-contrast`)
 * @property {string} impact `minor`, `moderate`, `serious` ou `critical`
 * @property {string} help o que a regra pede
 * @property {string[]} targets os seletores dos elementos (no máximo 5)
 * @property {string[]} summaries a explicação do axe para o primeiro elemento (por exemplo, a razão de contraste)
 */

/**
 * @typedef {object} ScanResult
 * @property {string} page o nome do estado da página
 * @property {string} mode
 * @property {string} size
 * @property {Finding[]} violations
 */

/** Os resultados da rodada inteira (o relatório sai deles). @type {ScanResult[]} */
export const results = [];

/**
 * Troca o modo de cor da página aberta, do mesmo jeito que o script do `<head>` o faz (`vitrine:modo` e a
 * classe `dark` no `<html>`), e espera as transições de cor acabarem: o axe mede o contraste do que está na
 * tela, e uma cor a meio caminho daria um número falso.
 * @param {import("@playwright/test").Page} page
 * @param {"claro" | "noturno"} mode
 */
export async function setMode(page, mode) {
  await page.evaluate((dark) => {
    localStorage.setItem("vitrine:modo", dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
  }, mode === "noturno");
  await settle(page);
}

/**
 * Troca a largura da janela e espera o leiaute assentar.
 * @param {import("@playwright/test").Page} page
 * @param {{ width: number, height: number }} size
 */
export async function setSize(page, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await settle(page);
}

/** Espera as transições (150 ms nos botões) e o próximo quadro. @param {import("@playwright/test").Page} page */
async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 450))));
}

/**
 * Varre a página aberta com o axe.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<Finding[]>}
 */
export async function scan(page) {
  const analysis = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return analysis.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? "minor",
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
    summaries: violation.nodes.slice(0, 1).map((node) => (node.failureSummary ?? "").replace(/\s+/g, " ").trim()),
  }));
}

/**
 * Varre um estado da página nos dois modos e nas duas larguras, guarda os resultados no relatório e devolve as
 * violações que derrubam (`serious` e `critical`), com o contexto, prontas para um `expect(...).toEqual([])`.
 * @param {import("@playwright/test").Page} page a página, já no estado a varrer (diálogo aberto, por exemplo)
 * @param {string} name o nome do estado, para o relatório
 * @returns {Promise<string[]>}
 */
export async function scanAll(page, name) {
  /** @type {string[]} */
  const blocking = [];
  for (const size of SIZES) {
    await setSize(page, size);
    for (const mode of MODES) {
      await setMode(page, mode);
      const violations = await scan(page);
      results.push({ page: name, mode, size: size.label, violations });
      for (const violation of violations.filter((item) => BLOCKING.has(item.impact))) {
        blocking.push(`${name} [${mode}, ${size.label}px] ${violation.impact} ${violation.id}: ${violation.help} :: ${violation.targets.join(" | ")} :: ${violation.summaries.join(" ")}`);
      }
    }
  }
  return blocking;
}

/**
 * O relatório da rodada, em texto: o total de varreduras, as violações por impacto e a lista, sem repetir a
 * mesma regra na mesma página.
 * @returns {string}
 */
export function report() {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  /** @type {Map<string, { impact: string, id: string, help: string, where: Set<string>, targets: Set<string> }>} */
  const unique = new Map();
  for (const result of results) {
    for (const violation of result.violations) {
      byImpact[/** @type {keyof typeof byImpact} */ (violation.impact)] += 1;
      const key = `${violation.id}|${result.page}`;
      const entry = unique.get(key) ?? { impact: violation.impact, id: violation.id, help: violation.help, where: new Set(), targets: new Set() };
      entry.where.add(`${result.mode}/${result.size}`);
      for (const target of violation.targets) entry.targets.add(target);
      unique.set(key, entry);
    }
  }
  const pages = new Set(results.map((result) => result.page));
  const lines = [
    "Varredura de acessibilidade (axe-core, WCAG 2.0 e 2.1, níveis A e AA, mais as boas práticas)",
    `Estados de página: ${pages.size} · varreduras (estado × modo × largura): ${results.length}`,
    `Violações encontradas (ocorrências): crítico=${byImpact.critical} sério=${byImpact.serious} moderado=${byImpact.moderate} leve=${byImpact.minor}`,
    `Meta: zero de impacto sério e crítico. Resultado: ${byImpact.critical + byImpact.serious === 0 ? "ATINGIDA" : "NÃO ATINGIDA"}`,
    "",
  ];
  if (unique.size === 0) lines.push("Nenhuma violação em nenhuma varredura.");
  for (const entry of [...unique.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [key, value] = entry;
    lines.push(`- [${value.impact}] ${value.id} em "${key.split("|")[1]}" (${[...value.where].join(", ")}): ${value.help} :: ${[...value.targets].slice(0, 3).join(" | ")}`);
  }
  lines.push("", "Estados varridos:", ...[...pages].sort().map((name) => `  ${name}`));
  return lines.join("\n");
}

/**
 * Grava o relatório em `test-results/acessibilidade.txt` (a pasta que o Playwright usa e que o Git ignora).
 * @returns {string} o caminho
 */
export function writeReport() {
  const file = path.join(process.cwd(), "test-results", "acessibilidade.txt");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${report()}\n`, "utf8");
  return file;
}
