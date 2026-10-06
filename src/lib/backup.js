// Cópia de segurança consistente e verificada do SQLite (A-019; RNF10, Apêndice D). Usada por
// `npm run db:backup` (scripts/backup-db.js); a restauração é um roteiro do Apêndice D, não código.
//
// Como copia: `VACUUM INTO` sobre uma conexão SOMENTE LEITURA do banco. No modo WAL a leitura
// enxerga um instantâneo coerente (uma única transação de leitura), não bloqueia o escritor do
// servidor e não precisa reiniciar quando ele escreve no meio da cópia, ao contrário da API
// `backup()` (páginas em passos; uma escrita de outro processo entre os passos a reinicia, e um
// escritor constante pode impedi-la de terminar). O preço: reconstrói o arquivo (mais CPU que copiar
// páginas, precisa de espaço temporário do tamanho do banco) e, em um banco grande, a leitura longa
// impede o checkpoint do WAL até acabar (o `-wal` cresce nesse intervalo). A cópia sai compacta.
//
// Módulo de servidor: usa o sistema de arquivos e o better-sqlite3; não importa o Prisma nem o Next.js.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** Espera por um bloqueio de outro processo ao abrir ou ler o banco, em ms (o mesmo de db.js). */
const BUSY_TIMEOUT_MS = 5000;

/** Tabelas que toda cópia precisa ter, além das que o banco de origem tiver. */
export const REQUIRED_TABLES = Object.freeze([
  "user",
  "contents",
  "notifications",
  "configurations",
  "appearances",
  "_prisma_migrations",
]);

/** Padrão do nome de uma cópia: `vitrine-AAAA-MM-DDThhmmssZ.db` (UTC). Só estes arquivos são podados. */
export const BACKUP_NAME_PATTERN = /^vitrine-\d{4}-\d{2}-\d{2}T\d{6}Z\.db$/;

/** Erro previsto (uso, banco ausente, verificação): a mensagem já está em português e pode ser impressa. */
export class BackupError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: "USAGE" | "SOURCE" | "VERIFY" | "IO" }} [options]
   */
  constructor(message, { code = "IO" } = {}) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

/**
 * `vitrine-AAAA-MM-DDThhmmssZ.db` para o instante dado, em UTC.
 * @param {Date} now
 */
export function backupFileName(now) {
  const stamp = now.toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "");
  // 20261005T123456 -> 2026-10-05T123456
  return `vitrine-${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}${stamp.slice(8)}Z.db`;
}

/**
 * Resolve o caminho real, mesmo que o final ainda não exista: o `realpath` do trecho que existe
 * (segue links simbólicos) mais o resto. Serve para comparar destinos com o banco.
 * @param {string} target
 * @returns {string}
 */
function realPathLoose(target) {
  const absolute = path.resolve(target);
  /** @type {string[]} */
  const rest = [];
  let current = absolute;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/** @param {string} p */
const normalizeForCompare = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

/**
 * `child` é `parent` ou está dentro de `parent` (comparação por componentes de caminho).
 * @param {string} parent
 * @param {string} child
 */
function isSameOrInside(parent, child) {
  const rel = path.relative(normalizeForCompare(parent), normalizeForCompare(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Recusa um destino que seja o banco, o `-wal` ou o `-shm` dele, ou que caia dentro de um deles.
 * @param {string} databaseFile caminho do banco
 * @param {string} target diretório de destino ou arquivo final
 */
function assertNotDatabaseFile(databaseFile, target) {
  const real = realPathLoose(target);
  for (const forbidden of [databaseFile, `${databaseFile}-wal`, `${databaseFile}-shm`, `${databaseFile}-journal`]) {
    if (isSameOrInside(realPathLoose(forbidden), real)) {
      throw new BackupError("O destino é o próprio banco, um arquivo auxiliar dele (-wal, -shm) ou fica dentro deles.", {
        code: "USAGE",
      });
    }
  }
}

/**
 * Abre o banco de origem só para leitura.
 * @param {string} databaseFile
 * @returns {Database.Database}
 */
function openSource(databaseFile) {
  if (!fs.existsSync(databaseFile) || !fs.statSync(databaseFile).isFile()) {
    throw new BackupError(
      "O arquivo do banco não existe. Confira DATABASE_URL e o diretório de trabalho (um caminho relativo vale a partir dele).",
      { code: "SOURCE" },
    );
  }
  try {
    return new Database(databaseFile, { readonly: true, fileMustExist: true, timeout: BUSY_TIMEOUT_MS });
  } catch (error) {
    throw new BackupError(`Não foi possível abrir o banco para leitura (${/** @type {Error} */ (error).message}).`, {
      code: "SOURCE",
    });
  }
}

/**
 * @param {Database.Database} db
 * @returns {string[]}
 */
function tableNames(db) {
  return /** @type {Array<{ name: string }>} */ (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  ).map((row) => row.name);
}

/**
 * Migrações do Prisma aplicadas (terminadas e não revertidas), ordenadas.
 * @param {Database.Database} db
 * @returns {string[]}
 */
function appliedMigrations(db) {
  return /** @type {Array<{ migration_name: string }>} */ (
    db
      .prepare(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
      )
      .all()
  ).map((row) => row.migration_name);
}

/**
 * Verifica uma cópia, abrindo-a só para leitura: `integrity_check` = `ok`, `foreign_key_check` vazio,
 * as tabelas obrigatórias e as da origem, e o histórico de migrações igual ao da origem (e não vazio).
 * Devolve a lista de problemas (vazia = boa) e o resumo.
 * @param {string} copyFile
 * @param {Database.Database} source
 * @returns {{ problems: string[], tables: number, migrations: number }}
 */
export function verifyBackup(copyFile, source) {
  /** @type {string[]} */
  const problems = [];
  let tables = 0;
  let migrations = 0;
  /** @type {Database.Database | null} */
  let copy = null;
  try {
    copy = new Database(copyFile, { readonly: true, fileMustExist: true, timeout: BUSY_TIMEOUT_MS });
    const integrity = /** @type {Array<{ integrity_check: string }>} */ (copy.pragma("integrity_check"));
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      problems.push("A verificação de integridade (integrity_check) falhou.");
    }
    if (copy.pragma("foreign_key_check").length > 0) {
      problems.push("A verificação de chaves estrangeiras (foreign_key_check) encontrou violações.");
    }
    const present = new Set(tableNames(copy));
    tables = present.size;
    const expected = new Set([...REQUIRED_TABLES, ...tableNames(source)]);
    const missing = [...expected].filter((name) => !present.has(name));
    if (missing.length > 0) problems.push(`Faltam tabelas na cópia: ${missing.join(", ")}.`);
    if (present.has("_prisma_migrations")) {
      const fromCopy = appliedMigrations(copy);
      migrations = fromCopy.length;
      const fromSource = appliedMigrations(source);
      if (fromCopy.length === 0) problems.push("A cópia não tem nenhuma migração do Prisma aplicada.");
      else if (fromCopy.join("\n") !== fromSource.join("\n")) {
        problems.push("O histórico de migrações da cópia difere do banco de origem.");
      }
    }
  } catch (error) {
    problems.push(`A cópia não pôde ser verificada (${/** @type {Error} */ (error).message}).`);
  } finally {
    copy?.close();
  }
  return { problems, tables, migrations };
}

/**
 * Remove um arquivo se existir, sem falhar.
 * @param {string} file
 */
function removeQuietly(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // melhor esforço
  }
}

/**
 * Apaga as cópias mais antigas que casam com o padrão do nome, mantendo as `keep` mais recentes e
 * sempre a recém-criada. Só arquivos comuns: nunca outro nome, subdiretório nem link simbólico.
 * @param {string} dir
 * @param {number} keep
 * @param {string} newest nome da cópia recém-criada (nunca é apagada)
 * @returns {string[]} nomes apagados
 */
export function pruneOldBackups(dir, keep, newest) {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse(); // do mais recente (nome em UTC ordena por data) ao mais antigo
  const kept = new Set([newest, ...names.slice(0, keep)]);
  /** @type {string[]} */
  const removed = [];
  for (const name of names) {
    if (kept.has(name)) continue;
    const file = path.join(dir, name);
    if (!fs.lstatSync(file).isFile()) continue; // reconfere: virou link ou diretório
    fs.unlinkSync(file);
    removed.push(name);
  }
  return removed;
}

/**
 * Gera, verifica e (opcionalmente) poda cópias. Lança `BackupError` (já em português) em qualquer
 * falha prevista; uma cópia que não passa na verificação é apagada.
 * @param {{ databaseFile: string, destDir: string, keep?: number, now?: Date }} options
 * @returns {{ file: string, bytes: number, tables: number, migrations: number, pruned: string[] }}
 */
export function createBackup({ databaseFile, destDir, keep, now = new Date() }) {
  if (keep !== undefined && (!Number.isInteger(keep) || keep < 1)) {
    throw new BackupError("--keep exige um número inteiro positivo.", { code: "USAGE" });
  }
  if (typeof destDir !== "string" || destDir.trim() === "") {
    throw new BackupError("Informe o diretório de destino (argumento ou BACKUP_DIR).", { code: "USAGE" });
  }
  const dbFile = path.resolve(databaseFile);
  const dir = path.resolve(destDir);
  const name = backupFileName(now);
  const finalFile = path.join(dir, name);

  assertNotDatabaseFile(dbFile, dir);
  assertNotDatabaseFile(dbFile, finalFile);

  const source = openSource(dbFile);
  const temp = path.join(dir, `.${name}.parcial-${process.pid}`);
  try {
    if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
      throw new BackupError("O destino existe e não é um diretório.", { code: "USAGE" });
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(finalFile)) {
      throw new BackupError("Já existe uma cópia com este nome (mesmo segundo); nada foi sobrescrito. Tente de novo.", {
        code: "IO",
      });
    }

    // A cópia nasce com outro nome e só ganha o nome final depois de verificada: quem lista o
    // diretório nunca vê uma cópia pela metade. `umask` restrito: 0600 onde o sistema o tiver.
    const previousUmask = process.umask(0o077);
    try {
      source.prepare("VACUUM INTO ?").run(temp);
    } catch (error) {
      removeQuietly(temp);
      throw new BackupError(`Falha ao gerar a cópia (${/** @type {Error} */ (error).message}).`, { code: "IO" });
    } finally {
      process.umask(previousUmask);
    }
    try {
      fs.chmodSync(temp, 0o600); // no Windows não tem efeito além do atributo de leitura
    } catch {
      // sistema sem permissões POSIX
    }

    const { problems, tables, migrations } = verifyBackup(temp, source);
    if (problems.length > 0) {
      removeQuietly(temp);
      throw new BackupError(`A cópia NÃO passou na verificação e foi apagada. ${problems.join(" ")}`, { code: "VERIFY" });
    }

    publish(temp, finalFile);
    const bytes = fs.statSync(finalFile).size;
    const pruned = keep === undefined ? [] : pruneOldBackups(dir, keep, name);
    return { file: finalFile, bytes, tables, migrations, pruned };
  } finally {
    removeQuietly(temp);
    source.close();
  }
}

/**
 * Dá o nome final à cópia verificada sem jamais sobrescrever: `link` falha se o destino existe.
 * @param {string} temp
 * @param {string} finalFile
 */
function publish(temp, finalFile) {
  try {
    fs.linkSync(temp, finalFile);
    return;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EEXIST") {
      throw new BackupError("Já existe uma cópia com este nome; nada foi sobrescrito.", { code: "IO" });
    }
    // sistema de arquivos sem links físicos: cai para a conferência seguida de renomeação
  }
  if (fs.existsSync(finalFile)) {
    throw new BackupError("Já existe uma cópia com este nome; nada foi sobrescrito.", { code: "IO" });
  }
  fs.renameSync(temp, finalFile);
}
