-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "image" TEXT
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Content" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Content_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "siteName" TEXT NOT NULL DEFAULT 'Vitrine',
    "siteDescription" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1e293b',
    "accentColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");
