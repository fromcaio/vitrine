// Presença dos índices por nome (A-013; risco R16). O índice parcial da raiz por dono é SQL escrito à
// mão: o Prisma não o modela, `migrate status` e `migrate diff` não acusam a falta e uma migração que
// redefine "contents" o descarta sem avisar. Estes testes olham o banco migrado de verdade
// (sqlite_master), nunca o schema.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { projectRoot, runPrisma, toFileUrl } from "../setup/prisma-cli.js";
import { OBSOLETE_INDEXES, REQUIRED_INDEXES, indexProblems } from "./helpers.js";

const templateDb = /** @type {string} */ (inject("templateDb"));

describe("índices do banco migrado (por nome)", () => {
  /** @type {string} */
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-indexes-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  /** Cópia descartável do banco-modelo (as migrações reais aplicadas). @param {string} name */
  function copyOfTemplate(name) {
    const file = path.join(dir, name);
    fs.copyFileSync(templateDb, file);
    return file;
  }

  it("todos os índices do modelo-alvo existem, com as colunas, a unicidade e o filtro parcial esperados", () => {
    const db = new Database(templateDb, { readonly: true });
    try {
      expect(indexProblems(db)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("a lista esperada cobre os nove índices nomeados do Apêndice A e os dois obsoletos", () => {
    expect(Object.keys(REQUIRED_INDEXES).sort()).toEqual([
      "contents_authorId_parentId_order_idx",
      "contents_id_authorId_key",
      "contents_parentId_slug_key",
      "contents_root_owner_slug_key",
      "notifications_userId_dedupeKey_key",
      "notifications_userId_readAt_updatedAt_idx",
      "session_token_key",
      "user_email_key",
      "user_handle_key",
    ]);
    expect(OBSOLETE_INDEXES).toEqual(["contents_root_slug_key", "contents_parentId_order_idx"]);
  });

  it("o teste tem dentes: sem o índice parcial, ou com o antigo (global), a verificação acusa", () => {
    const file = copyOfTemplate("dentes.db");
    const db = new Database(file);
    try {
      db.exec('DROP INDEX "contents_root_owner_slug_key"');
      expect(indexProblems(db)).toEqual(["índice ausente: contents_root_owner_slug_key"]);

      db.exec('CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug")'); // sem o WHERE
      expect(indexProblems(db)).toEqual(["contents_root_owner_slug_key: parcial=false, esperado true"]);
      db.exec('DROP INDEX "contents_root_owner_slug_key"');

      db.exec('CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug") WHERE "parentId" IS NULL');
      db.exec('CREATE UNIQUE INDEX "contents_root_slug_key" ON "contents"("slug") WHERE "parentId" IS NULL');
      expect(indexProblems(db)).toEqual(["índice obsoleto ainda presente: contents_root_slug_key"]);
    } finally {
      db.close();
    }
  });

  describe("R16: uma nova migração do Prisma que redefine contents", () => {
    /**
     * Gera, com o Prisma, o SQL de uma migração que acrescenta uma coluna obrigatória a "contents"
     * (o que no SQLite redefine a tabela), a partir do schema atual.
     * @returns {string}
     */
    function prismaMigrationRedefiningContents() {
      const schema = fs.readFileSync(path.join(projectRoot, "prisma", "schema.prisma"), "utf8");
      const alterado = schema.replace(
        '  authorId String\n  author   User   @relation(fields: [authorId], references: [id], onDelete: Restrict)\n',
        '  authorId String\n  author   User   @relation(fields: [authorId], references: [id], onDelete: Restrict)\n  sondaR16 Int @default(0)\n',
      );
      expect(alterado).not.toBe(schema);
      const probe = path.join(dir, "schema-r16.prisma");
      fs.writeFileSync(probe, alterado);
      return runPrisma(
        ["migrate", "diff", "--from-schema", path.join(projectRoot, "prisma", "schema.prisma"), "--to-schema", probe, "--script"],
        toFileUrl(path.join(dir, "ignorado.db")),
      );
    }

    it("o SQL gerado pelo Prisma redefine a tabela e NÃO recria o índice parcial (a armadilha existe)", () => {
      const sql = prismaMigrationRedefiningContents();

      expect(sql).toMatch(/DROP TABLE "contents"/);
      expect(sql).not.toMatch(/contents_root_owner_slug_key/);
    });

    it("aplicado como está, o índice parcial some e a verificação por nome o acusa; com a linha manual, ele sobrevive", () => {
      const sql = prismaMigrationRedefiningContents();

      const semManual = new Database(copyOfTemplate("r16-sem-manual.db"));
      try {
        semManual.exec(sql);
        expect(indexProblems(semManual)).toContain("índice ausente: contents_root_owner_slug_key");
        // A consequência real: duas raízes iguais do mesmo dono passam a ser aceitas em silêncio.
        semManual.exec(`INSERT INTO "user"("id","name","email","emailVerified","updatedAt") VALUES ('u','u','u@exemplo.test',1,'2026-01-01')`);
        semManual.exec(`INSERT INTO "contents"("id","title","slug","type","authorId","updatedAt") VALUES ('a','a','x','COLLECTION','u','2026-01-01'),('b','b','x','COLLECTION','u','2026-01-01')`);
        expect(semManual.prepare('SELECT count(*) AS n FROM "contents"').get()).toEqual({ n: 2 });
      } finally {
        semManual.close();
      }

      const comManual = new Database(copyOfTemplate("r16-com-manual.db"));
      try {
        comManual.exec(sql);
        comManual.exec('CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug") WHERE "parentId" IS NULL;');
        expect(indexProblems(comManual)).toEqual([]);
        comManual.exec(`INSERT INTO "user"("id","name","email","emailVerified","updatedAt") VALUES ('u','u','u@exemplo.test',1,'2026-01-01')`);
        comManual.exec(`INSERT INTO "contents"("id","title","slug","type","authorId","updatedAt") VALUES ('a','a','x','COLLECTION','u','2026-01-01')`);
        expect(() =>
          comManual.exec(`INSERT INTO "contents"("id","title","slug","type","authorId","updatedAt") VALUES ('b','b','x','COLLECTION','u','2026-01-01')`),
        ).toThrow(/UNIQUE/);
      } finally {
        comManual.close();
      }
    });
  });
});
