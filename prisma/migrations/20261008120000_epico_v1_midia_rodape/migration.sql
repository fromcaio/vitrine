-- Migração do épico v1 (A-026; ADR-034, ADR-035, ADR-038). Base: o SQL no formato que o Prisma gera
-- (`migrate diff`) para o schema atual, mais os blocos marcados "(manual)", que o Prisma não gera e
-- que NÃO podem ser omitidos nem reordenados: a conversão dos links ANTES de as colunas serem
-- removidas, os nulos DEPOIS de as colunas virarem anuláveis e o índice parcial de "footer_links".
-- O Prisma Migrate não tem "descer": antes do `migrate deploy`, copie o arquivo do banco com a
-- aplicação parada (Apêndice D). Não toca em usuários, conteúdo nem notificações.

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "images_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "footer_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "icon" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "footer_links_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- (manual) Os seis links sociais de "configurations" (dono nulo = o site) e de cada "appearances"
-- viram linhas de "footer_links", na sequência discord, github, youtube, instagram, linkedin, twitch,
-- com "order" renumerada de 0 a n-1 por dono. Só os preenchidos e com URL https:// (a RN17 nova só
-- aceita https: as http e os demais esquemas são descartados). O identificador é gerado aqui, em SQL
-- (o cuid é do cliente; o formato do id é opaco). Precisa vir ANTES do RedefineTables, que remove as
-- colunas de origem.
WITH "links"("ownerId", "seq", "icon", "url") AS (
    SELECT NULL, 0, 'discord', "discordUrl" FROM "configurations"
    UNION ALL SELECT NULL, 1, 'github', "githubUrl" FROM "configurations"
    UNION ALL SELECT NULL, 2, 'youtube', "youtubeUrl" FROM "configurations"
    UNION ALL SELECT NULL, 3, 'instagram', "instagramUrl" FROM "configurations"
    UNION ALL SELECT NULL, 4, 'linkedin', "linkedinUrl" FROM "configurations"
    UNION ALL SELECT NULL, 5, 'twitch', "twitchUrl" FROM "configurations"
    UNION ALL SELECT "ownerId", 0, 'discord', "discordUrl" FROM "appearances"
    UNION ALL SELECT "ownerId", 1, 'github', "githubUrl" FROM "appearances"
    UNION ALL SELECT "ownerId", 2, 'youtube', "youtubeUrl" FROM "appearances"
    UNION ALL SELECT "ownerId", 3, 'instagram', "instagramUrl" FROM "appearances"
    UNION ALL SELECT "ownerId", 4, 'linkedin', "linkedinUrl" FROM "appearances"
    UNION ALL SELECT "ownerId", 5, 'twitch', "twitchUrl" FROM "appearances"
), "valid" AS (
    SELECT "ownerId", "seq", "icon", trim("url") AS "url" FROM "links"
    WHERE lower(trim("url")) LIKE 'https://_%'
)
INSERT INTO "footer_links" ("id", "ownerId", "icon", "url", "order", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(12))),
    "ownerId",
    "icon",
    "url",
    row_number() OVER (PARTITION BY "ownerId" ORDER BY "seq") - 1,
    strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now'),
    strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
FROM "valid";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "avatarImageId" TEXT,
    CONSTRAINT "user_avatarImageId_fkey" FOREIGN KEY ("avatarImageId") REFERENCES "images" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_user" ("banExpires", "banReason", "banned", "createdAt", "email", "emailVerified", "handle", "id", "image", "mustChangePassword", "name", "role", "updatedAt") SELECT "banExpires", "banReason", "banned", "createdAt", "email", "emailVerified", "handle", "id", "image", "mustChangePassword", "name", "role", "updatedAt" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE UNIQUE INDEX "user_handle_key" ON "user"("handle");
CREATE UNIQUE INDEX "user_avatarImageId_key" ON "user"("avatarImageId");
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
    "logoImageId" TEXT,
    "faviconImageId" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showName" BOOLEAN NOT NULL DEFAULT true,
    "modeIconPair" TEXT NOT NULL DEFAULT 'sun_moon',
    "directoryTitle" TEXT NOT NULL DEFAULT 'Espaços',
    "homeBody" TEXT,
    "directoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "configurations_logoImageId_fkey" FOREIGN KEY ("logoImageId") REFERENCES "images" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "configurations_faviconImageId_fkey" FOREIGN KEY ("faviconImageId") REFERENCES "images" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_configurations" ("accentColor", "darkAccentColor", "darkPrimaryColor", "darkSecondaryColor", "directoryEnabled", "homeBody", "id", "primaryColor", "secondaryColor", "siteDescription", "siteName", "updatedAt") SELECT "accentColor", "darkAccentColor", "darkPrimaryColor", "darkSecondaryColor", "directoryEnabled", "homeBody", "id", "primaryColor", "secondaryColor", "siteDescription", "siteName", "updatedAt" FROM "configurations";
DROP TABLE "configurations";
ALTER TABLE "new_configurations" RENAME TO "configurations";
CREATE TABLE "new_appearances" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "siteName" TEXT,
    "siteDescription" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "darkPrimaryColor" TEXT,
    "darkSecondaryColor" TEXT,
    "darkAccentColor" TEXT,
    "logoImageId" TEXT,
    "faviconImageId" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showName" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "appearances_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appearances_logoImageId_fkey" FOREIGN KEY ("logoImageId") REFERENCES "images" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "appearances_faviconImageId_fkey" FOREIGN KEY ("faviconImageId") REFERENCES "images" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_appearances" ("accentColor", "createdAt", "darkAccentColor", "darkPrimaryColor", "darkSecondaryColor", "ownerId", "primaryColor", "secondaryColor", "siteDescription", "siteName", "updatedAt") SELECT "accentColor", "createdAt", "darkAccentColor", "darkPrimaryColor", "darkSecondaryColor", "ownerId", "primaryColor", "secondaryColor", "siteDescription", "siteName", "updatedAt" FROM "appearances";
DROP TABLE "appearances";
ALTER TABLE "new_appearances" RENAME TO "appearances";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- (manual) Aparência em duas camadas (ADR-038): nulo = herda o sistema. As colunas acima acabaram de
-- virar anuláveis e ainda guardam o que o padrão antigo gravou. Cada paleta (as três cores de um
-- modo, juntas) cujo valor ainda é o padrão antigo vira nula, uma instrução por modo; se o usuário
-- mudou ao menos uma das três, as três permanecem. O nome "Vitrine" também vira nulo. O que o
-- usuário mudou nunca é tocado.
UPDATE "appearances" SET "primaryColor" = NULL, "secondaryColor" = NULL, "accentColor" = NULL
WHERE lower("primaryColor") = '#2563eb' AND lower("secondaryColor") = '#1e293b' AND lower("accentColor") = '#b45309';

UPDATE "appearances" SET "darkPrimaryColor" = NULL, "darkSecondaryColor" = NULL, "darkAccentColor" = NULL
WHERE lower("darkPrimaryColor") = '#60a5fa' AND lower("darkSecondaryColor") = '#cbd5e1' AND lower("darkAccentColor") = '#fbbf24';

UPDATE "appearances" SET "siteName" = NULL WHERE "siteName" = 'Vitrine';

-- CreateIndex
CREATE INDEX "images_ownerId_idx" ON "images"("ownerId");

-- CreateIndex
CREATE INDEX "footer_links_ownerId_order_idx" ON "footer_links"("ownerId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "footer_links_ownerId_icon_key" ON "footer_links"("ownerId", "icon");

-- (manual) O Prisma não modela índice parcial. No SQLite o NULL é distinto de NULL, então o
-- @@unique([ownerId, icon]) não impede dois ícones iguais no rodapé do site (dono nulo). Toda
-- migração futura que redefina "footer_links" deve repetir esta linha; tests/dados/indexes.test.js
-- confere a presença por nome. O índice parcial de "contents" (contents_root_owner_slug_key) NÃO é
-- tocado por esta migração, que não redefine "contents".
CREATE UNIQUE INDEX "footer_links_site_icon_key" ON "footer_links"("icon") WHERE "ownerId" IS NULL;
