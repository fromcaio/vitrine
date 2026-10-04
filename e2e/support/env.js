// Ambiente dos testes de ponta a ponta (D-12, ADR-017): um diretório temporário FORA do repositório
// (banco SQLite) e uma porta livre, sorteados uma única vez por rodada. O `playwright.config.js` é
// avaliado no processo principal e de novo em cada *worker*; os valores são guardados em variáveis
// de ambiente (herdadas pelos *workers*) para que todos enxerguem o mesmo banco e a mesma porta.
//
// Todos os valores aqui são FICTÍCIOS: nenhum `.env*` é lido e nenhum segredo real é usado.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

/** Raiz do repositório (o Playwright e o npm rodam a partir dela). */
export const projectRoot = process.cwd();

/** Prefixo do nome do diretório temporário de uma rodada (e só ele pode ser apagado). */
export const RUN_DIR_PREFIX = "vitrine-e2e-";

const RUN_DIR = "VITRINE_E2E_DIR";
const RUN_PORT = "VITRINE_E2E_PORT";
const RUN_SECRET = "VITRINE_E2E_SECRET";

/** Credenciais do administrador de teste (fictícias, criadas por `npm run admin:create`). */
export const ADMIN = Object.freeze({
  email: "admin-e2e@exemplo.test",
  password: "senha-e2e-ficticia-123",
  name: "Administrador E2E",
});

/**
 * O diretório é de uma rodada? Só `vitrine-e2e-*` DIRETAMENTE em `os.tmpdir()`. É a única salvaguarda
 * que decide o que `removeRunDirectory` e `remove-later.mjs` podem apagar (R-003, ressalva 1): um
 * `VITRINE_E2E_DIR` herdado do ambiente que não a satisfaça é recusado, em vez de apagado no fim.
 * @param {string} dir
 */
export function isRunDirectory(dir) {
  const resolved = path.resolve(dir);
  return path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith(RUN_DIR_PREFIX);
}

/** Pede ao sistema operacional uma porta livre em 127.0.0.1. */
function findFreePort() {
  const script =
    'const s=require("node:net").createServer();' +
    's.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});';
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim());
}

/** Converte um caminho em URL `file:` absoluta, como `DATABASE_URL` exige (Prisma 7). */
function toFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

/**
 * Ambiente da rodada. Idempotente: a primeira chamada sorteia o diretório e a porta; as demais
 * (outros processos) reaproveitam os valores herdados.
 */
export function e2eEnvironment() {
  if (!process.env[RUN_DIR] || !process.env[RUN_PORT]) {
    // Só o nome: o diretório é criado por prepare-database.mjs, e listar os testes não deixa lixo.
    process.env[RUN_DIR] = path.join(os.tmpdir(), `${RUN_DIR_PREFIX}${randomUUID().slice(0, 8)}`);
    process.env[RUN_PORT] = String(findFreePort());
    // Aleatório a cada rodada (e nunca gravado): evita os avisos de segredo fraco do better-auth.
    process.env[RUN_SECRET] = randomBytes(32).toString("base64");
  }
  const dir = /** @type {string} */ (process.env[RUN_DIR]);
  const port = Number(process.env[RUN_PORT]);

  // Salvaguarda do teardown: o diretório da rodada é apagado no fim, então um valor herdado do
  // ambiente (`VITRINE_E2E_DIR`) que não seja `vitrine-e2e-*` direto em os.tmpdir() é recusado.
  if (!isRunDirectory(dir)) {
    throw new Error(
      `VITRINE_E2E_DIR deve ser um diretório ${RUN_DIR_PREFIX}* diretamente em ${os.tmpdir()}; recebido: ${dir}`,
    );
  }

  // Salvaguarda: o banco da rodada jamais pode ficar dentro do repositório (nem ser o dev.db).
  if (path.resolve(dir).startsWith(path.resolve(projectRoot) + path.sep)) {
    throw new Error(`O diretório temporário dos testes e2e está dentro do repositório: ${dir}`);
  }

  const dbFile = path.join(dir, "vitrine-e2e.db");
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    dir,
    port,
    dbFile,
    baseURL,
    /**
     * Variáveis do servidor (`next build` e `next start`) e do `admin:create`.
     * NODE_ENV=production é obrigatório: o Playwright define NODE_ENV=test, e a CSP (ADR-022) só
     * é enviada em produção; sem isto o teste de CSP passaria sem verificar nada.
     */
    serverEnv: {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: toFileUrl(dbFile),
      BETTER_AUTH_SECRET: process.env[RUN_SECRET],
      BETTER_AUTH_URL: baseURL,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_NAME: ADMIN.name,
    },
  };
}
