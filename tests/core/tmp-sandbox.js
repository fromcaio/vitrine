// Diretório temporário de ENSAIO para os testes que exercitam código que APAGA diretórios (a higiene do e2e:
// `removeRunDirectory`, `remove-later.mjs`). Esses testes passam `os.tmpdir()` ao código para provar que ele
// RECUSA: se a salvaguarda for removida (uma regressão ou uma mutação), o código tentaria apagar o diretório
// temporário de verdade, e o do usuário não pode ser o alvo. Aqui o `os.tmpdir()` (que o Node lê de TEMP, TMP e
// TMPDIR a cada chamada) passa a ser uma pasta descartável criada para o teste, no processo do teste e nos
// processos filhos que herdarem o ambiente.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";

const KEYS = ["TEMP", "TMP", "TMPDIR"];

/**
 * Redireciona `os.tmpdir()` para uma pasta descartável durante os testes do arquivo que a chamar; ao fim,
 * restaura o ambiente e apaga a pasta. Chame uma vez, no topo do arquivo de teste.
 * @returns {{ readonly dir: string }} `dir`: a pasta (existe a partir do `beforeAll`)
 */
export function sandboxTmpdir() {
  /** @type {Record<string, string | undefined>} */
  const saved = {};
  const state = { dir: "" };

  beforeAll(() => {
    const real = os.tmpdir();
    state.dir = fs.mkdtempSync(path.join(real, "vitrine-ensaio-"));
    for (const key of KEYS) {
      saved[key] = process.env[key];
      process.env[key] = state.dir;
    }
  });

  afterAll(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(state.dir, { recursive: true, force: true });
  });

  return state;
}
