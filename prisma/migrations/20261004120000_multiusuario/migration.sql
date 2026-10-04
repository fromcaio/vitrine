-- Migração multiusuário (M15; A-013; ADR-028, ADR-031). Base: o SQL no formato que o Prisma gera
-- (`migrate diff`) para o schema atual, mais os blocos marcados "(manual)", que o Prisma não gera e
-- que NÃO podem ser omitidos nem reordenados. Uma só migração: a normalização do dono precisa vir
-- ANTES da cópia de "contents". O Prisma Migrate não tem "descer": antes do `migrate deploy`,
-- copie o arquivo do banco com a aplicação parada (Apêndice D).

-- AlterTable
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

-- CreateTable
CREATE TABLE "appearances" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "siteName" TEXT NOT NULL DEFAULT 'Vitrine',
    "siteDescription" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1e293b',
    "accentColor" TEXT NOT NULL DEFAULT '#b45309',
    "darkPrimaryColor" TEXT NOT NULL DEFAULT '#60a5fa',
    "darkSecondaryColor" TEXT NOT NULL DEFAULT '#cbd5e1',
    "darkAccentColor" TEXT NOT NULL DEFAULT '#fbbf24',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "discordUrl" TEXT,
    "githubUrl" TEXT,
    "youtubeUrl" TEXT,
    "instagramUrl" TEXT,
    "linkedinUrl" TEXT,
    "twitchUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "appearances_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "dedupeKey" TEXT,
    "data" TEXT NOT NULL,
    "readAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- (manual) Dono único por árvore: a chave estrangeira composta (parentId, authorId) abaixo exige
-- que todo nó tenha o dono da sua raiz. O legado permitia donos diferentes; normalizamos ANTES de
-- copiar, porque com foreign_keys=OFF o SQLite não acusaria a violação na cópia. Cada nó recebe o
-- dono da raiz da sua árvore (CTE recursiva); a raiz não muda, e por isso nenhum slug da raiz
-- passa a colidir.
WITH RECURSIVE "tree"("id", "rootOwner") AS (
    SELECT "id", "authorId" FROM "contents" WHERE "parentId" IS NULL
    UNION ALL
    SELECT c."id", t."rootOwner" FROM "contents" c JOIN "tree" t ON c."parentId" = t."id"
)
UPDATE "contents"
SET "authorId" = (SELECT "rootOwner" FROM "tree" WHERE "tree"."id" = "contents"."id")
WHERE "id" IN (SELECT "id" FROM "tree")
  AND "authorId" <> (SELECT "rootOwner" FROM "tree" WHERE "tree"."id" = "contents"."id");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_configurations" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'Vitrine',
    "siteDescription" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1e293b',
    "accentColor" TEXT NOT NULL DEFAULT '#b45309',
    "darkPrimaryColor" TEXT NOT NULL DEFAULT '#60a5fa',
    "darkSecondaryColor" TEXT NOT NULL DEFAULT '#cbd5e1',
    "darkAccentColor" TEXT NOT NULL DEFAULT '#fbbf24',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "discordUrl" TEXT,
    "githubUrl" TEXT,
    "youtubeUrl" TEXT,
    "instagramUrl" TEXT,
    "linkedinUrl" TEXT,
    "twitchUrl" TEXT,
    "homeBody" TEXT,
    "directoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_configurations" ("accentColor", "discordUrl", "faviconUrl", "githubUrl", "id", "instagramUrl", "linkedinUrl", "logoUrl", "primaryColor", "secondaryColor", "siteDescription", "siteName", "twitchUrl", "updatedAt", "youtubeUrl") SELECT "accentColor", "discordUrl", "faviconUrl", "githubUrl", "id", "instagramUrl", "linkedinUrl", "logoUrl", "primaryColor", "secondaryColor", "siteDescription", "siteName", "twitchUrl", "updatedAt", "youtubeUrl" FROM "configurations";
DROP TABLE "configurations";
ALTER TABLE "new_configurations" RENAME TO "configurations";
CREATE TABLE "new_contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contents_parentId_authorId_fkey" FOREIGN KEY ("parentId", "authorId") REFERENCES "contents" ("id", "authorId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_contents" ("authorId", "body", "createdAt", "id", "order", "parentId", "slug", "status", "title", "type", "updatedAt") SELECT "authorId", "body", "createdAt", "id", "order", "parentId", "slug", "status", "title", "type", "updatedAt" FROM "contents";
DROP TABLE "contents";
ALTER TABLE "new_contents" RENAME TO "contents";
CREATE INDEX "contents_authorId_parentId_order_idx" ON "contents"("authorId", "parentId", "order");
CREATE UNIQUE INDEX "contents_id_authorId_key" ON "contents"("id", "authorId");
CREATE UNIQUE INDEX "contents_parentId_slug_key" ON "contents"("parentId", "slug");
-- (manual) O DROP TABLE acima apagou o índice parcial da raiz (contents_root_slug_key, M-002), e o
-- Prisma NÃO o recria, pois o schema não o modela (risco R16). Recriado agora POR DONO (ADR-024,
-- ADR-028), em lugar do antigo, que valia para o banco todo. Toda migração futura que redefina
-- "contents" deve repetir esta linha; tests/dados/indexes.test.js confere a presença por nome.
CREATE UNIQUE INDEX "contents_root_owner_slug_key" ON "contents"("authorId", "slug") WHERE "parentId" IS NULL;
CREATE TABLE "new_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" DATETIME,
    "handle" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_user" ("createdAt", "email", "emailVerified", "id", "image", "name", "updatedAt") SELECT "createdAt", "email", "emailVerified", "id", "image", "name", "updatedAt" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE UNIQUE INDEX "user_handle_key" ON "user"("handle");

-- (manual) O usuário mais antigo (hoje, o único administrador, criado por `admin:create`; ADR-018)
-- passa a admin. Os demais, se houver, ficam "user" (padrão da coluna).
UPDATE "user" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "createdAt", "id" LIMIT 1);

-- (manual) Handle do administrador: a parte local do e-mail, em minúsculas, com "." e "_" trocados
-- por "-"; só é gravado se obedecer à regra da ADR-024 e da RN20 ([a-z0-9-], de 3 a 30 caracteres,
-- sem hífen nas pontas nem repetido, não reservado). Caso contrário fica nulo, e o administrador o
-- define depois. A lista de nomes reservados é um RETRATO dos nomes de hoje (a fonte única é um
-- módulo de código, ADR-028 item 9); os nomes com caracteres fora de [a-z0-9-] (_next,
-- favicon.ico, file.svg...) já são recusados pelo GLOB.
UPDATE "user" SET "handle" = (
    SELECT CASE
        WHEN length(h) BETWEEN 3 AND 30
         AND h NOT GLOB '*[^a-z0-9-]*'
         AND h NOT GLOB '-*' AND h NOT GLOB '*-'
         AND h NOT LIKE '%--%'
         AND h NOT IN ('admin', 'api', 'login', 'logout')
        THEN h END
    FROM (SELECT lower(replace(replace(substr(u."email", 1, instr(u."email", '@') - 1), '.', '-'), '_', '-')) AS h
          FROM "user" u WHERE u."id" = "user"."id")
) WHERE "role" = 'admin';

-- (manual) Novos padrões da paleta clara (ADR-031; Cap. 5 §5.9, Tabela de paletas padrão). A linha do
-- site recebe a nova paleta SOMENTE nas colunas que ainda valem o padrão antigo, comparado
-- literalmente: um valor personalizado nunca é tocado. A secundária (#1e293b) não muda. As cores
-- noturnas nasceram agora, com os padrões novos, na cópia acima.
UPDATE "configurations" SET "primaryColor" = '#2563eb' WHERE "primaryColor" = '#3b82f6';
UPDATE "configurations" SET "accentColor" = '#b45309' WHERE "accentColor" = '#f59e0b';

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_updatedAt_idx" ON "notifications"("userId", "readAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");
