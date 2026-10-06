// A salvaguarda do `remove-later.mjs` (higiene do e2e; A-014 Parte 3e-2, item 7; R-003): o processo solto que
// apaga o diretório da rodada quando o `globalTeardown` não pôde só apaga `vitrine-e2e-*` DIRETAMENTE em
// `os.tmpdir()`; qualquer outro caminho, mesmo recebido por engano, sai com código 1 e NÃO apaga nada. É um
// defeito de segurança do ambiente de teste (com `VITRINE_E2E_DIR` definida à mão, o teardown já apagou por
// inteiro um diretório de ensaio fora do repositório), por isso roda como processo de verdade.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectRoot } from "../setup/prisma-cli.js";
import { sandboxTmpdir } from "./tmp-sandbox.js";

const SCRIPT = path.join(projectRoot, "e2e", "support", "remove-later.mjs");
// O `os.tmpdir()` do teste E do processo filho (que herda o ambiente) é uma pasta descartável: sem a
// salvaguarda, o script apagaria o que recebesse (até o `os.tmpdir()`), e o do usuário não pode ser o alvo.
sandboxTmpdir();
/** @type {string[]} */
const created = [];

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Cria um diretório (com um arquivo dentro) e o registra para a limpeza. @param {string} parent @param {string} prefix */
function makeDir(parent, prefix) {
  const dir = fs.mkdtempSync(path.join(parent, prefix));
  fs.writeFileSync(path.join(dir, "importante.txt"), "não é do teste");
  created.push(dir);
  return dir;
}

/** Roda o script como processo, com o diretório pedido. @param {string[]} args */
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 30_000 });

describe("remove-later.mjs só apaga o diretório de uma rodada", () => {
  it("recusa (código 1) e preserva um diretório que não é vitrine-e2e-*, mesmo direto em os.tmpdir()", () => {
    const dir = makeDir(os.tmpdir(), "meus-dados-");

    const result = run([dir]);

    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(dir, "importante.txt"))).toBe(true);
  });

  it("recusa o próprio os.tmpdir(), um subdiretório de uma rodada e um diretório vitrine-e2e-* fora de os.tmpdir()", () => {
    const marker = makeDir(os.tmpdir(), "meus-dados-");
    const run1 = makeDir(os.tmpdir(), "vitrine-e2e-");
    const nested = path.join(run1, "sub");
    fs.mkdirSync(nested);
    const elsewhere = makeDir(projectRoot, "vitrine-e2e-");

    expect(run([os.tmpdir()]).status).toBe(1);
    expect(run([nested]).status).toBe(1);
    expect(run([elsewhere]).status).toBe(1);

    expect(fs.existsSync(path.join(marker, "importante.txt"))).toBe(true);
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(path.join(elsewhere, "importante.txt"))).toBe(true);
  });

  it("sem argumento, recusa (código 1)", () => {
    expect(run([]).status).toBe(1);
  });

  it("apaga o diretório de uma rodada (vitrine-e2e-* direto em os.tmpdir()) e sai com 0", () => {
    const dir = makeDir(os.tmpdir(), "vitrine-e2e-");

    const result = run([dir]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
