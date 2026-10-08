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
import { ALL_REQUIRED_INDEXES, OBSOLETE_INDEXES, REQUIRED_INDEXES, REQUIRED_INDEXES_V1, indexProblems } from "./helpers.js";

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
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("a lista esperada cobre os nove índices nomeados do modelo multiusuário, os cinco do épico v1 e os dois obsoletos", () => {
    expect(Object.keys(REQUIRED_INDEXES_V1).sort()).toEqual([
      "footer_links_ownerId_icon_key",
      "footer_links_ownerId_order_idx",
      "footer_links_site_icon_key",
      "images_ownerId_idx",
      "user_avatarImageId_key",
    ]);
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
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual(["índice ausente: contents_root_owner_slug_key"]);

      db.exec('CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug")'); // sem o WHERE
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual(["contents_root_owner_slug_key: parcial=false, esperado true"]);
      db.exec('DROP INDEX "contents_root_owner_slug_key"');

      db.exec('CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug") WHERE "parentId" IS NULL');
      db.exec('CREATE UNIQUE INDEX "contents_root_slug_key" ON "contents"("slug") WHERE "parentId" IS NULL');
      expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual(["índice obsoleto ainda presente: contents_root_slug_key"]);
    } finally {
      db.close();
    }
  });

  describe("épico v1: o índice parcial do rodapé do site (footer_links_site_icon_key)", () => {
    it("o teste tem dentes: sem o índice parcial, ou sem o filtro, a verificação acusa", () => {
      const db = new Database(copyOfTemplate("dentes-footer.db"));
      try {
        db.exec('DROP INDEX "footer_links_site_icon_key"');
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual(["índice ausente: footer_links_site_icon_key"]);

        db.exec('CREATE UNIQUE INDEX "footer_links_site_icon_key" ON "footer_links"("icon")'); // sem o WHERE
        expect(indexProblems(db, ALL_REQUIRED_INDEXES)).toEqual(["footer_links_site_icon_key: parcial=false, esperado true"]);
      } finally {
        db.close();
      }
    });

    it("sem ele, o @@unique([ownerId, icon]) deixa dois ícones iguais no rodapé do site (NULL é distinto de NULL); com ele, não", () => {
      const row = (id, owner, icon) =>
        `INSERT INTO "footer_links"("id","ownerId","icon","url","order","updatedAt") VALUES ('${id}', ${owner}, '${icon}', 'https://exemplo.test/${id}', 0, '2026-01-01')`;

      const sem = new Database(copyOfTemplate("footer-sem.db"));
      try {
        sem.exec('DROP INDEX "footer_links_site_icon_key"');
        sem.exec(row("a", "NULL", "github"));
        sem.exec(row("b", "NULL", "github"));
        expect(sem.prepare('SELECT count(*) AS n FROM "footer_links"').get()).toEqual({ n: 2 });
      } finally {
        sem.close();
      }

      const com = new Database(copyOfTemplate("footer-com.db"));
      try {
        com.exec(row("a", "NULL", "github"));
        expect(() => com.exec(row("b", "NULL", "github"))).toThrow(/UNIQUE/);
        // ícone diferente no site é aceito; o mesmo ícone em dono diferente também; no mesmo dono, não
        com.exec(row("c", "NULL", "discord"));
        com.exec(`INSERT INTO "user"("id","name","email","emailVerified","updatedAt") VALUES ('u','u','u@exemplo.test',1,'2026-01-01')`);
        com.exec(row("d", "'u'", "github"));
        expect(() => com.exec(row("e", "'u'", "github"))).toThrow(/UNIQUE/);
      } finally {
        com.close();
      }
    });

    it("uma nova migração do Prisma que redefine footer_links o descarta (a armadilha existe); com a linha manual, ele sobrevive", () => {
      const schema = fs.readFileSync(path.join(projectRoot, "prisma", "schema.prisma"), "utf8");
      const alterado = schema.replace(/(model FooterLink \{\n)/, "$1  sondaR16 Int @default(0)\n");
      expect(alterado).not.toBe(schema);
      const probe = path.join(dir, "schema-r16-footer.prisma");
      fs.writeFileSync(probe, alterado);
      const sql = runPrisma(
        ["migrate", "diff", "--from-schema", path.join(projectRoot, "prisma", "schema.prisma"), "--to-schema", probe, "--script"],
        toFileUrl(path.join(dir, "ignorado-footer.db")),
      );
      expect(sql).toMatch(/DROP TABLE "footer_links"/);
      expect(sql).not.toMatch(/footer_links_site_icon_key/);

      const semManual = new Database(copyOfTemplate("r16-footer-sem.db"));
      try {
        semManual.exec(sql);
        expect(indexProblems(semManual, ALL_REQUIRED_INDEXES)).toContain("índice ausente: footer_links_site_icon_key");
      } finally {
        semManual.close();
      }

      const comManual = new Database(copyOfTemplate("r16-footer-com.db"));
      try {
        comManual.exec(sql);
        comManual.exec('CREATE UNIQUE INDEX "footer_links_site_icon_key" ON "footer_links"("icon") WHERE "ownerId" IS NULL;');
        expect(indexProblems(comManual, ALL_REQUIRED_INDEXES)).toEqual([]);
      } finally {
        comManual.close();
      }
    });
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
        expect(indexProblems(semManual, ALL_REQUIRED_INDEXES)).toContain("índice ausente: contents_root_owner_slug_key");
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
        expect(indexProblems(comManual, ALL_REQUIRED_INDEXES)).toEqual([]);
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
