// A migração do épico v1 (A-026; ADR-034, ADR-035, ADR-038) aplica-se em banco novo e sobre bancos NO
// ESTADO ANTERIOR (o que só tem `init` e `multiusuario`, populado), sem perder dado: converte os
// links https em footer_links, descarta as URLs de logo e favicon, anula o que valia o padrão antigo
// em appearances e recria o índice parcial do rodapé. O SQL aplicado é o do próprio arquivo da
// migração; um cenário passa pelo CLI real (baseline com `migrate resolve`, depois `migrate deploy`).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { projectRoot, runPrisma, toFileUrl } from "../setup/prisma-cli.js";
import { ALL_REQUIRED_INDEXES, indexProblems } from "./helpers.js";

const migrationsDir = path.join(projectRoot, "prisma", "migrations");
const migrationNames = fs.readdirSync(migrationsDir).filter((name) => fs.statSync(path.join(migrationsDir, name)).isDirectory()).sort();
const INIT = /** @type {string} */ (migrationNames.find((name) => name.endsWith("_init")));
const MULTI = /** @type {string} */ (migrationNames.find((name) => name.endsWith("_multiusuario")));
const V1 = /** @type {string} */ (migrationNames.find((name) => name.endsWith("_epico_v1_midia_rodape")));
const sqlOf = (/** @type {string} */ name) => fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

const templateDb = /** @type {string} */ (inject("templateDb"));
const T0 = "2026-09-01T10:00:00.000+00:00";

/** Colunas que a migração nunca deve alterar, por tabela (tudo o que não é aparência nem site). */
const PRESERVED = {
  user: ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "role", "banned", "banReason", "banExpires", "handle", "mustChangePassword"],
  account: ["id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"],
  session: ["id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"],
  contents: ["id", "title", "slug", "body", "type", "status", "order", "parentId", "authorId", "createdAt", "updatedAt"],
  notifications: ["id", "userId", "type", "severity", "dedupeKey", "data", "readAt", "resolvedAt", "createdAt", "updatedAt"],
};

/**
 * Hash por linha (ordenado pelo id) das colunas dadas: igual antes e depois = nada perdido nem alterado.
 * @param {import("better-sqlite3").Database} db
 * @param {keyof PRESERVED} table
 */
function rowHashes(db, table) {
  const columns = PRESERVED[table].map((column) => `"${column}"`).join(", ");
  return /** @type {any[]} */ (db.prepare(`SELECT ${columns} FROM "${table}" ORDER BY "id"`).all()).map((row) =>
    crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex"),
  );
}

/** @param {import("better-sqlite3").Database} db @param {string} table @param {Record<string, unknown>} row */
function insert(db, table, row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO "${table}"(${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((k) => `@${k}`).join(", ")})`).run(row);
}

/** Padrões antigos de Appearance (a tabela do estado anterior os gravava em toda linha). */
const OLD = {
  primaryColor: "#2563eb",
  secondaryColor: "#1e293b",
  accentColor: "#b45309",
  darkPrimaryColor: "#60a5fa",
  darkSecondaryColor: "#cbd5e1",
  darkAccentColor: "#fbbf24",
};
const NO_LINKS = { discordUrl: null, githubUrl: null, youtubeUrl: null, instagramUrl: null, linkedinUrl: null, twitchUrl: null };

/**
 * O banco no estado anterior ao épico: `init` + `multiusuario` aplicadas, e populado.
 * @param {string} file
 * @param {(db: import("better-sqlite3").Database) => void} [populate]
 */
function previousStateDatabase(file, populate = () => {}) {
  const db = new Database(file);
  db.exec(sqlOf(INIT));
  db.exec(sqlOf(MULTI));
  populate(db);
  return db;
}

/** @param {import("better-sqlite3").Database} db */
function populateRealistic(db) {
  insert(db, "user", { id: "u1", name: "Admin", email: "admin@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "admin", handle: "admin" });
  insert(db, "user", { id: "u2", name: "Ana", email: "ana@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "user", handle: "ana" });
  insert(db, "user", { id: "u3", name: "Bia", email: "bia@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "user", handle: null });
  insert(db, "user", { id: "u4", name: "Caio", email: "caio@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "user", handle: "caio" });
  insert(db, "user", { id: "u5", name: "Davi", email: "davi@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "user", handle: "davi" });
  insert(db, "account", { id: "acc1", accountId: "u1", providerId: "credential", userId: "u1", password: "hash-ficticio", createdAt: T0, updatedAt: T0 });
  insert(db, "session", { id: "ses1", expiresAt: "2026-12-01T00:00:00.000+00:00", token: "tok1", userId: "u1", ipAddress: "203.0.113.7", userAgent: "ficticio", createdAt: T0, updatedAt: T0 });
  insert(db, "contents", { id: "c1", title: "Raiz", slug: "raiz", body: null, type: "COLLECTION", status: "PUBLISHED", order: 0, parentId: null, authorId: "u2", createdAt: T0, updatedAt: T0 });
  insert(db, "contents", { id: "c2", title: "Doc ação", slug: "doc", body: "Fórmula $E=mc^2$ 😀", type: "DOCUMENT", status: "DRAFT", order: 0, parentId: "c1", authorId: "u2", createdAt: T0, updatedAt: T0 });
  insert(db, "notifications", { id: "n1", userId: "u2", type: "MODERATION", severity: "WARNING", dedupeKey: null, data: '{"event":"CONTENT_EDITED","reason":"x"}', readAt: null, resolvedAt: null, createdAt: T0, updatedAt: T0 });

  // O site: os seis links https (todo ramo da conversão tem dado); logo e favicon por URL
  insert(db, "configurations", {
    id: "default", siteName: "Meu Site", siteDescription: "Descrição", ...OLD, primaryColor: "#123456",
    logoUrl: "https://x.test/logo.png", faviconUrl: "https://x.test/favicon.ico",
    discordUrl: "https://discord.gg/site", githubUrl: "https://github.com/site", youtubeUrl: "https://youtube.com/@site",
    instagramUrl: "https://instagram.com/site", linkedinUrl: "https://linkedin.com/in/site", twitchUrl: "https://twitch.tv/site",
    homeBody: "# Portal", directoryEnabled: 0, updatedAt: T0,
  });

  // O administrador: paleta clara personalizada em UMA cor; noturna e nome no padrão antigo
  insert(db, "appearances", {
    ownerId: "u1", siteName: "Vitrine", siteDescription: "Do admin", ...OLD, primaryColor: "#111111",
    logoUrl: "https://x.test/admin.png", faviconUrl: null, ...NO_LINKS, githubUrl: "https://github.com/admin", twitchUrl: "https://twitch.tv/admin",
    createdAt: T0, updatedAt: T0,
  });
  // Ana: claro no padrão antigo em MAIÚSCULAS; noturno com UMA cor mudada; nome próprio; os seis links https
  insert(db, "appearances", {
    ownerId: "u2", siteName: "Notas da Ana", siteDescription: null, ...OLD,
    primaryColor: "#2563EB", secondaryColor: "#1E293B", accentColor: "#B45309", darkSecondaryColor: "#000000",
    logoUrl: null, faviconUrl: null,
    discordUrl: "https://discord.gg/ana", githubUrl: "https://github.com/ana", youtubeUrl: "https://youtube.com/@ana",
    instagramUrl: "https://instagram.com/ana", linkedinUrl: "https://linkedin.com/in/ana", twitchUrl: "https://twitch.tv/ana",
    createdAt: T0, updatedAt: T0,
  });
  // Bia: só valores que NÃO são https:// de verdade, e um https com o esquema em maiúsculas
  insert(db, "appearances", {
    ownerId: "u3", siteName: "Bia", siteDescription: null, ...OLD, logoUrl: null, faviconUrl: null,
    discordUrl: "ftp://exemplo.test/x", githubUrl: "javascript:alert(1)", youtubeUrl: "https://", instagramUrl: "mailto:bia@exemplo.test",
    linkedinUrl: "HTTPS://Exemplo.TEST/bia", twitchUrl: "http://twitch.tv/bia", createdAt: T0, updatedAt: T0,
  });
  // Caio: SÓ a cor de destaque mudada, nos dois modos (as outras duas de cada modo no padrão)
  insert(db, "appearances", {
    ownerId: "u4", siteName: "Caio", siteDescription: null, ...OLD, accentColor: "#0f766e", darkAccentColor: "#f59e0b",
    logoUrl: null, faviconUrl: null, ...NO_LINKS, createdAt: T0, updatedAt: T0,
  });
  // Davi: SÓ a secundária mudada no claro e SÓ a primária mudada no noturno
  insert(db, "appearances", {
    ownerId: "u5", siteName: "Davi", siteDescription: null, ...OLD, secondaryColor: "#334155", darkPrimaryColor: "#38bdf8",
    logoUrl: null, faviconUrl: null, ...NO_LINKS, createdAt: T0, updatedAt: T0,
  });
}

/** @param {import("better-sqlite3").Database} db */
const footerLinks = (db) =>
  /** @type {any[]} */ (db.prepare('SELECT "ownerId", "icon", "url", "order" FROM "footer_links" ORDER BY "ownerId", "order"').all()).map((l) => [l.ownerId, l.icon, l.url, l.order]);

describe("migração do épico v1 (A-026)", () => {
  /** @type {string} */
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-epico-v1-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** @param {string} name */
  const fileFor = (name) => path.join(dir, `${name}-${crypto.randomUUID().slice(0, 8)}.db`);

  it("vem depois da inicial e da multiusuário, que não foram tocadas (as posteriores têm testes próprios)", () => {
    expect(migrationNames.indexOf(INIT)).toBeLessThan(migrationNames.indexOf(MULTI));
    expect(migrationNames.indexOf(MULTI)).toBeLessThan(migrationNames.indexOf(V1));
  });

  describe("banco novo (todas as migrações, pelo CLI)", () => {
    it("cria as tabelas novas vazias, com os padrões, e todos os índices nomeados", () => {
      const db = new Database(templateDb, { readonly: true });
      try {
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
        expect(db.prepare("SELECT count(*) AS n FROM images").get()).toEqual({ n: 0 });
        expect(db.prepare("SELECT count(*) AS n FROM footer_links").get()).toEqual({ n: 0 });
        const columns = (/** @type {string} */ table) => /** @type {any[]} */ (db.pragma(`table_info("${table}")`)).map((c) => c.name);
        for (const table of ["configurations", "appearances"]) {
          for (const removed of ["logoUrl", "faviconUrl", "discordUrl", "githubUrl", "youtubeUrl", "instagramUrl", "linkedinUrl", "twitchUrl"]) {
            expect(columns(table), `${table}.${removed}`).not.toContain(removed);
          }
          expect(columns(table)).toEqual(expect.arrayContaining(["logoImageId", "faviconImageId", "showLogo", "showName"]));
        }
        expect(columns("configurations")).toEqual(expect.arrayContaining(["modeIconPair", "directoryTitle"]));
        expect(columns("user")).toContain("avatarImageId");
      } finally {
        db.close();
      }
    });

    it("as seis cores e o siteName de appearances são anuláveis e sem padrão; os de configurations são obrigatórios com padrão", () => {
      const db = new Database(templateDb, { readonly: true });
      try {
        const info = (/** @type {string} */ table) => Object.fromEntries(/** @type {any[]} */ (db.pragma(`table_info("${table}")`)).map((c) => [c.name, c]));
        const appearances = info("appearances");
        const configurations = info("configurations");
        for (const field of ["siteName", "primaryColor", "secondaryColor", "accentColor", "darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"]) {
          expect(appearances[field], `appearances.${field}`).toMatchObject({ notnull: 0, dflt_value: null });
          expect(configurations[field], `configurations.${field}`).toMatchObject({ notnull: 1 });
          expect(configurations[field].dflt_value, `configurations.${field}`).not.toBeNull();
        }
        expect(configurations.modeIconPair.dflt_value).toBe("'sun_moon'");
        expect(configurations.directoryTitle.dflt_value).toBe("'Espaços'");
        expect(appearances.showLogo).toMatchObject({ notnull: 1, dflt_value: "true" });
        expect(appearances.showName).toMatchObject({ notnull: 1, dflt_value: "true" });
      } finally {
        db.close();
      }
    });

    it("as chaves estrangeiras seguem o desenho: dono em cascata, referências a imagens em SetNull", () => {
      const db = new Database(templateDb, { readonly: true });
      try {
        const fks = (/** @type {string} */ table) => /** @type {any[]} */ (db.pragma(`foreign_key_list("${table}")`)).map((f) => `${f.from}->${f.table}.${f.to}:${f.on_delete}`).sort();
        expect(fks("images")).toEqual(["ownerId->user.id:CASCADE"]);
        expect(fks("footer_links")).toEqual(["ownerId->user.id:CASCADE"]);
        expect(fks("appearances")).toEqual(["faviconImageId->images.id:SET NULL", "logoImageId->images.id:SET NULL", "ownerId->user.id:CASCADE"]);
        expect(fks("configurations")).toEqual(["faviconImageId->images.id:SET NULL", "logoImageId->images.id:SET NULL"]);
        expect(fks("user")).toEqual(["avatarImageId->images.id:SET NULL"]);
      } finally {
        db.close();
      }
    });
  });

  describe("sobre um banco no estado anterior, populado", () => {
    /** @param {(sql: string) => string} [transform] SQL da migração (para as mutações do teste) */
    function migrated(transform = (sql) => sql) {
      const db = previousStateDatabase(fileFor("anterior"), populateRealistic);
      const before = {
        hashes: Object.fromEntries(Object.keys(PRESERVED).map((table) => [table, rowHashes(db, /** @type {any} */ (table))])),
        appearanceOwners: /** @type {any[]} */ (db.prepare("SELECT ownerId FROM appearances ORDER BY ownerId").all()).map((r) => r.ownerId),
      };
      db.exec(transform(sqlOf(V1)));
      db.pragma("foreign_keys = ON");
      return { db, before };
    }

    it("não perde nem altera usuários, contas, sessões, conteúdo nem notificações (linha por linha)", () => {
      const { db, before } = migrated();
      try {
        for (const table of Object.keys(PRESERVED)) {
          expect(rowHashes(db, /** @type {any} */ (table)), `linhas de ${table}`).toEqual(before.hashes[table]);
        }
        expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
        expect(db.pragma("foreign_key_check")).toEqual([]);
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
        // a conta redefinida ganha a coluna do avatar, vazia; nenhuma imagem nasce
        expect(db.prepare('SELECT count(*) AS n FROM "user" WHERE "avatarImageId" IS NOT NULL').get()).toEqual({ n: 0 });
        expect(db.prepare("SELECT count(*) AS n FROM images").get()).toEqual({ n: 0 });
      } finally {
        db.close();
      }
    });

    it("converte os seis links https do SITE em footer_links (dono nulo), na sequência dos ícones", () => {
      const { db } = migrated();
      try {
        const site = footerLinks(db).filter((l) => l[0] === null);
        expect(site).toEqual([
          [null, "discord", "https://discord.gg/site", 0],
          [null, "github", "https://github.com/site", 1],
          [null, "youtube", "https://youtube.com/@site", 2],
          [null, "instagram", "https://instagram.com/site", 3],
          [null, "linkedin", "https://linkedin.com/in/site", 4],
          [null, "twitch", "https://twitch.tv/site", 5],
        ]);
      } finally {
        db.close();
      }
    });

    it("converte os links de cada Appearance (inclusive a do administrador), com order de 0 a n-1 por dono", () => {
      const { db } = migrated();
      try {
        const all = footerLinks(db);
        expect(all.filter((l) => l[0] === "u1")).toEqual([
          ["u1", "github", "https://github.com/admin", 0],
          ["u1", "twitch", "https://twitch.tv/admin", 1],
        ]);
        expect(all.filter((l) => l[0] === "u2")).toEqual([
          ["u2", "discord", "https://discord.gg/ana", 0],
          ["u2", "github", "https://github.com/ana", 1],
          ["u2", "youtube", "https://youtube.com/@ana", 2],
          ["u2", "instagram", "https://instagram.com/ana", 3],
          ["u2", "linkedin", "https://linkedin.com/in/ana", 4],
          ["u2", "twitch", "https://twitch.tv/ana", 5],
        ]);
      } finally {
        db.close();
      }
    });

    it("só o que é https:// vira link: nulo, ftp, javascript:, mailto:, http e o esquema sozinho são descartados; o esquema em maiúsculas é mantido", () => {
      const { db } = migrated();
      try {
        expect(footerLinks(db).filter((l) => l[0] === "u3")).toEqual([["u3", "linkedin", "HTTPS://Exemplo.TEST/bia", 0]]);
        expect(footerLinks(db).filter((l) => l[0] === "u1").map((l) => l[1])).toEqual(["github", "twitch"]); // os demais eram nulos
        for (const [, , url] of footerLinks(db)) expect(url.toLowerCase(), url).toMatch(/^https:\/\/./);
      } finally {
        db.close();
      }
    });

    it("gera ids únicos em SQL (24 caracteres hexadecimais) e datas legíveis", () => {
      const { db } = migrated();
      try {
        const rows = /** @type {any[]} */ (db.prepare('SELECT id, createdAt, updatedAt FROM "footer_links"').all());
        expect(rows).toHaveLength(6 + 2 + 6 + 1);
        expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
        for (const row of rows) {
          expect(row.id).toMatch(/^[0-9a-f]{24}$/);
          expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);
          expect(row.updatedAt).toBe(row.createdAt);
        }
      } finally {
        db.close();
      }
    });

    it("descarta as URLs de logo e favicon: as colunas somem e nenhuma imagem é criada", () => {
      const { db } = migrated();
      try {
        for (const table of ["configurations", "appearances"]) {
          const columns = /** @type {any[]} */ (db.pragma(`table_info("${table}")`)).map((c) => c.name);
          expect(columns).not.toContain("logoUrl");
          expect(columns).not.toContain("faviconUrl");
        }
        expect(db.prepare('SELECT logoImageId, faviconImageId FROM "configurations"').get()).toEqual({ logoImageId: null, faviconImageId: null });
        expect(db.prepare("SELECT count(*) AS n FROM images").get()).toEqual({ n: 0 });
      } finally {
        db.close();
      }
    });

    it("o site mantém tudo o que tinha e ganha os campos novos com os padrões", () => {
      const { db } = migrated();
      try {
        expect(db.prepare('SELECT * FROM "configurations"').get()).toMatchObject({
          id: "default", siteName: "Meu Site", siteDescription: "Descrição", primaryColor: "#123456", secondaryColor: OLD.secondaryColor,
          accentColor: OLD.accentColor, darkPrimaryColor: OLD.darkPrimaryColor, darkSecondaryColor: OLD.darkSecondaryColor,
          darkAccentColor: OLD.darkAccentColor, homeBody: "# Portal", directoryEnabled: 0,
          logoImageId: null, faviconImageId: null, showLogo: 1, showName: 1, modeIconPair: "sun_moon", directoryTitle: "Espaços",
        });
        expect(db.prepare('SELECT count(*) AS n FROM "configurations"').get()).toEqual({ n: 1 });
      } finally {
        db.close();
      }
    });

    it("ADR-038: a paleta de um modo que vale o padrão antigo vira nula (sem distinguir caixa); mudou uma cor, as três permanecem", () => {
      const { db } = migrated();
      try {
        const row = (/** @type {string} */ id) => /** @type {any} */ (db.prepare('SELECT * FROM "appearances" WHERE ownerId = ?').get(id));
        // u1: claro com UMA cor mudada permanece inteiro; noturno no padrão vira nulo
        expect(row("u1")).toMatchObject({ primaryColor: "#111111", secondaryColor: OLD.secondaryColor, accentColor: OLD.accentColor });
        expect([row("u1").darkPrimaryColor, row("u1").darkSecondaryColor, row("u1").darkAccentColor]).toEqual([null, null, null]);
        // u2: claro no padrão em MAIÚSCULAS vira nulo; noturno com uma cor mudada permanece inteiro
        expect([row("u2").primaryColor, row("u2").secondaryColor, row("u2").accentColor]).toEqual([null, null, null]);
        expect(row("u2")).toMatchObject({ darkPrimaryColor: OLD.darkPrimaryColor, darkSecondaryColor: "#000000", darkAccentColor: OLD.darkAccentColor });
        // u4 e u5: uma ÚNICA cor mudada em cada modo, qualquer que seja ela (primária, secundária ou
        // destaque), mantém a paleta daquele modo inteira; a anulação exige as TRÊS no padrão
        expect(row("u4")).toMatchObject({
          primaryColor: OLD.primaryColor, secondaryColor: OLD.secondaryColor, accentColor: "#0f766e",
          darkPrimaryColor: OLD.darkPrimaryColor, darkSecondaryColor: OLD.darkSecondaryColor, darkAccentColor: "#f59e0b",
        });
        expect(row("u5")).toMatchObject({
          primaryColor: OLD.primaryColor, secondaryColor: "#334155", accentColor: OLD.accentColor,
          darkPrimaryColor: "#38bdf8", darkSecondaryColor: OLD.darkSecondaryColor, darkAccentColor: OLD.darkAccentColor,
        });
        // u3: tudo no padrão: os dois modos viram nulos
        const u3 = row("u3");
        expect([u3.primaryColor, u3.secondaryColor, u3.accentColor, u3.darkPrimaryColor, u3.darkSecondaryColor, u3.darkAccentColor]).toEqual([null, null, null, null, null, null]);
      } finally {
        db.close();
      }
    });

    it("ADR-038: o siteName igual a Vitrine vira nulo; o que o usuário escolheu permanece", () => {
      const { db } = migrated();
      try {
        const names = Object.fromEntries(/** @type {any[]} */ (db.prepare('SELECT ownerId, siteName FROM "appearances"').all()).map((r) => [r.ownerId, r.siteName]));
        expect(names).toEqual({ u1: null, u2: "Notas da Ana", u3: "Bia", u4: "Caio", u5: "Davi" });
      } finally {
        db.close();
      }
    });

    it("a linha de Appearance do administrador continua existindo, com a descrição e o handle intactos", () => {
      const { db, before } = migrated();
      try {
        expect(/** @type {any[]} */ (db.prepare("SELECT ownerId FROM appearances ORDER BY ownerId").all()).map((r) => r.ownerId)).toEqual(before.appearanceOwners);
        expect(db.prepare('SELECT siteDescription, showLogo, showName FROM "appearances" WHERE ownerId = \'u1\'').get()).toEqual({ siteDescription: "Do admin", showLogo: 1, showName: 1 });
        expect(db.prepare('SELECT role, handle FROM "user" WHERE id = \'u1\'').get()).toEqual({ role: "admin", handle: "admin" });
      } finally {
        db.close();
      }
    });

    it("o índice parcial do rodapé do site existe e funciona; o índice parcial de contents continuou no lugar", () => {
      const { db } = migrated();
      try {
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
        expect(() =>
          db.exec(`INSERT INTO "footer_links"("id","ownerId","icon","url","order","updatedAt") VALUES ('dup', NULL, 'discord', 'https://outra.test', 9, '2026-01-01')`),
        ).toThrow(/UNIQUE/);
        expect(() =>
          db.exec(`INSERT INTO "contents"("id","title","slug","type","authorId","updatedAt") VALUES ('x','x','raiz','COLLECTION','u2','2026-01-01')`),
        ).toThrow(/UNIQUE/);
      } finally {
        db.close();
      }
    });

    it("lê pelo cliente do Prisma: as datas gravadas em SQL viram Date válidas", async () => {
      const { db } = migrated();
      // o cliente é o do schema ATUAL: aplica também as migrações posteriores ao épico v1
      for (const later of migrationNames.slice(migrationNames.indexOf(V1) + 1)) db.exec(sqlOf(later));
      const file = db.name;
      db.close();
      const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: toFileUrl(file) }) });
      try {
        const links = await client.footerLink.findMany({ orderBy: [{ ownerId: "asc" }, { order: "asc" }] });
        expect(links).toHaveLength(15);
        for (const l of links) {
          expect(l.createdAt).toBeInstanceOf(Date);
          expect(Number.isNaN(l.createdAt.getTime())).toBe(false);
          expect(Number.isNaN(l.updatedAt.getTime())).toBe(false);
        }
        expect(await client.appearance.findUnique({ where: { ownerId: "u2" } })).toMatchObject({ siteName: "Notas da Ana", primaryColor: null });
      } finally {
        await client.$disconnect();
      }
    });

    describe("o cenário tem dentes: uma migração errada produz outro resultado", () => {
      it("sem a conversão dos links, nenhum link existe", () => {
        const semConversao = (/** @type {string} */ sql) => sql.replace(/WITH "links"[\s\S]*?FROM "valid";/, "");
        expect(semConversao(sqlOf(V1))).not.toBe(sqlOf(V1));
        const { db } = migrated(semConversao);
        try {
          expect(footerLinks(db)).toEqual([]);
        } finally {
          db.close();
        }
      });

      it("aceitando também o http, o resultado ganha links que não são https", () => {
        const aceitaHttp = (/** @type {string} */ sql) => sql.replace("LIKE 'https://_%'", "LIKE 'http%'");
        expect(aceitaHttp(sqlOf(V1))).not.toBe(sqlOf(V1));
        const { db } = migrated(aceitaHttp);
        try {
          const naoHttps = footerLinks(db).filter(([, , url]) => !/^https:\/\//i.test(url));
          expect(naoHttps.length).toBeGreaterThan(0);
        } finally {
          db.close();
        }
      });

      it("perdendo a ordem por dono (sem PARTITION), a ordem deixa de ser 0 a n-1 por dono", () => {
        const semParticao = (/** @type {string} */ sql) => sql.replace('OVER (PARTITION BY "ownerId" ORDER BY "seq")', 'OVER (ORDER BY "ownerId", "seq")');
        expect(semParticao(sqlOf(V1))).not.toBe(sqlOf(V1));
        const { db } = migrated(semParticao);
        try {
          const orders = footerLinks(db).filter((l) => l[0] === "u2").map((l) => l[3]);
          expect(orders).not.toEqual([0, 1, 2, 3, 4, 5]);
        } finally {
          db.close();
        }
      });

      it("sem os UPDATE de nulos, as paletas e o nome permanecem com o padrão antigo (herança nunca aconteceria)", () => {
        const semNulos = (/** @type {string} */ sql) => sql.replace(/UPDATE "appearances" SET "primaryColor" = NULL[\s\S]*?WHERE "siteName" = 'Vitrine';/, "");
        expect(semNulos(sqlOf(V1))).not.toBe(sqlOf(V1));
        const { db } = migrated(semNulos);
        try {
          expect(db.prepare('SELECT primaryColor, siteName FROM "appearances" WHERE ownerId = \'u3\'').get()).toEqual({ primaryColor: OLD.primaryColor, siteName: "Bia" });
          expect(db.prepare('SELECT siteName FROM "appearances" WHERE ownerId = \'u1\'').get()).toEqual({ siteName: "Vitrine" });
        } finally {
          db.close();
        }
      });

      it("sem o índice parcial manual, o rodapé do site aceitaria ícone repetido e a verificação por nome o acusa", () => {
        const semIndice = (/** @type {string} */ sql) => sql.replace(/CREATE UNIQUE INDEX "footer_links_site_icon_key"[^\n]*\n/, "");
        expect(semIndice(sqlOf(V1))).not.toBe(sqlOf(V1));
        const { db } = migrated(semIndice);
        try {
          expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toContain("índice ausente: footer_links_site_icon_key");
        } finally {
          db.close();
        }
      });
    });
  });

  describe("outros estados anteriores", () => {
    it("estado anterior vazio (instalação sem dados)", () => {
      const db = previousStateDatabase(fileFor("vazio"));
      try {
        db.exec(sqlOf(V1));
        expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
        for (const table of ["user", "configurations", "appearances", "footer_links", "images"]) {
          expect(db.prepare(`SELECT count(*) AS n FROM "${table}"`).get(), table).toEqual({ n: 0 });
        }
      } finally {
        db.close();
      }
    });

    it("site sem links e sem nenhuma Appearance: não cria linha de rodapé nem de aparência", () => {
      const db = previousStateDatabase(fileFor("sem-links"), (d) => {
        insert(d, "configurations", { id: "default", siteName: "Vitrine", ...OLD, ...NO_LINKS, directoryEnabled: 1, updatedAt: T0 });
        insert(d, "user", { id: "u1", name: "A", email: "a@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "admin", handle: "a" });
      });
      try {
        db.exec(sqlOf(V1));
        expect(db.prepare('SELECT count(*) AS n FROM "footer_links"').get()).toEqual({ n: 0 });
        expect(db.prepare('SELECT count(*) AS n FROM "appearances"').get()).toEqual({ n: 0 });
        expect(db.prepare('SELECT count(*) AS n FROM "configurations"').get()).toEqual({ n: 1 });
      } finally {
        db.close();
      }
    });

    it("sem a linha do site (nunca salva): só as Appearance geram links", () => {
      const db = previousStateDatabase(fileFor("sem-site"), (d) => {
        insert(d, "user", { id: "u1", name: "A", email: "a@exemplo.test", emailVerified: 1, createdAt: T0, updatedAt: T0, role: "admin", handle: "a" });
        insert(d, "appearances", { ownerId: "u1", siteName: "A", ...OLD, logoUrl: null, faviconUrl: null, ...NO_LINKS, githubUrl: "https://github.com/a", createdAt: T0, updatedAt: T0 });
      });
      try {
        db.exec(sqlOf(V1));
        expect(footerLinks(db)).toEqual([["u1", "github", "https://github.com/a", 0]]);
        expect(db.prepare('SELECT count(*) AS n FROM "configurations"').get()).toEqual({ n: 0 });
      } finally {
        db.close();
      }
    });
  });

  describe("pelo CLI real (migrate resolve das duas primeiras, migrate deploy da nova)", () => {
    it("aplica só a migração nova sobre o banco populado, fica em dia e sem diferença para o schema", async () => {
      const file = fileFor("cli");
      const db = previousStateDatabase(file, populateRealistic);
      db.close();
      const url = toFileUrl(file);

      runPrisma(["migrate", "resolve", "--applied", INIT], url);
      runPrisma(["migrate", "resolve", "--applied", MULTI], url);
      const output = runPrisma(["migrate", "deploy"], url);

      expect(output).toMatch(/applied/i);
      expect(output).toContain(V1);
      expect(runPrisma(["migrate", "status"], url)).toMatch(/up to date/i);
      expect(() => runPrisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], url)).not.toThrow();
      expect(() => runPrisma(["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], url)).not.toThrow();
      const migrated = new Database(file, { readonly: true });
      try {
        expect(indexProblems(migrated, ALL_REQUIRED_INDEXES)).toEqual([]);
        expect(migrated.pragma("foreign_key_check")).toEqual([]);
        expect(migrated.prepare('SELECT count(*) AS n FROM "contents"').get()).toEqual({ n: 2 });
        expect(migrated.prepare('SELECT count(*) AS n FROM "footer_links"').get()).toEqual({ n: 15 });
      } finally {
        migrated.close();
      }
    });
  });
});
