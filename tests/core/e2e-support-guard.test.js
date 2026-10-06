// A segunda salvaguarda de `removeRunDirectory` (R-003, ressalva 1), isolada: `e2eEnvironment()` já recusa
// um diretório que não seja de rodada, mas a função de apagar tem a própria conferência, para que ela
// continue valendo se o ambiente mudar. Aqui `e2eEnvironment` é substituída por uma que devolve um
// diretório QUALQUER, e o que está nele precisa sobreviver.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sandboxTmpdir } from "./tmp-sandbox.js";

// O `os.tmpdir()` destes testes é uma pasta descartável: sem a salvaguarda, `removeRunDirectory` apagaria o que
// recebesse (aqui, até o próprio `os.tmpdir()`), e o do usuário não pode ser o alvo.
sandboxTmpdir();

const target = vi.hoisted(() => ({ dir: "" }));

vi.mock("../../e2e/support/env.js", async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return { ...original, e2eEnvironment: () => ({ dir: target.dir, dbFile: path.join(target.dir, "x.db") }) };
});

const { removeRunDirectory } = await import("../../e2e/support/database.js");

/** @type {string[]} */
const created = [];

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** @param {string} prefix */
function makeDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(dir, "importante.txt"), "não é do teste");
  created.push(dir);
  return dir;
}

describe("removeRunDirectory confere o diretório por conta própria", () => {
  it("recusa e preserva um diretório que não é de rodada, mesmo que o ambiente o entregue", () => {
    target.dir = makeDir("meus-dados-");

    expect(() => removeRunDirectory()).toThrow(/não é um diretório de rodada/);

    expect(fs.existsSync(path.join(target.dir, "importante.txt"))).toBe(true);
  });

  it("recusa o próprio os.tmpdir() e um subdiretório de uma rodada", () => {
    target.dir = os.tmpdir();
    expect(() => removeRunDirectory()).toThrow(/não é um diretório de rodada/);

    const run = makeDir("vitrine-e2e-");
    target.dir = path.join(run, "sub");
    fs.mkdirSync(target.dir);
    expect(() => removeRunDirectory()).toThrow(/não é um diretório de rodada/);
    expect(fs.existsSync(target.dir)).toBe(true);
  });

  it("apaga um diretório de rodada", () => {
    target.dir = makeDir("vitrine-e2e-");

    removeRunDirectory();

    expect(fs.existsSync(target.dir)).toBe(false);
  });
});
