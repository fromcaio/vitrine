// Testes de ponta a ponta (D-12, ADR-017): Playwright sobre a aplicação de PRODUÇÃO.
//
//   npm run test:e2e            (a primeira vez exige: npx playwright install chromium)
//
// A rodada sobe `next build` + `next start` com um banco SQLite TEMPORÁRIO, fora do repositório,
// em uma porta livre e com variáveis FICTÍCIAS (e2e/support/env.js). O dev.db e qualquer `.env`
// nunca entram: as variáveis da rodada têm precedência sobre os arquivos .env. Os specs ficam em
// `e2e/` e terminam em `.spec.js`; o Vitest (tests/**/*.test.js) não os coleta.
import { defineConfig, devices } from "@playwright/test";
import { e2eEnvironment } from "./e2e/support/env.js";

const { baseURL, port, serverEnv } = e2eEnvironment();

// O build leva minutos na primeira vez; o `next start` só precisa de segundos.
const BUILD_AND_START_TIMEOUT = 5 * 60_000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  // Um único banco e um único administrador: os specs rodam em série.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/support/global-setup.js",
  globalTeardown: "./e2e/support/global-teardown.js",
  use: {
    baseURL,
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 1) migrações no banco temporário (o build pré-renderiza páginas que leem o banco);
    // 2) build de produção; 3) servidor, preso a 127.0.0.1 (mesma origem de BETTER_AUTH_URL).
    command: [
      "node e2e/support/prepare-database.mjs",
      "node node_modules/next/dist/bin/next build",
      `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    ].join(" && "),
    url: `${baseURL}/login`,
    env: serverEnv,
    timeout: BUILD_AND_START_TIMEOUT,
    // Nunca reaproveita um servidor existente: ele apontaria para outro banco.
    reuseExistingServer: false,
    stdout: process.env.E2E_VERBOSE ? "pipe" : "ignore",
    stderr: "pipe",
  },
});
