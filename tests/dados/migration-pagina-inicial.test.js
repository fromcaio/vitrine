// A migração da página inicial editável (P-031; M26, ADR-040) aplica-se em banco novo e sobre um
// banco NO ESTADO ANTERIOR (init + multiusuario + épico v1, populado): só acrescenta colunas com
// padrão, preserva o `homeBody` do portal e dá PUBLISHED/true às linhas existentes. O SQL aplicado
// é o do próprio arquivo; um cenário passa pelo CLI real (baseline com `migrate resolve`).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { projectRoot, runPrisma, toFileUrl } from "../setup/prisma-cli.js";
import { ALL_REQUIRED_INDEXES, indexProblems } from "./helpers.js";

const migrationsDir = path.join(projectRoot, "prisma", "migrations");
const migrationNames = fs.readdirSync(migrationsDir).filter((name) => fs.statSync(path.join(migrationsDir, name)).isDirectory()).sort();
const find = (/** @type {string} */ suffix) => /** @type {string} */ (migrationNames.find((name) => name.endsWith(suffix)));
const INIT = find("_init");
const MULTI = find("_multiusuario");
const V1 = find("_epico_v1_midia_rodape");
const HOME = find("_pagina_inicial");
const sqlOf = (/** @type {string} */ name) => fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

const templateDb = /** @type {string} */ (inject("templateDb"));
const T0 = "2026-09-01T10:00:00.000+00:00";
const PORTAL = "# Portal\n\nTexto com acentuação e 😀";

/** @param {import("better-sqlite3").Database} db @param {string} table @param {Record<string, unknown>} row */
function insert(db, table, row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO "${table}"(${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((k) => `@${k}`).join(", ")})`).run(row);
}

/**
 * Hash por linha das colunas dadas: igual antes e depois = intacto.
 * @param {import("better-sqlite3").Database} db
 * @param {string} table
 * @param {string[]} columns
 * @param {string} order
 */
function rowHashes(db, table, columns, order) {
  const list = columns.map((c) => `"${c}"`).join(", ");
  return /** @type {any[]} */ (db.prepare(`SELECT ${list} FROM "${table}" ORDER BY "${order}"`).all()).map((row) =>
    crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex"),
  );
}

/** @type {Record<string, { columns: string[], order: string }>} */
const WATCHED = {
  configurations: {
    columns: ["id", "siteName", "siteDescription", "primaryColor", "secondaryColor", "accentColor", "darkPrimaryColor", "darkSecondaryColor", "darkAccentColor", "logoImageId", "faviconImageId", "showLogo", "showName", "modeIconPair", "directoryTitle", "homeBody", "directoryEnabled", "updatedAt"],
    order: "id",
  },
  appearances: {
    columns: ["ownerId", "siteName", "siteDescription", "primaryColor", "secondaryColor", "accentColor", "darkPrimaryColor", "darkSecondaryColor", "darkAccentColor", "logoImageId", "faviconImageId", "showLogo", "showName", "createdAt", "updatedAt"],
    order: "ownerId",
  },
  user: { columns: ["id", "name", "email", "role", "handle"], order: "id" },
  contents: { columns: ["id", "title", "slug", "body", "type", "status", "order", "parentId", "authorId"], order: "id" },
};

describe("migração da página inicial (P-031)", () => {
  /** @type {string} */
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-pagina-inicial-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** O banco no estado anterior: init + multiusuario + épico v1, populado. */
  function previousState() {
    const file = path.join(dir, `anterior-${crypto.randomUUID().slice(0, 8)}.db`);
    const db = new Database(file);
    for (const name of [INIT, MULTI, V1]) db.exec(sqlOf(name));
    insert(db, "user", { id: "u1", name: "Admin", email: "admin@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "admin", handle: "admin" });
    insert(db, "user", { id: "u2", name: "Ana", email: "ana@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "user", handle: "ana" });
    insert(db, "contents", { id: "c1", title: "Raiz", slug: "raiz", body: "Corpo", type: "COLLECTION", status: "DRAFT", order: 0, parentId: null, authorId: "u2", createdAt: T0, updatedAt: T0 });
    insert(db, "configurations", { id: "default", siteName: "Meu Site", homeBody: PORTAL, directoryEnabled: 0, updatedAt: T0 });
    insert(db, "appearances", { ownerId: "u1", siteName: null, primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333", createdAt: T0, updatedAt: T0 });
    insert(db, "appearances", { ownerId: "u2", siteName: "Notas da Ana", showName: 0, createdAt: T0, updatedAt: T0 });
    return { db, file };
  }

  /** @param {(sql: string) => string} [transform] SQL da migração (para as mutações) */
  function migrated(transform = (sql) => sql) {
    const { db, file } = previousState();
    const before = Object.fromEntries(Object.entries(WATCHED).map(([table, w]) => [table, rowHashes(db, table, w.columns, w.order)]));
    db.exec(transform(sqlOf(HOME)));
    db.pragma("foreign_keys = ON");
    return { db, file, before };
  }

  it("vem depois da inicial, da multiusuário e do épico v1, e é a última", () => {
    expect(migrationNames.indexOf(V1)).toBeLessThan(migrationNames.indexOf(HOME));
    expect(migrationNames.at(-1)).toBe(HOME);
  });

  it("banco novo: colunas com os padrões e todos os índices", () => {
    const db = new Database(templateDb, { readonly: true });
    try {
      const info = (/** @type {string} */ table) => Object.fromEntries(/** @type {any[]} */ (db.pragma(`table_info("${table}")`)).map((c) => [c.name, c]));
      const appearances = info("appearances");
      expect(appearances.homeBody).toMatchObject({ notnull: 0, dflt_value: null });
      expect(appearances.homeStatus).toMatchObject({ notnull: 1, dflt_value: "'PUBLISHED'" });
      expect(appearances.homeShowItems).toMatchObject({ notnull: 1, dflt_value: "true" });
      expect(info("configurations").homeStatus).toMatchObject({ notnull: 1, dflt_value: "'PUBLISHED'" });
      expect(info("configurations").homeBody).toMatchObject({ notnull: 0 });
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("preserva o homeBody do portal e dá os padrões à configuração existente", () => {
    const { db } = migrated();
    try {
      expect(db.prepare('SELECT homeBody, homeStatus, directoryEnabled FROM "configurations"').get()).toEqual({
        homeBody: PORTAL,
        homeStatus: "PUBLISHED",
        directoryEnabled: 0,
      });
    } finally {
      db.close();
    }
  });

  it("as linhas de appearances existentes ficam sem texto, PUBLISHED e com a lista ligada", () => {
    const { db } = migrated();
    try {
      const rows = /** @type {any[]} */ (db.prepare('SELECT ownerId, homeBody, homeStatus, homeShowItems FROM "appearances" ORDER BY ownerId').all());
      expect(rows).toEqual([
        { ownerId: "u1", homeBody: null, homeStatus: "PUBLISHED", homeShowItems: 1 },
        { ownerId: "u2", homeBody: null, homeStatus: "PUBLISHED", homeShowItems: 1 },
      ]);
    } finally {
      db.close();
    }
  });

  it("não altera nenhuma coluna anterior (linha por linha), nem usuários nem conteúdo", () => {
    const { db, before } = migrated();
    try {
      for (const [table, w] of Object.entries(WATCHED)) {
        expect(rowHashes(db, table, w.columns, w.order), table).toEqual(before[table]);
      }
      expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("pelo CLI real: baseline das anteriores, migrate deploy, status em dia e sem diferença para o schema", () => {
    const { db, file } = previousState();
    db.close();
    const url = toFileUrl(file);
    for (const name of [INIT, MULTI, V1]) runPrisma(["migrate", "resolve", "--applied", name], url);
    const output = runPrisma(["migrate", "deploy"], url);
    expect(output).toMatch(/applied/i);
    expect(output).toContain(HOME);
    expect(runPrisma(["migrate", "status"], url)).toMatch(/up to date/i);
    expect(() => runPrisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], url)).not.toThrow();
    expect(() => runPrisma(["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], url)).not.toThrow();
    const after = new Database(file, { readonly: true });
    try {
      expect(after.prepare('SELECT homeBody FROM "configurations"').get()).toEqual({ homeBody: PORTAL });
    } finally {
      after.close();
    }
  });
});
