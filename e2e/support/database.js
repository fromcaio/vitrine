// Acesso direto ao banco SQLite temporário da rodada, para preparar e limpar o estado dos testes.
// Usa o better-sqlite3 (já é dependência do projeto) e abre uma conexão curta a cada chamada: o
// servidor `next start` mantém a dele, e o SQLite serializa as escritas dos dois processos.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { e2eEnvironment, isRunDirectory, projectRoot } from "./env.js";

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
      DELETE FROM notifications;
      DELETE FROM appearances;
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
 * morrer. O diretório é sempre `vitrine-e2e-*` direto em `os.tmpdir()` (`isRunDirectory`), nunca do repositório.
 */
export function removeRunDirectory() {
  const { dir } = e2eEnvironment();
  // Salvaguarda própria (além da de e2eEnvironment): nunca apaga o que não seja uma pasta de rodada.
  if (!isRunDirectory(dir)) {
    throw new Error(`Recusado: ${dir} não é um diretório de rodada (vitrine-e2e-* em os.tmpdir()).`);
  }
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
