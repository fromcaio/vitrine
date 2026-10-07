// Lighthouse sobre a aplicação de PRODUÇÃO (A-023, item 4; RNF02): desempenho, acessibilidade, boas práticas e
// SEO das páginas públicas, em perfil MÓVEL simulado (o padrão do Lighthouse: Moto G Power, 4G lenta, CPU 4x) e
// DESKTOP, com TRÊS rodadas por página e a MEDIANA de cada número (a variância do Lighthouse é grande: relata-se
// a mediana e a dispersão, sem arredondar nem escolher a melhor rodada).
//
//   npm run lighthouse                (todas as páginas, 3 rodadas)
//   LH_RUNS=1 npm run lighthouse      (uma rodada: só para testar o roteiro)
//   LH_PAGES=portal,login npm run lighthouse
//
// Reaproveita o ambiente do e2e (`e2e/support/env.js`): banco SQLite TEMPORÁRIO fora do repositório, porta
// livre, variáveis FICTÍCIAS, `prisma migrate deploy`, `next build` e `next start` de produção, o administrador
// de `npm run admin:create`. Não baixa navegador: usa o Chromium que o Playwright já instalou (ou o de
// `E2E_CHROMIUM_PATH`), aberto com a porta de depuração, e o Lighthouse se conecta a ele. O que apaga no fim é
// só o diretório `vitrine-e2e-*` da rodada (a salvaguarda de `removeRunDirectory`). Saída: a tabela, e os
// relatórios em `test-results/lighthouse/` (um JSON e um HTML por página e perfil, da rodada mediana).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { removeRunDirectory } from "../e2e/support/database.js";
import { ADMIN, e2eEnvironment, projectRoot } from "../e2e/support/env.js";

const RUNS = Number(process.env.LH_RUNS ?? 3);
const DEBUG_PORT = 9333;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const OUT_DIR = path.join(projectRoot, "test-results", "lighthouse");

const environment = e2eEnvironment();
const { baseURL, serverEnv, dir } = environment;
const ENV = { ...process.env, ...serverEnv };

const ANA = { email: "ana-lh@exemplo.test", name: "Ana Lighthouse", handle: "lh-ana", password: "senha-ana-lh-9" };

/** As páginas públicas medidas (o portal, o início de um espaço, um documento com matemática e código, o login). */
const PAGES = [
  { key: "portal", name: "Portal /", path: "/" },
  { key: "espaco", name: `Espaço /${ANA.handle}`, path: `/${ANA.handle}` },
  { key: "documento", name: "Documento (matemática e código)", path: `/${ANA.handle}/calculo/limites` },
  { key: "login", name: "/login", path: "/login" },
].filter((page) => !process.env.LH_PAGES || process.env.LH_PAGES.split(",").includes(page.key));

const BODY = [
  "## Definição",
  "",
  "O limite $\\lim_{x\\to 0} \\frac{\\sin x}{x} = 1$ vale, e em bloco:",
  "",
  "$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$",
  "",
  "| Função | Limite |",
  "|---|---|",
  "| $\\sin x / x$ | 1 |",
  "| $(1+x)^{1/x}$ | $e$ |",
  "",
  "```js",
  "const limite = Math.sin(1e-9) / 1e-9;",
  "console.log(limite);",
  "```",
  "",
  "- primeiro item",
  "- segundo item",
  "",
].join("\n");

/** @type {import("node:child_process").ChildProcess | null} */
let server = null;
/** @type {import("node:child_process").ChildProcess | null} */
let browser = null;

/** Encerra o servidor e o navegador (no Windows, parar a tarefa não mata o node.exe do next start: mata-se a árvore). */
function stopProcess(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {
    // já tinha saído
  }
}

async function cleanup() {
  stopProcess(browser);
  stopProcess(server);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    removeRunDirectory();
  } catch (error) {
    console.error(`(não foi possível remover o diretório temporário: ${error.message})`);
  }
}

/** Espera o servidor responder. */
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${baseURL}/login`);
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("o servidor não subiu em 2 minutos");
}

/** Um jar de cookies mínimo e uma chamada à API (mesma origem, com o IP próprio do limite de login). */
function client() {
  /** @type {Map<string, string>} */
  const jar = new Map();
  let calls = 0;
  return async (method, route, body) => {
    calls += 1;
    const response = await fetch(`${baseURL}${route}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: baseURL,
        "x-forwarded-for": `10.99.0.${Math.floor(Math.random() * 200) + 1}`,
        ...(jar.size ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${JSON.stringify(json)} (chamada ${calls})`);
    return json;
  };
}

/** Monta os dados fictícios pela API: uma conta com handle, e o conteúdo (coleção, documento com matemática e código). */
async function seed() {
  const admin = client();
  await admin("POST", "/api/auth/sign-in/email", { email: ADMIN.email, password: ADMIN.password });
  const created = await admin("POST", "/api/users", { email: ANA.email, name: ANA.name, handle: ANA.handle });
  const temporary = created.data.temporaryPassword;
  const ana = client();
  await ana("POST", "/api/auth/sign-in/email", { email: ANA.email, password: temporary });
  await ana("POST", "/api/users/me/password", { current: temporary, next: ANA.password });
  const calculo = await ana("POST", "/api/contents", { title: "Cálculo", slug: "calculo", type: "COLLECTION", parentId: null });
  await ana("POST", "/api/contents", { title: "Limites", slug: "limites", type: "DOCUMENT", parentId: calculo.data.id, body: BODY, status: "PUBLISHED" });
  await ana("POST", "/api/contents", { title: "Derivadas", slug: "derivadas", type: "DOCUMENT", parentId: calculo.data.id, body: "Texto de derivadas.", status: "PUBLISHED" });
  // Visita o portal e o espaço uma vez, para a regeneração (ISR) dos dois acontecer antes das medições.
  for (const route of ["/", `/${ANA.handle}`, `/${ANA.handle}/calculo/limites`]) {
    for (let i = 0; i < 3; i++) await fetch(`${baseURL}${route}`);
  }
}

/** Abre o Chromium com a porta de depuração, num perfil novo dentro do diretório temporário da rodada. */
async function launchBrowser() {
  const executable = process.env.E2E_CHROMIUM_PATH?.trim() || chromium.executablePath();
  if (!fs.existsSync(executable)) throw new Error(`Chromium não encontrado em ${executable}. Instale-o com 'npx playwright install chromium' ou defina E2E_CHROMIUM_PATH.`);
  const profile = path.join(dir, "chrome-profile");
  browser = spawn(executable, [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--disable-extensions", "--disable-gpu", "about:blank"], {
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // ainda abrindo
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("o Chromium não abriu a porta de depuração");
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Uma rodada do Lighthouse. @returns {Promise<{ lhr: any, html: string }>} */
async function runOnce(url, profile) {
  const flags = { port: DEBUG_PORT, output: ["html"], logLevel: "error", onlyCategories: CATEGORIES };
  const result = await lighthouse(url, flags, profile === "desktop" ? desktopConfig : undefined);
  if (!result) throw new Error("o Lighthouse não devolveu resultado");
  return { lhr: result.lhr, html: Array.isArray(result.report) ? result.report[0] : result.report };
}

/** @param {any} lhr */
function summarize(lhr) {
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const audit = (id) => lhr.audits[id]?.numericValue ?? NaN;
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
    lcp: audit("largest-contentful-paint"),
    cls: audit("cumulative-layout-shift"),
    tbt: audit("total-blocking-time"),
    fcp: audit("first-contentful-paint"),
    si: audit("speed-index"),
  };
}

async function main() {
  console.log(`Lighthouse ${RUNS} rodada(s) por página e perfil, sobre ${baseURL} (banco temporário em ${dir})`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  execFileSync(process.execPath, [path.join(projectRoot, "e2e", "support", "prepare-database.mjs")], { cwd: projectRoot, env: ENV, stdio: ["ignore", "ignore", "inherit"] });
  console.log("  banco migrado; next build…");
  execFileSync(process.execPath, [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: projectRoot, env: ENV, stdio: ["ignore", "ignore", "inherit"] });
  // O mesmo comando de `npm run admin:create` (tsx com o jsconfig), sem o `npm` e sem `shell`.
  execFileSync(process.execPath, [path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--tsconfig", "jsconfig.json", "scripts/create-admin.js"], { cwd: projectRoot, env: ENV, stdio: ["ignore", "ignore", "inherit"] });
  server = spawn(process.execPath, [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(environment.port)], {
    cwd: projectRoot,
    env: ENV,
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer();
  console.log("  servidor no ar; montando os dados…");
  await seed();
  await launchBrowser();

  /** @type {Record<string, Record<string, ReturnType<typeof summarize>[]>>} */
  const all = {};
  for (const profile of ["mobile", "desktop"]) {
    for (const page of PAGES) {
      const rounds = [];
      let best = null;
      for (let i = 0; i < RUNS; i++) {
        const { lhr, html } = await runOnce(`${baseURL}${page.path}`, profile);
        const summary = summarize(lhr);
        rounds.push({ summary, lhr, html });
        console.log(`  ${profile} ${page.name} rodada ${i + 1}/${RUNS}: desempenho=${summary.performance} LCP=${Math.round(summary.lcp)}ms CLS=${summary.cls.toFixed(3)} TBT=${Math.round(summary.tbt)}ms`);
      }
      // O relatório guardado é o da rodada de desempenho mediano (a do meio).
      const sorted = [...rounds].sort((a, b) => a.summary.performance - b.summary.performance);
      best = sorted[Math.floor(sorted.length / 2)];
      fs.writeFileSync(path.join(OUT_DIR, `${page.key}-${profile}.html`), best.html);
      fs.writeFileSync(path.join(OUT_DIR, `${page.key}-${profile}.json`), JSON.stringify(best.lhr));
      (all[profile] ??= {})[page.key] = rounds.map((round) => round.summary);
    }
  }
  report(all);
}

/** @param {Record<string, Record<string, ReturnType<typeof summarize>[]>>} all */
function report(all) {
  const lines = [];
  const range = (values, fmt = (v) => String(v)) => (values.length > 1 ? `${fmt(Math.min(...values))}–${fmt(Math.max(...values))}` : "—");
  for (const profile of ["mobile", "desktop"]) {
    lines.push("", `Perfil ${profile === "mobile" ? "MÓVEL (Moto G Power simulado, 4G lenta, CPU 4x)" : "DESKTOP"}: mediana de ${RUNS} rodada(s) (entre parênteses, a menor e a maior)`);
    lines.push("| Página | Desempenho | Acessibilidade | Boas práticas | SEO | LCP (s) | CLS | TBT (ms) | FCP (s) | SI (s) |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const page of PAGES) {
      const rounds = all[profile]?.[page.key];
      if (!rounds) continue;
      const col = (key) => rounds.map((round) => round[key]);
      const fmtScore = (key) => `${median(col(key))} (${range(col(key))})`;
      const sec = (key) => `${(median(col(key)) / 1000).toFixed(2)} (${range(col(key), (v) => (v / 1000).toFixed(2))})`;
      lines.push(
        `| ${page.name} | ${fmtScore("performance")} | ${fmtScore("accessibility")} | ${fmtScore("bestPractices")} | ${fmtScore("seo")} | ${sec("lcp")} | ${median(col("cls")).toFixed(3)} (${range(col("cls"), (v) => v.toFixed(3))}) | ${Math.round(median(col("tbt")))} (${range(col("tbt"), (v) => String(Math.round(v)))}) | ${sec("fcp")} | ${sec("si")} |`,
      );
    }
  }
  const mobile = PAGES.map((page) => ({ page, rounds: all.mobile?.[page.key] })).filter((entry) => entry.rounds);
  const meets = mobile.every(({ rounds }) => median(rounds.map((r) => r.performance)) >= 90 && median(rounds.map((r) => r.lcp)) <= 2500);
  lines.push("", `Meta do RNF02 (móvel: desempenho ≥ 90 e LCP ≤ 2,5 s, em todas as páginas): ${meets ? "ATINGIDA" : "NÃO ATINGIDA"}`);
  const text = lines.join("\n");
  console.log(text);
  fs.writeFileSync(path.join(OUT_DIR, "resultado.md"), `${text}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "resultado.json"), JSON.stringify(all, null, 1));
  console.log(`\nRelatórios em ${OUT_DIR} (os HTML são da rodada de desempenho mediano).`);
}

process.on("SIGINT", () => cleanup().finally(() => process.exit(130)));
main()
  .then(() => cleanup())
  .catch(async (error) => {
    console.error(error);
    await cleanup();
    process.exitCode = 1;
  });
