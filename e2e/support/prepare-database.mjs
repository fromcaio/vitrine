// Primeiro passo do servidor dos testes e2e: aplica as migrações reais (`prisma migrate deploy`, o
// mesmo comando da produção) ao banco temporário. Vem antes do `next build` para que uma falha de
// migração apareça cedo (o build em si não consulta o banco, ADR-021). Roda com as variáveis da rodada
// (`webServer.env` do playwright.config.js); sem DATABASE_URL, recusa-se a rodar.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) {
  console.error("DATABASE_URL ausente ou inválida: este script só roda pelo playwright.config.js.");
  process.exit(1);
}

const root = process.cwd();
const dbFile = path.resolve(url.slice("file:".length));
if (dbFile.startsWith(root + path.sep)) {
  console.error(`O banco dos testes e2e não pode ficar dentro do repositório: ${dbFile}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

execFileSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"],
});
