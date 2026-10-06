// Cópia de segurança do SQLite (A-019; RNF10): src/lib/backup.js e `npm run db:backup`
// (scripts/backup-db.js). Bancos temporários em os.tmpdir(), fora do repositório, em WAL, com as
// migrações reais (cópia do banco-modelo). Cobre a cópia consistente com um escritor ativo em outro
// processo, a verificação (que pega banco ruim e apaga a cópia), a recusa de sobrescrita e de destinos
// proibidos, o `--keep`, o que não vaza na saída e o DATABASE_URL relativo e absoluto.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { BACKUP_NAME_PATTERN, BackupError, backupFileName, createBackup, verifyBackup } from "@/lib/backup";
import { databaseFileFromUrl, prisma } from "@/lib/db";
import { projectRoot } from "../setup/prisma-cli.js";

const templateDb = /** @type {string} */ (inject("templateDb"));
const NOW = new Date("2026-10-05T12:34:56Z");
const NAME = "vitrine-2026-10-05T123456Z.db";
const WIN = process.platform === "win32";

const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(projectRoot, "scripts", "backup-db.js");
const jsconfig = path.join(projectRoot, "jsconfig.json");

describe("db:backup: cópia de segurança consistente e verificada (RNF10)", () => {
  /** @type {string} */
  let root;
  let counter = 0;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-backup-"));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** Diretório novo e vazio. @param {string} [label] */
  function freshDir(label = "d") {
    const dir = path.join(root, `${label}-${++counter}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Banco de origem migrado, em WAL, com `users` usuários, `contents` conteúdos (corpo de ~4 KiB) e
   * uma notificação por usuário. O WAL é fechado (checkpoint) para a base ficar no arquivo principal.
   * @param {{ users?: number, contents?: number, name?: string, dir?: string }} [options]
   * @returns {string} caminho do banco
   */
  function makeSource({ users = 20, contents = 50, name = "origem.db", dir = freshDir("src") } = {}) {
    const file = path.join(dir, name);
    fs.copyFileSync(templateDb, file);
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = OFF");
    const body = "texto fictício de enchimento. ".repeat(140);
    db.transaction(() => {
      const user = db.prepare("INSERT INTO user (id, name, email, emailVerified, updatedAt) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)");
      const note = db.prepare("INSERT INTO notifications (id, userId, type, data, updatedAt) VALUES (?, ?, 'ACCOUNT', '{}', CURRENT_TIMESTAMP)");
      for (let u = 0; u < users; u++) {
        user.run(`base-${u}`, `Base ${u}`, `base-${u}@exemplo.test`);
        note.run(`base-${u}-n`, `base-${u}`);
      }
      const content = db.prepare(
        "INSERT INTO contents (id, title, slug, body, type, authorId, updatedAt) VALUES (?, ?, ?, ?, 'DOCUMENT', ?, CURRENT_TIMESTAMP)",
      );
      for (let c = 0; c < contents; c++) content.run(`c-${c}`, `Doc ${c}`, `doc-${c}`, body, `base-${c % users}`);
    })();
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    return file;
  }

  /** @param {string} file @param {string} sql */
  function scalar(file, sql) {
    const db = new Database(file, { readonly: true });
    try {
      return /** @type {any} */ (db.prepare(sql).pluck().get());
    } finally {
      db.close();
    }
  }

  /** @param {string} file */
  const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

  /**
   * Executa o comando real (`tsx scripts/backup-db.js`) em um diretório de trabalho temporário.
   * @param {string[]} args
   * @param {Record<string, string | undefined>} env
   * @param {string} cwd
   */
  function runScript(args, env, cwd) {
    const result = spawnSync(process.execPath, [tsxCli, "--tsconfig", jsconfig, script, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: undefined, BACKUP_DIR: undefined, ...env },
      timeout: 60_000,
    });
    return { code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  /** @param {() => unknown} fn @returns {BackupError} */
  function failureOf(fn) {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(BackupError);
      return /** @type {BackupError} */ (error);
    }
    throw new Error("Era esperado um BackupError.");
  }

  describe("a cópia", () => {
    it("o nome segue vitrine-AAAA-MM-DDThhmmssZ.db, em UTC", () => {
      expect(backupFileName(NOW)).toBe(NAME);
      expect(BACKUP_NAME_PATTERN.test(NAME)).toBe(true);
    });

    it("sem escritor: gera uma cópia verificada, com as mesmas linhas, nome final e sem sobras", () => {
      const source = makeSource();
      const dest = path.join(freshDir("dest"), "novo", "sub");

      const result = createBackup({ databaseFile: source, destDir: dest, now: NOW });

      expect(result.file).toBe(path.join(dest, NAME));
      expect(fs.readdirSync(dest)).toEqual([NAME]);
      expect(result.bytes).toBe(fs.statSync(result.file).size);
      expect(result.tables).toBeGreaterThanOrEqual(8);
      expect(result.migrations).toBeGreaterThanOrEqual(2);
      expect(scalar(result.file, "SELECT count(*) FROM user")).toBe(20);
      expect(scalar(result.file, "SELECT count(*) FROM contents")).toBe(50);
      expect(scalar(result.file, "SELECT count(*) FROM notifications")).toBe(20);
      if (!WIN) expect(fs.statSync(result.file).mode & 0o777).toBe(0o600);
    });

    it("não escreve no banco de origem (nem o cria, nem o altera)", () => {
      const source = makeSource();
      const before = sha(source);

      createBackup({ databaseFile: source, destDir: freshDir("dest"), now: NOW });

      expect(sha(source)).toBe(before);
    });

    it("abre o banco só para leitura: o -wal e o -shm deixados por um escritor que morreu ficam como estavam", async () => {
      const source = makeSource();
      const child = spawn(process.execPath, [path.join(import.meta.dirname, "fixtures", "backup-writer.cjs"), source], {
        stdio: ["pipe", "pipe", "inherit"],
        cwd: projectRoot,
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("o escritor não disse ready")), 30_000);
        child.stdout.on("data", (chunk) => {
          if (String(chunk).includes("ready")) {
            clearTimeout(timer);
            resolve(undefined);
          }
        });
      });
      child.kill("SIGKILL"); // sem fechar: o -wal fica com as transações confirmadas e ninguém o checkpointa
      await new Promise((resolve) => child.once("exit", resolve));
      const wal = `${source}-wal`;
      expect(fs.existsSync(wal)).toBe(true);
      const walBefore = sha(wal);
      const mainBefore = sha(source);

      const result = createBackup({ databaseFile: source, destDir: freshDir("dest"), now: NOW });

      // Uma conexão de leitura e escrita faria o checkpoint e apagaria o -wal ao fechar.
      expect(fs.existsSync(wal)).toBe(true);
      expect(sha(wal)).toBe(walBefore);
      expect(sha(source)).toBe(mainBefore);
      expect(scalar(result.file, "SELECT count(*) FROM user WHERE id LIKE 'w-%'")).toBeGreaterThanOrEqual(5);
    }, 60_000);

    it("com um escritor ativo em outro processo (transação longa e escritas em laço), a cópia é consistente", async () => {
      const source = makeSource({ users: 300, contents: 6000 });
      const dest = freshDir("dest");
      const child = spawn(process.execPath, [path.join(import.meta.dirname, "fixtures", "backup-writer.cjs"), source], {
        stdio: ["pipe", "pipe", "inherit"],
        cwd: projectRoot,
      });
      /** @type {string[]} */
      const lines = [];
      /** @param {string} word @returns {Promise<void>} */
      const waitFor = (word) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`o escritor não disse "${word}"`)), 30_000);
          const check = () => {
            if (lines.some((l) => l.startsWith(word))) {
              clearTimeout(timer);
              resolve();
            }
          };
          child.stdout.on("data", (chunk) => {
            lines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
            check();
          });
          check();
        });

      let written = -1;
      try {
        await waitFor("ready");
        const result = createBackup({ databaseFile: source, destDir: dest, now: NOW });

        child.stdin.write("stop\n");
        await waitFor("done");
        written = Number(lines.find((l) => l.startsWith("done"))?.split(" ")[1]);

        // As duas verificações passam e as tabelas e as migrações estão lá (createBackup já as exige).
        expect(result.migrations).toBeGreaterThanOrEqual(2);
        const db = new Database(result.file, { readonly: true });
        try {
          expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
          expect(db.pragma("foreign_key_check")).toEqual([]);
          // A base inteira, e de um instante coerente: cada transação do escritor (1 usuário + 5
          // notificações) está inteira ou ausente.
          expect(db.prepare("SELECT count(*) FROM user WHERE id LIKE 'base-%'").pluck().get()).toBe(300);
          expect(db.prepare("SELECT count(*) FROM contents").pluck().get()).toBe(6000);
          const copied = /** @type {number} */ (db.prepare("SELECT count(*) FROM user WHERE id LIKE 'w-%'").pluck().get());
          expect(copied).toBeGreaterThan(0); // o que o escritor já tinha confirmado (só no -wal) entrou
          expect(copied).toBeLessThan(written); // e o que veio depois do instantâneo não entrou
          const partial = db
            .prepare(
              "SELECT count(*) FROM user u WHERE u.id LIKE 'w-%' AND (SELECT count(*) FROM notifications n WHERE n.userId = u.id) <> 5",
            )
            .pluck()
            .get();
          expect(partial).toBe(0);
          expect(db.prepare("SELECT count(*) FROM notifications WHERE userId LIKE 'w-%'").pluck().get()).toBe(copied * 5);
        } finally {
          db.close();
        }
      } finally {
        child.kill();
      }
    }, 120_000);

    it("o escritor continua inteiro depois da cópia: o banco de origem segue íntegro", async () => {
      const source = makeSource();
      createBackup({ databaseFile: source, destDir: freshDir("dest"), now: NOW });
      const db = new Database(source);
      try {
        db.pragma("foreign_keys = ON");
        db.prepare("INSERT INTO user (id, name, email, emailVerified, updatedAt) VALUES ('x', 'X', 'x@exemplo.test', 1, CURRENT_TIMESTAMP)").run();
        expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      } finally {
        db.close();
      }
    });
  });

  describe("a verificação", () => {
    it("pega uma cópia com bytes estragados", () => {
      const source = makeSource({ contents: 400 });
      const good = createBackup({ databaseFile: source, destDir: freshDir("dest"), now: NOW }).file;
      const sourceDb = new Database(source, { readonly: true });
      try {
        expect(verifyBackup(good, sourceDb).problems).toEqual([]);

        const bad = path.join(path.dirname(good), "estragada.db");
        fs.copyFileSync(good, bad);
        const size = fs.statSync(bad).size;
        const fd = fs.openSync(bad, "r+");
        fs.writeSync(fd, Buffer.alloc(8192, 0xab), 0, 8192, Math.floor(size / 2) - (Math.floor(size / 2) % 4096));
        fs.closeSync(fd);

        expect(verifyBackup(bad, sourceDb).problems.length).toBeGreaterThan(0);
      } finally {
        sourceDb.close();
      }
    });

    it("um banco com violação de chave estrangeira gera uma cópia que NÃO passa: é apagada (erro VERIFY)", () => {
      const source = makeSource();
      const db = new Database(source);
      db.pragma("foreign_keys = OFF");
      db.prepare("INSERT INTO notifications (id, userId, type, data, updatedAt) VALUES ('orfa', 'ninguem', 'ACCOUNT', '{}', CURRENT_TIMESTAMP)").run();
      db.close();
      const dest = freshDir("dest");

      const error = failureOf(() => createBackup({ databaseFile: source, destDir: dest, now: NOW }));

      expect(error.code).toBe("VERIFY");
      expect(error.message).toMatch(/NÃO passou/);
      expect(error.message).toMatch(/chaves estrangeiras/);
      expect(fs.readdirSync(dest)).toEqual([]);
    });

    it("sem o histórico de migrações do Prisma (ou sem tabelas), a cópia não passa e é apagada", () => {
      const source = makeSource();
      const db = new Database(source);
      db.exec("DROP TABLE _prisma_migrations");
      db.close();
      const dest = freshDir("dest");

      const error = failureOf(() => createBackup({ databaseFile: source, destDir: dest, now: NOW }));

      expect(error.code).toBe("VERIFY");
      expect(error.message).toMatch(/_prisma_migrations/);
      expect(fs.readdirSync(dest)).toEqual([]);
    });

    it("pelo comando: banco ruim sai com código 1, apaga a cópia e explica em português", () => {
      const source = makeSource();
      const db = new Database(source);
      db.pragma("foreign_keys = OFF");
      db.prepare("INSERT INTO notifications (id, userId, type, data, updatedAt) VALUES ('orfa', 'ninguem', 'ACCOUNT', '{}', CURRENT_TIMESTAMP)").run();
      db.close();
      const dest = freshDir("dest");

      const run = runScript([dest], { DATABASE_URL: `file:${source}` }, freshDir("cwd"));

      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(/NÃO passou na verificação e foi apagada/);
      expect(run.stderr).not.toMatch(/\bat .*\.js:\d+/); // sem stack trace
      expect(fs.readdirSync(dest)).toEqual([]);
    }, 90_000);
  });

  describe("nunca sobrescreve", () => {
    it("um arquivo com o nome final já existente é preservado, e o erro é claro", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      const existing = path.join(dest, NAME);
      fs.writeFileSync(existing, "conteúdo anterior");

      const error = failureOf(() => createBackup({ databaseFile: source, destDir: dest, now: NOW }));

      expect(error.message).toMatch(/nada foi sobrescrito/);
      expect(fs.readFileSync(existing, "utf8")).toBe("conteúdo anterior");
      expect(fs.readdirSync(dest)).toEqual([NAME]);
    });

    it("duas cópias no mesmo segundo: a primeira fica intacta", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      const first = createBackup({ databaseFile: source, destDir: dest, now: NOW }).file;
      const before = sha(first);

      expect(failureOf(() => createBackup({ databaseFile: source, destDir: dest, now: NOW })).message).toMatch(/sobrescrito/);

      expect(sha(first)).toBe(before);
      expect(fs.readdirSync(dest)).toEqual([NAME]);
    });
  });

  describe("destinos proibidos e uso", () => {
    it("recusa o próprio banco, o -wal, o -shm e um caminho dentro deles", () => {
      const source = makeSource();
      for (const target of [source, `${source}-wal`, `${source}-shm`, path.join(source, "sub"), path.join(`${source}-wal`, "x", "y")]) {
        const error = failureOf(() => createBackup({ databaseFile: source, destDir: target, now: NOW }));
        expect(error.code).toBe("USAGE");
        expect(error.message).toMatch(/próprio banco/);
      }
      expect(scalar(source, "SELECT count(*) FROM user")).toBe(20);
    });

    it("recusa o destino cujo arquivo final seria o próprio banco", () => {
      const dir = freshDir("src");
      const source = makeSource({ name: NAME, dir });

      const error = failureOf(() => createBackup({ databaseFile: source, destDir: dir, now: NOW }));

      expect(error.message).toMatch(/próprio banco/);
      expect(scalar(source, "SELECT count(*) FROM user")).toBe(20);
    });

    it("recusa um destino que é um arquivo comum, um destino vazio, banco ausente e --keep inválido", () => {
      const source = makeSource();
      const file = path.join(freshDir("dest"), "arquivo.txt");
      fs.writeFileSync(file, "x");

      expect(failureOf(() => createBackup({ databaseFile: source, destDir: file, now: NOW })).message).toMatch(/não é um diretório/);
      expect(failureOf(() => createBackup({ databaseFile: source, destDir: "  ", now: NOW })).code).toBe("USAGE");
      expect(failureOf(() => createBackup({ databaseFile: path.join(freshDir(), "nao-existe.db"), destDir: freshDir("dest") })).code).toBe("SOURCE");
      for (const keep of [0, -1, 1.5, Number.NaN]) {
        expect(failureOf(() => createBackup({ databaseFile: source, destDir: freshDir("dest"), keep })).code).toBe("USAGE");
      }
    });

    it("pelo comando: sem destino (argumento e BACKUP_DIR), erro claro e sem criar nada; BACKUP_DIR funciona e o argumento vence", () => {
      const source = makeSource();
      const cwd = freshDir("cwd");
      const env = { DATABASE_URL: `file:${source}` };

      const none = runScript([], env, cwd);
      expect(none.code).toBe(1);
      expect(none.stderr).toMatch(/Informe o diretório de destino/);
      expect(fs.readdirSync(cwd)).toEqual([]);

      const viaEnv = freshDir("viaenv");
      const arg = freshDir("viaarg");
      expect(runScript([], { ...env, BACKUP_DIR: viaEnv }, cwd).code).toBe(0);
      expect(fs.readdirSync(viaEnv)).toHaveLength(1);
      expect(runScript([arg], { ...env, BACKUP_DIR: viaEnv }, cwd).code).toBe(0);
      expect(fs.readdirSync(arg)).toHaveLength(1);
      expect(fs.readdirSync(viaEnv)).toHaveLength(1);
    }, 120_000);

    it("pelo comando: --keep malformado e opção desconhecida saem com 1 e a mensagem de uso", () => {
      const source = makeSource();
      const env = { DATABASE_URL: `file:${source}` };
      const dest = freshDir("dest");
      for (const args of [[dest, "--keep", "0"], [dest, "--keep", "abc"], [dest, "--keep"], [dest, "--keep=-2"], [dest, "--foo"]]) {
        const run = runScript(args, env, freshDir("cwd"));
        expect(run.code).toBe(1);
        expect(run.stderr).toMatch(/Uso: npm run db:backup/);
      }
      expect(fs.readdirSync(dest)).toEqual([]);
    }, 120_000);
  });

  describe("--keep", () => {
    it("apaga só as cópias antigas que casam com o padrão e nunca a recém-criada nem outro arquivo", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      const old = ["2026-01-01T000000Z", "2026-02-01T000000Z", "2026-03-01T000000Z", "2026-04-01T000000Z", "2026-05-01T000000Z"].map(
        (stamp) => `vitrine-${stamp}.db`,
      );
      for (const name of old) fs.writeFileSync(path.join(dest, name), "antiga");
      // Nomes parecidos, mas que NÃO casam, um subdiretório e (onde der) um link com nome de cópia.
      const others = ["vitrine-backup.db", "vitrine-2026-01-01T000000Z.db.bak", "vitrine-2026-01-01T000000.db", "outro.txt", "Vitrine-2025-01-01T000000Z.DB"];
      for (const name of others) fs.writeFileSync(path.join(dest, name), "alheio");
      fs.mkdirSync(path.join(dest, "vitrine-2020-01-01T000000Z.db"));
      fs.writeFileSync(path.join(dest, "vitrine-2020-01-01T000000Z.db", "dentro.txt"), "alheio");
      /** @type {string | null} */
      let link = null;
      try {
        fs.symlinkSync(path.join(dest, "outro.txt"), path.join(dest, "vitrine-2019-01-01T000000Z.db"));
        link = "vitrine-2019-01-01T000000Z.db";
      } catch {
        // Windows sem privilégio para links: o caso fica de fora
      }

      const result = createBackup({ databaseFile: source, destDir: dest, keep: 3, now: NOW });

      expect(result.pruned.sort()).toEqual([old[0], old[1], old[2]].sort());
      const left = fs.readdirSync(dest).sort();
      expect(left).toContain(NAME);
      expect(left).toContain(old[3]);
      expect(left).toContain(old[4]);
      for (const name of others) expect(left).toContain(name);
      expect(fs.readFileSync(path.join(dest, "vitrine-2020-01-01T000000Z.db", "dentro.txt"), "utf8")).toBe("alheio");
      expect(left).toContain("vitrine-2020-01-01T000000Z.db");
      if (link) expect(left).toContain(link);
      expect(fs.readFileSync(path.join(dest, "outro.txt"), "utf8")).toBe("alheio");
    });

    it("com --keep 1 só a recém-criada fica entre as cópias, mesmo que haja outra datada no futuro", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      fs.writeFileSync(path.join(dest, "vitrine-2026-09-01T000000Z.db"), "antiga");
      fs.writeFileSync(path.join(dest, "vitrine-2999-01-01T000000Z.db"), "futura");

      createBackup({ databaseFile: source, destDir: dest, keep: 1, now: NOW });

      const left = fs.readdirSync(dest).filter((name) => BACKUP_NAME_PATTERN.test(name));
      expect(left).toContain(NAME);
      expect(left).not.toContain("vitrine-2026-09-01T000000Z.db");
    });

    it("sem --keep nada é apagado; uma cópia que falha na verificação não poda nada", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      fs.writeFileSync(path.join(dest, "vitrine-2026-01-01T000000Z.db"), "antiga");
      createBackup({ databaseFile: source, destDir: dest, now: NOW });
      expect(fs.readdirSync(dest)).toHaveLength(2);

      const db = new Database(source);
      db.exec("DROP TABLE _prisma_migrations");
      db.close();
      failureOf(() => createBackup({ databaseFile: source, destDir: dest, keep: 1, now: new Date("2026-10-06T00:00:00Z") }));

      expect(fs.readdirSync(dest)).toHaveLength(2);
    });

    it("pelo comando: --keep apaga as antigas e informa quantas", () => {
      const source = makeSource();
      const dest = freshDir("dest");
      for (const day of ["01", "02", "03"]) fs.writeFileSync(path.join(dest, `vitrine-2026-01-${day}T000000Z.db`), "antiga");

      const run = runScript([dest, "--keep", "2"], { DATABASE_URL: `file:${source}` }, freshDir("cwd"));

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Cópias antigas removidas: 2/);
      expect(fs.readdirSync(dest).filter((n) => BACKUP_NAME_PATTERN.test(n))).toHaveLength(2);
    }, 90_000);
  });

  describe("a saída", () => {
    it("imprime só o caminho, o tamanho e a verificação; nunca DATABASE_URL, o caminho do banco nem dado dele", () => {
      const secretDir = freshDir("segredo-do-caminho");
      const source = makeSource({ name: "banco-secreto-xyz.db", dir: secretDir });
      const db = new Database(source);
      db.prepare("INSERT INTO user (id, name, email, emailVerified, updatedAt) VALUES ('seg', 'Fulana Sigilosa', 'sigilo@exemplo.test', 1, CURRENT_TIMESTAMP)").run();
      db.close();
      const dest = freshDir("dest");
      const url = `file:${source}`;

      const run = runScript([dest], { DATABASE_URL: url, BETTER_AUTH_SECRET: "segredo-ficticio-de-teste-0123456789" }, freshDir("cwd"));

      expect(run.code).toBe(0);
      const output = run.stdout + run.stderr;
      expect(run.stdout).toMatch(/Cópia de segurança criada: /);
      expect(run.stdout).toMatch(/Tamanho: .*bytes\)/);
      expect(run.stdout).toMatch(/Verificação: integridade ok; chaves estrangeiras ok; \d+ tabelas; \d+ migrações do Prisma\./);
      for (const leak of [url, "banco-secreto-xyz", "segredo-do-caminho", "Sigilosa", "sigilo@exemplo.test", "segredo-ficticio-de-teste"]) {
        expect(output).not.toContain(leak);
      }
    }, 90_000);

    it("nos erros (banco ausente, URL ausente ou inválida) fala em português, sem stack trace e sem o caminho do banco", () => {
      const cwd = freshDir("cwd");
      const dest = freshDir("dest");
      const missing = path.join(freshDir("src"), "banco-sumido-abc.db");

      const absent = runScript([dest], { DATABASE_URL: `file:${missing}` }, cwd);
      const noUrl = runScript([dest], {}, cwd);
      const badUrl = runScript([dest], { DATABASE_URL: "postgres://u:senha-secreta@h/db" }, cwd);

      for (const run of [absent, noUrl, badUrl]) {
        expect(run.code).toBe(1);
        expect(run.stderr).not.toMatch(/\bat .*:\d+:\d+/);
        expect(run.stdout + run.stderr).not.toContain("banco-sumido-abc");
        expect(run.stdout + run.stderr).not.toContain("senha-secreta");
      }
      expect(absent.stderr).toMatch(/arquivo do banco não existe/);
      expect(noUrl.stderr).toMatch(/DATABASE_URL não definida/);
      expect(badUrl.stderr).toMatch(/DATABASE_URL inválida/);
      expect(fs.readdirSync(dest)).toEqual([]);
    }, 120_000);
  });

  describe("DATABASE_URL", () => {
    it("databaseFileFromUrl: relativo vale a partir do diretório de trabalho; absoluto fica como está", () => {
      const cwd = freshDir("cwd");
      const abs = path.join(freshDir("abs"), "x.db");

      expect(databaseFileFromUrl("file:./dados/x.db", { cwd })).toBe(path.resolve(cwd, "dados", "x.db"));
      expect(databaseFileFromUrl("file:x.db", { cwd })).toBe(path.resolve(cwd, "x.db"));
      expect(databaseFileFromUrl(`file:${abs}`, { cwd })).toBe(abs);
      expect(databaseFileFromUrl(`file:${abs.replaceAll("\\", "/")}`, { cwd })).toBe(abs);
      expect(databaseFileFromUrl("file:./x.db")).toBe(path.resolve(process.cwd(), "x.db"));
    });

    it("databaseFileFromUrl recusa URL ausente, vazia ou de outro tipo", () => {
      for (const bad of [undefined, "", "file:", "postgres://h/db", "./x.db"]) {
        expect(() => databaseFileFromUrl(/** @type {any} */ (bad))).toThrow();
      }
    });

    it("databaseFileFromUrl aponta o mesmo arquivo em que o cliente do db.js grava", async () => {
      const email = `backup-${crypto.randomUUID()}@exemplo.test`;
      await prisma.user.create({ data: { name: "Probe", email, emailVerified: true } });

      const file = databaseFileFromUrl(process.env.DATABASE_URL);

      expect(fs.existsSync(file)).toBe(true);
      const db = new Database(file, { readonly: true });
      try {
        expect(db.prepare("SELECT count(*) FROM user WHERE email = ?").pluck().get(email)).toBe(1);
      } finally {
        db.close();
      }
      await prisma.user.deleteMany({ where: { email } });
    });

    it("pelo comando, com DATABASE_URL relativo e destino relativo ao diretório de trabalho", () => {
      const cwd = freshDir("cwd");
      makeSource({ name: "rel.db", dir: cwd });

      const run = runScript(["copias"], { DATABASE_URL: "file:./rel.db" }, cwd);

      expect(run.code).toBe(0);
      const [name] = fs.readdirSync(path.join(cwd, "copias"));
      expect(BACKUP_NAME_PATTERN.test(name)).toBe(true);
      expect(scalar(path.join(cwd, "copias", name), "SELECT count(*) FROM user")).toBe(20);
    }, 90_000);

    it("pelo comando, com DATABASE_URL absoluto, a cópia sai com as mesmas linhas", () => {
      const source = makeSource({ users: 7 });
      const dest = freshDir("dest");

      const run = runScript([dest], { DATABASE_URL: `file:${source.replaceAll("\\", "/")}` }, freshDir("cwd"));

      expect(run.code).toBe(0);
      const [name] = fs.readdirSync(dest);
      expect(scalar(path.join(dest, name), "SELECT count(*) FROM user")).toBe(7);
    }, 90_000);
  });
});
