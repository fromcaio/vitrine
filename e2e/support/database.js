// Acesso direto ao banco SQLite temporário da rodada, para preparar e limpar o estado dos testes.
// Usa o better-sqlite3 (já é dependência do projeto) e abre uma conexão curta a cada chamada: o
// servidor `next start` mantém a dele, e o SQLite serializa as escritas dos dois processos.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { e2eEnvironment, projectRoot } from "./env.js";

/**
 * Esvazia todas as tabelas de dados (usuários, sessões, contas, conteúdos e configuração), na
 * ordem das chaves estrangeiras, e preserva o histórico de migrações. A configuração é recriada
 * pelo servidor no próximo acesso (`getConfiguration` faz *upsert*).
 */
export function clearDatabase() {
  const { dbFile, dir } = e2eEnvironment();
  // Salvaguarda: só mexe no banco do diretório temporário da rodada.
  if (!path.resolve(dbFile).startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("Banco de teste fora do diretório temporário da rodada.");
  }
  const db = new Database(dbFile, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 10000");
    db.exec(`
      DELETE FROM contents;
      DELETE FROM session;
      DELETE FROM account;
      DELETE FROM verification;
      DELETE FROM configurations;
      DELETE FROM user;
    `);
  } finally {
    db.close();
  }
}

/**
 * Apaga o diretório temporário da rodada (banco e arquivos auxiliares). O Playwright só encerra o
 * servidor depois do `globalTeardown`: no Windows, o SQLite aberto impede a remoção (EPERM/EBUSY).
 * Nesse caso, entrega a tarefa a `remove-later.mjs`, um processo solto que espera o servidor
 * morrer. O diretório é sempre do sistema operacional (`os.tmpdir()`), nunca do repositório.
 */
export function removeRunDirectory() {
  const { dir } = e2eEnvironment();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    const child = spawn(process.execPath, [path.join(projectRoot, "e2e", "support", "remove-later.mjs"), dir], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}
