-- Migração da página inicial editável (P-031; M26, ADR-040, RN35 a RN37). Só acrescenta colunas com
-- padrão: as linhas existentes ficam PUBLISHED/true, e o "homeBody" do portal (que já existia em
-- "configurations") não é tocado. Não há índice novo nem perda de dados.

-- AlterTable
ALTER TABLE "appearances" ADD COLUMN "homeBody" TEXT;
ALTER TABLE "appearances" ADD COLUMN "homeStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "appearances" ADD COLUMN "homeShowItems" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "configurations" ADD COLUMN "homeStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';
