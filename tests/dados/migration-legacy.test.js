// CT34: a migração multiusuário aplica-se em banco vazio e sobre CÓPIAS de bancos legados populados,
// sem perder dado (o harness dos bancos do RFC P-008, agora teste). "Legado" é o banco que só tem a
// migração `init`. O SQL aplicado é o do próprio arquivo da migração, o mesmo que o `migrate deploy`
// executa; um cenário passa pelo CLI real (baseline com `migrate resolve`, depois `migrate deploy`).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectRoot, runPrisma, toFileUrl } from "../setup/prisma-cli.js";
import { indexProblems } from "./helpers.js";

const migrationsDir = path.join(projectRoot, "prisma", "migrations");
const migrationNames = fs.readdirSync(migrationsDir).filter((name) => fs.statSync(path.join(migrationsDir, name)).isDirectory()).sort();
const INIT = /** @type {string} */ (migrationNames.find((name) => name.endsWith("_init")));
const MULTI = /** @type {string} */ (migrationNames.find((name) => name.endsWith("_multiusuario")));
const sqlOf = (/** @type {string} */ name) => fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

/** Colunas que a migração nunca deve alterar, por tabela (o que existia antes do M15). */
const PRESERVED = {
  user: ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt"],
  account: ["id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt"],
  session: ["id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"],
  contents: ["id", "title", "slug", "body", "type", "status", "order", "parentId", "createdAt", "updatedAt"],
  configurations: ["id", "siteName", "siteDescription", "secondaryColor", "logoUrl", "faviconUrl", "discordUrl", "githubUrl", "youtubeUrl", "instagramUrl", "linkedinUrl", "twitchUrl", "updatedAt"],
};

/**
 * Hash por linha (ordenado pelo id) das colunas dadas: igual antes e depois = nenhum dado perdido ou
 * alterado.
 * @param {import("better-sqlite3").Database} db
 * @param {keyof PRESERVED} table
 * @returns {string[]}
 */
function rowHashes(db, table) {
  const columns = PRESERVED[table].map((column) => `"${column}"`).join(", ");
  return /** @type {any[]} */ (db.prepare(`SELECT ${columns} FROM "${table}" ORDER BY "id"`).all()).map((row) =>
    crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex"),
  );
}

const T0 = "2026-09-01T10:00:00.000+00:00";

/** @param {import("better-sqlite3").Database} db @param {{ id: string, email: string, created?: string }} user */
function addUser(db, { id, email, created = T0 }) {
  db.prepare('INSERT INTO "user"(id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').run(id, `Nome ${id}`, email, created, created);
}

/** @param {import("better-sqlite3").Database} db @param {Record<string, unknown>} c */
function addContent(db, c) {
  db.prepare(
    'INSERT INTO contents(id, title, slug, body, type, status, "order", parentId, authorId, createdAt, updatedAt) VALUES (@id, @title, @slug, @body, @type, @status, @order, @parentId, @authorId, @created, @created)',
  ).run({ title: `Título ${c.id}`, body: null, type: "COLLECTION", status: "PUBLISHED", order: 0, parentId: null, created: T0, ...c });
}

/** @param {import("better-sqlite3").Database} db @param {string} userId */
function addCredentials(db, userId) {
  db.prepare('INSERT INTO account(id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, \'credential\', ?, ?, ?, ?)').run(`acc-${userId}`, userId, userId, "hash-ficticio", T0, T0);
  db.prepare('INSERT INTO session(id, expiresAt, token, userId, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`ses-${userId}`, "2026-12-01T00:00:00.000+00:00", `tok-${userId}`, userId, "203.0.113.7", "navegador-ficticio", T0, T0);
}

/** @param {import("better-sqlite3").Database} db @param {string} userId árvore de 57 conteúdos com acento, emoji, fórmula e código */
function addLargeTree(db, userId) {
  const bodies = [
    "Introdução à computação: ação, coração e não.",
    "Fórmula: $E = mc^2$ e $$\\int_0^1 x\\,dx = \\tfrac12$$",
    "```js\nconst x = 1;\nconsole.log(`ok ${x}`);\n```",
    "Emoji 😀 e símbolos ‹›«»",
    null,
  ];
  let n = 0;
  for (let r = 0; r < 4; r += 1) {
    const root = `r${r}`;
    addContent(db, { id: root, slug: `raiz-${r}`, authorId: userId, order: r, status: r === 3 ? "DRAFT" : "PUBLISHED" });
    for (let c = 0; c < 4; c += 1) {
      const child = `${root}-c${c}`;
      addContent(db, { id: child, slug: `colecao-${c}`, parentId: root, authorId: userId, order: c, status: c === 2 ? "DRAFT" : "PUBLISHED" });
      for (let d = 0; d < 2; d += 1) {
        addContent(db, { id: `${child}-d${d}`, slug: `doc-${d}`, parentId: child, authorId: userId, order: d, type: "DOCUMENT", body: bodies[n % bodies.length] });
        n += 1;
      }
    }
  }
}

/** @param {import("better-sqlite3").Database} db @param {Record<string, string | null>} cfg */
function addConfiguration(db, cfg = {}) {
  db.prepare(
    'INSERT INTO configurations(id, siteName, siteDescription, primaryColor, secondaryColor, accentColor, logoUrl, githubUrl, updatedAt) VALUES (\'default\', @siteName, @siteDescription, @primaryColor, @secondaryColor, @accentColor, @logoUrl, @githubUrl, @updatedAt)',
  ).run({ siteName: "Vitrine", siteDescription: null, primaryColor: "#3b82f6", secondaryColor: "#1e293b", accentColor: "#f59e0b", logoUrl: null, githubUrl: null, updatedAt: T0, ...cfg });
}

/**
 * @typedef {Object} Scenario
 * @property {string} name
 * @property {(db: import("better-sqlite3").Database) => void} populate
 * @property {Record<string, string | null>} handles handle esperado por id de usuário
 * @property {Record<string, string>} [roles] papel esperado por id de usuário (padrão: o mais antigo é admin)
 * @property {Record<string, string>} [owners] dono esperado de cada conteúdo, quando a normalização muda algo
 * @property {Record<string, string>} [colors] cores esperadas da linha do site (primaryColor, accentColor)
 */

/** @type {Scenario[]} */
const scenarios = [
  { name: "vazio (instalação nova)", populate: () => {}, handles: {} },
  {
    name: "caio: e-mail com ponto vira handle",
    populate: (db) => {
      addUser(db, { id: "u1", email: "caio.reis@exemplo.test" });
      addCredentials(db, "u1");
      addLargeTree(db, "u1");
      addConfiguration(db, { siteName: "Meu Site", siteDescription: "Descrição" });
    },
    handles: { u1: "caio-reis" },
    colors: { primaryColor: "#2563eb", accentColor: "#b45309" },
  },
  { name: "símbolos: e-mail com +, resultado nulo", populate: (db) => { addUser(db, { id: "u1", email: "a_b+tag@exemplo.test" }); addCredentials(db, "u1"); addConfiguration(db); }, handles: { u1: null } },
  { name: "curto: menos de 3 caracteres, nulo", populate: (db) => { addUser(db, { id: "u1", email: "ab@exemplo.test" }); addConfiguration(db); }, handles: { u1: null } },
  { name: "reservado: admin@, nulo", populate: (db) => { addUser(db, { id: "u1", email: "admin@exemplo.test" }); addConfiguration(db); }, handles: { u1: null } },
  { name: "reservado: logout@, nulo", populate: (db) => { addUser(db, { id: "u1", email: "logout@exemplo.test" }); addConfiguration(db); }, handles: { u1: null } },
  { name: "reservado: api@ e login@ (dois usuários), só o mais antigo vira admin e os nomes ficam nulos", populate: (db) => { addUser(db, { id: "u1", email: "api@exemplo.test", created: "2026-09-01T00:00:00.000+00:00" }); addUser(db, { id: "u2", email: "login@exemplo.test", created: "2026-09-02T00:00:00.000+00:00" }); addConfiguration(db); }, handles: { u1: null, u2: null }, roles: { u1: "admin", u2: "user" } },
  { name: "maiúsculas: Maria.Silva@ vira maria-silva", populate: (db) => { addUser(db, { id: "u1", email: "Maria.Silva@exemplo.test" }); addConfiguration(db); }, handles: { u1: "maria-silva" } },
  { name: "sem-configuração: carlos@, sem linha do site", populate: (db) => { addUser(db, { id: "u1", email: "carlos@exemplo.test" }); addCredentials(db, "u1"); addContent(db, { id: "c1", slug: "guia", authorId: "u1" }); }, handles: { u1: "carlos" } },
  {
    name: "dois-usuários (fora do desenho): filho com dono diferente do pai é normalizado para o dono da raiz",
    populate: (db) => {
      addUser(db, { id: "u1", email: "primeiro@exemplo.test", created: "2026-09-01T00:00:00.000+00:00" });
      addUser(db, { id: "u2", email: "segundo@exemplo.test", created: "2026-09-02T00:00:00.000+00:00" });
      addContent(db, { id: "r1", slug: "guia", authorId: "u1" });
      addContent(db, { id: "f1", slug: "filho", parentId: "r1", authorId: "u2" });
      addContent(db, { id: "n1", slug: "neto", parentId: "f1", authorId: "u1", type: "DOCUMENT" });
      addContent(db, { id: "r2", slug: "outra", authorId: "u2" });
      addContent(db, { id: "f2", slug: "filho", parentId: "r2", authorId: "u1", type: "DOCUMENT" });
      addConfiguration(db);
    },
    handles: { u1: "primeiro", u2: null },
    roles: { u1: "admin", u2: "user" },
    owners: { r1: "u1", f1: "u1", n1: "u1", r2: "u2", f2: "u2" },
  },
  {
    name: "personalizado: cores do administrador nunca são tocadas",
    populate: (db) => { addUser(db, { id: "u1", email: "ana@exemplo.test" }); addConfiguration(db, { primaryColor: "#123456", accentColor: "#654321" }); },
    handles: { u1: "ana" },
    colors: { primaryColor: "#123456", accentColor: "#654321" },
  },
  {
    name: "meio personalizado: só a primária ainda vale o padrão antigo",
    populate: (db) => { addUser(db, { id: "u1", email: "ana@exemplo.test" }); addConfiguration(db, { primaryColor: "#3b82f6", accentColor: "#ff0000" }); },
    handles: { u1: "ana" },
    colors: { primaryColor: "#2563eb", accentColor: "#ff0000" },
  },
];

describe("CT34: migração multiusuário sobre bancos legados populados", () => {
  /** @type {string} */
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-legado-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** @param {string} name @param {(db: import("better-sqlite3").Database) => void} populate */
  function legacyDatabase(name, populate) {
    const file = path.join(dir, `${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}.db`);
    const db = new Database(file);
    db.exec(sqlOf(INIT));
    populate(db);
    return { db, file };
  }

  it("descobre a migração inicial e a multiusuário, nesta ordem", () => {
    expect(migrationNames.indexOf(INIT)).toBeLessThan(migrationNames.indexOf(MULTI));
  });

  for (const scenario of scenarios) {
    it(`${scenario.name}: nada se perde e o resultado é consistente`, () => {
      const { db } = legacyDatabase(scenario.name, scenario.populate);
      try {
        const before = {
          hashes: Object.fromEntries(Object.keys(PRESERVED).map((table) => [table, rowHashes(db, /** @type {any} */ (table))])),
          users: /** @type {any[]} */ (db.prepare('SELECT id FROM "user" ORDER BY createdAt, id').all()).map((u) => u.id),
        };

        db.exec(sqlOf(MULTI));
        db.pragma("foreign_keys = ON");

        // nada perdido, nada alterado (linha por linha) nas colunas anteriores ao M15
        for (const table of Object.keys(PRESERVED)) {
          expect(rowHashes(db, /** @type {any} */ (table)), `linhas de ${table}`).toEqual(before.hashes[table]);
        }
        // consistência do banco
        expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
        expect(db.pragma("foreign_key_check")).toEqual([]);
        expect(indexProblems(db)).toEqual([]);
        // tabelas novas nascem vazias (a aparência é criada sob demanda)
        expect(db.prepare("SELECT count(*) AS n FROM appearances").get()).toEqual({ n: 0 });
        expect(db.prepare("SELECT count(*) AS n FROM notifications").get()).toEqual({ n: 0 });
        // papéis: só o mais antigo é admin; ninguém suspenso; ninguém com troca de senha pendente
        const users = /** @type {any[]} */ (db.prepare('SELECT id, role, handle, banned, banReason, banExpires, mustChangePassword FROM "user" ORDER BY createdAt, id').all());
        for (const user of users) {
          expect(user.role, `papel de ${user.id}`).toBe(scenario.roles?.[user.id] ?? (user.id === before.users[0] ? "admin" : "user"));
          expect(user.handle, `handle de ${user.id}`).toBe(scenario.handles[user.id] ?? null);
          expect([user.banned, user.banReason, user.banExpires, user.mustChangePassword]).toEqual([0, null, null, 0]);
        }
        // dono único por árvore: todo nó tem o dono da sua raiz
        const contents = /** @type {any[]} */ (db.prepare("SELECT id, parentId, authorId FROM contents").all());
        const byId = new Map(contents.map((c) => [c.id, c]));
        for (const content of contents) {
          let root = content;
          while (root.parentId !== null) root = /** @type {any} */ (byId.get(root.parentId));
          expect(content.authorId, `dono de ${content.id}`).toBe(root.authorId);
          if (scenario.owners?.[content.id]) expect(content.authorId).toBe(scenario.owners[content.id]);
        }
        // linha do site: as cores noturnas e o portal nascem com os padrões; as claras só mudam se eram o padrão antigo
        const site = /** @type {any} */ (db.prepare("SELECT * FROM configurations").get());
        if (site) {
          expect(site).toMatchObject({ darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24", directoryEnabled: 1, homeBody: null });
          if (scenario.colors) expect({ primaryColor: site.primaryColor, accentColor: site.accentColor }).toEqual(scenario.colors);
        }
      } finally {
        db.close();
      }
    });
  }

  it("a normalização do dono vem ANTES da cópia: sem ela, o banco ficaria inconsistente em silêncio (a mutação é detectada)", () => {
    const populate = /** @type {Scenario} */ (scenarios.find((s) => s.name.startsWith("dois-usuários"))).populate;
    const semNormalizar = sqlOf(MULTI).replace(/WITH RECURSIVE "tree"[\s\S]*?\n {2}AND "authorId" <> \(SELECT "rootOwner" FROM "tree" WHERE "tree"\."id" = "contents"\."id"\);/, "");
    expect(semNormalizar).not.toBe(sqlOf(MULTI));

    const { db } = legacyDatabase("sem-normalizar", populate);
    try {
      db.exec(semNormalizar);
      db.pragma("foreign_keys = ON");
      expect(/** @type {any[]} */ (db.pragma("foreign_key_check")).length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("o SQL puro do Prisma, sem os blocos manuais, não bastaria: sem administrador, sem handle, sem o índice parcial e com as cores antigas", () => {
    const semManuais = sqlOf(MULTI)
      .replace(/UPDATE "user" SET "role"[\s\S]*?LIMIT 1\);/, "")
      .replace(/UPDATE "user" SET "handle"[\s\S]*?WHERE "role" = 'admin';/, "")
      .replace(/UPDATE "configurations"[^\n]*\n/g, "")
      .replace(/CREATE UNIQUE INDEX "contents_root_owner_slug_key"[^\n]*\n/, "");
    expect(semManuais).not.toContain('SET "role"');
    expect(semManuais).not.toContain('SET "handle"');
    expect(semManuais).not.toContain("contents_root_owner_slug_key");

    const { db } = legacyDatabase("sem-manuais", /** @type {Scenario} */ (scenarios.find((s) => s.name.startsWith("caio"))).populate);
    try {
      db.exec(semManuais);
      expect(indexProblems(db)).toContain("índice ausente: contents_root_owner_slug_key");
      expect(db.prepare('SELECT role, handle FROM "user"').get()).toEqual({ role: "user", handle: null });
      expect(db.prepare("SELECT primaryColor, accentColor FROM configurations").get()).toEqual({ primaryColor: "#3b82f6", accentColor: "#f59e0b" });
    } finally {
      db.close();
    }
  });

  it("pelo CLI real: baseline da migração inicial, migrate deploy, status em dia e sem diferença para o schema", () => {
    const { db, file } = legacyDatabase("cli", /** @type {Scenario} */ (scenarios.find((s) => s.name.startsWith("caio"))).populate);
    db.close();
    const url = toFileUrl(file);

    runPrisma(["migrate", "resolve", "--applied", INIT], url);
    const output = runPrisma(["migrate", "deploy"], url);

    expect(output).toMatch(/applied/i);
    expect(runPrisma(["migrate", "status"], url)).toMatch(/up to date/i);
    expect(() => runPrisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], url)).not.toThrow();
    const migrated = new Database(file, { readonly: true });
    try {
      expect(indexProblems(migrated)).toEqual([]);
      expect(migrated.prepare('SELECT role, handle FROM "user"').get()).toEqual({ role: "admin", handle: "caio-reis" });
      expect(migrated.prepare("SELECT count(*) AS n FROM contents").get()).toEqual({ n: 4 + 16 + 32 });
      expect(migrated.pragma("foreign_key_check")).toEqual([]);
    } finally {
      migrated.close();
    }
  });
});
