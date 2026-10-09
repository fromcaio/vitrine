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
        "appearances",
        "notifications",
        "images",
        "footer_links",
        "contents_parentId_slug_key",
        "contents_root_owner_slug_key",
        "footer_links_site_icon_key",
      ]),
    );
    const partial = /** @type {any} */ (objects.find((o) => /** @type {any} */ (o).name === "contents_root_owner_slug_key"));
    expect(partial.sql).toMatch(/WHERE\s+"parentId"\s+IS\s+NULL/i);
    const footerPartial = /** @type {any} */ (objects.find((o) => /** @type {any} */ (o).name === "footer_links_site_icon_key"));
    expect(footerPartial.sql).toMatch(/WHERE\s+"ownerId"\s+IS\s+NULL/i);
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
      primaryColor: "#2563eb",
      secondaryColor: "#1e293b",
      accentColor: "#b45309",
      darkPrimaryColor: "#60a5fa",
      darkSecondaryColor: "#cbd5e1",
      darkAccentColor: "#fbbf24",
      directoryEnabled: 1,
      homeBody: null,
      logoImageId: null,
      faviconImageId: null,
      showLogo: 1,
      showName: 1,
      modeIconPair: "sun_moon",
      directoryTitle: "Espaços",
    });

    // O administrador personaliza o site (inclusive os campos do M15); o seed não pode desfazer isso.
    const rw = new Database(dbFile);
    rw.prepare(
      "update configurations set siteName = 'Personalizado', primaryColor = '#123456', darkPrimaryColor = '#654321', " +
        "directoryEnabled = 0, homeBody = 'Texto do portal' where id = 'default'",
    ).run();
    rw.close();

    runPrisma(["db", "seed"], url);
    const second = inspect((db) => db.prepare("select * from configurations").all());
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      id: "default",
      siteName: "Personalizado",
      primaryColor: "#123456",
      darkPrimaryColor: "#654321",
      directoryEnabled: 0,
      homeBody: "Texto do portal",
    });
  });

  it("o seed não cria usuário, aparência nem notificação (o administrador é do admin:create; a aparência nasce sob demanda)", () => {
    const counts = inspect((db) => ({
      users: /** @type {any} */ (db.prepare('select count(*) as n from "user"').get()).n,
      appearances: /** @type {any} */ (db.prepare("select count(*) as n from appearances").get()).n,
      notifications: /** @type {any} */ (db.prepare("select count(*) as n from notifications").get()).n,
    }));
    expect(counts).toEqual({ users: 0, appearances: 0, notifications: 0 });
  });
});
