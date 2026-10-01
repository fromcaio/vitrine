// Executa o CLI do Prisma instalado, apontando para um banco explícito.
// DATABASE_URL é sempre definida aqui: o dotenv do prisma.config.ts não sobrescreve variáveis
// já existentes, então o .env (e o dev.db) nunca entram em jogo.
import { execFileSync } from "node:child_process";
import path from "node:path";

export const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");

/**
 * @param {string[]} args argumentos do CLI (ex.: ["migrate", "deploy"])
 * @param {string} databaseUrl ex.: file:C:/tmp/teste.db
 * @returns {string} saída padrão do comando
 */
export function runPrisma(args, databaseUrl) {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Converte um caminho de arquivo em URL `file:` explícita e absoluta.
 * @param {string} filePath
 */
export function toFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}
