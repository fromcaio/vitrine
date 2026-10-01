// Executa uma vez por rodada: cria o banco-modelo aplicando as migrações reais (prisma migrate
// deploy, o mesmo comando da produção) em um arquivo temporário vazio.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runPrisma, toFileUrl } from "./prisma-cli.js";

/** @param {{ provide: (key: string, value: unknown) => void }} context */
export default function setup({ provide }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-test-"));
  const template = path.join(dir, "template.db");

  runPrisma(["migrate", "deploy"], toFileUrl(template));

  provide("testDbDir", dir);
  provide("templateDb", template);

  return () => {
    // maxRetries: no Windows o arquivo pode demorar a ser liberado pelo processo do teste
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };
}
