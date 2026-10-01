// CT28: a migração aplica-se em banco vazio e o seed é idempotente. Usa o CLI real do Prisma
// (migrate deploy, migrate status, db seed) contra arquivos temporários, nunca o dev.db.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrisma, toFileUrl } from "../setup/prisma-cli.js";

describe("CT28: migração em banco vazio e seed idempotente", () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let dbFile;
  /** @type {string} */
  let url;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-ct28-"));
    dbFile = path.join(dir, "vazio.db");
    url = toFileUrl(dbFile);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** @template T @param {(db: import("better-sqlite3").Database) => T} fn */
  function inspect(fn) {
    const db = new Database(dbFile, { readonly: true });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  it("aplica a migração em banco vazio e cria tabelas, índices e o índice parcial da raiz", () => {
    expect(fs.existsSync(dbFile)).toBe(false);

    const output = runPrisma(["migrate", "deploy"], url);

    expect(output).toMatch(/applied/i);
    const objects = inspect((db) =>
      db.prepare("select type, name, sql from sqlite_master where name not like 'sqlite_%'").all(),
    );
    const names = objects.map((o) => /** @type {any} */ (o).name);
    expect(names).toEqual(
      expect.arrayContaining([
        "user",
        "session",
        "account",
        "verification",
        "contents",
        "configurations",
        "contents_parentId_slug_key",
        "contents_parentId_order_idx",
        "contents_root_slug_key",
      ]),
    );
    const partial = /** @type {any} */ (objects.find((o) => /** @type {any} */ (o).name === "contents_root_slug_key"));
    expect(partial.sql).toMatch(/WHERE\s+"parentId"\s+IS\s+NULL/i);
  });

  it("deixa o banco em dia: nada pendente e sem diferença para o schema (o índice parcial não é drift)", () => {
    expect(runPrisma(["migrate", "status"], url)).toMatch(/up to date/i);
    expect(() =>
      runPrisma(
        ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
        url,
      ),
    ).not.toThrow();
  });

  it("reaplicar a migração não tem efeito (migrate deploy é idempotente)", () => {
    expect(runPrisma(["migrate", "deploy"], url)).toMatch(/no pending migrations/i);
  });

  it("o seed cria a configuração padrão e, executado de novo, não duplica nem sobrescreve", () => {
    runPrisma(["db", "seed"], url);
    const first = inspect((db) => db.prepare("select * from configurations").all());
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: "default",
      siteName: "Vitrine",
      primaryColor: "#3b82f6",
      secondaryColor: "#1e293b",
      accentColor: "#f59e0b",
      githubUrl: null,
    });

    // O administrador personaliza o site; o seed não pode desfazer isso.
    const rw = new Database(dbFile);
    rw.prepare("update configurations set siteName = 'Personalizado' where id = 'default'").run();
    rw.close();

    runPrisma(["db", "seed"], url);
    const second = inspect((db) => db.prepare("select * from configurations").all());
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: "default", siteName: "Personalizado" });
  });
});
