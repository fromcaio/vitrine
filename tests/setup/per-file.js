// Executa antes de cada arquivo de teste e antes de qualquer import dele: copia o banco-modelo
// para um arquivo próprio e aponta DATABASE_URL para ele. Assim src/lib/db.js (que lê a variável
// ao ser carregado) nunca enxerga o dev.db, e os arquivos de teste não interferem entre si.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, inject } from "vitest";
import { toFileUrl } from "./prisma-cli.js";

const dir = /** @type {string} */ (inject("testDbDir"));
const template = /** @type {string} */ (inject("templateDb"));
const dbFile = path.join(dir, `${randomUUID()}.db`);
fs.copyFileSync(template, dbFile);

// Salvaguarda: o banco deste arquivo precisa estar no diretório temporário da rodada.
if (!path.resolve(dbFile).startsWith(path.resolve(dir))) {
  throw new Error("Banco de teste fora do diretório temporário.");
}

process.env.DATABASE_URL = toFileUrl(dbFile);
// Evita reaproveitar um cliente criado para outro banco (cache de desenvolvimento do db.js)
delete globalThis.prisma;

beforeAll(async () => {
  // Import dinâmico: db.js lê DATABASE_URL ao ser carregado, o que só pode acontecer depois
  // das linhas acima (imports estáticos são avaliados antes do corpo deste arquivo).
  const { prisma } = await import("@/lib/db");
  // Banco descartável: dispensa o fsync a cada escrita (muito lento em alguns discos).
  // Não altera o comportamento das constraints, que é o que os testes verificam.
  await prisma.$queryRawUnsafe("PRAGMA synchronous = OFF");
});

afterAll(async () => {
  // Libera o arquivo (no Windows, um banco aberto impede a remoção do diretório temporário).
  await globalThis.prisma?.$disconnect();
});
