// Salvaguarda do teardown dos testes de ponta a ponta (R-003, ressalva 1): `removeRunDirectory` só
// apaga `vitrine-e2e-*` DIRETAMENTE em os.tmpdir(), e `e2eEnvironment` recusa um VITRINE_E2E_DIR
// herdado do ambiente que não satisfaça isso. Antes, um diretório de ensaio apontado à mão era
// apagado por inteiro, com arquivos que não eram do teste.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeRunDirectory } from "../../e2e/support/database.js";
import { RUN_DIR_PREFIX, e2eEnvironment, isRunDirectory } from "../../e2e/support/env.js";

const KEYS = ["VITRINE_E2E_DIR", "VITRINE_E2E_PORT", "VITRINE_E2E_SECRET"];
/** @type {Record<string, string | undefined>} */
let saved;
/** @type {string[]} */
let created;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  created = [];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

/** Diretório real em os.tmpdir(), com um arquivo dentro. @param {string} prefix */
function makeDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(dir, "importante.txt"), "não é do teste");
  created.push(dir);
  return dir;
}

/** @param {string} dir */
function pointRunAt(dir) {
  process.env.VITRINE_E2E_DIR = dir;
  process.env.VITRINE_E2E_PORT = "40123";
  process.env.VITRINE_E2E_SECRET = "segredo-ficticio-do-teste";
}

describe("isRunDirectory", () => {
  const tmp = os.tmpdir();

  it("aceita vitrine-e2e-* diretamente em os.tmpdir()", () => {
    expect(isRunDirectory(path.join(tmp, `${RUN_DIR_PREFIX}abc123`))).toBe(true);
    expect(isRunDirectory(path.join(tmp, RUN_DIR_PREFIX))).toBe(true);
  });

  it.each([
    ["o próprio os.tmpdir()", () => tmp],
    ["outro nome em os.tmpdir()", () => path.join(tmp, "meus-dados")],
    ["um prefixo parecido", () => path.join(tmp, "vitrine-e2e")],
    ["um subdiretório de uma rodada", () => path.join(tmp, `${RUN_DIR_PREFIX}abc`, "sub")],
    ["um ../ que sai da rodada", () => path.join(tmp, `${RUN_DIR_PREFIX}abc`, "..", "meus-dados")],
    ["a raiz do sistema de arquivos", () => path.parse(tmp).root],
    ["o diretório do repositório", () => process.cwd()],
    ["um caminho relativo", () => `${RUN_DIR_PREFIX}abc`],
    ["o diretório pai de os.tmpdir()", () => path.dirname(tmp)],
  ])("recusa %s", (_label, build) => {
    expect(isRunDirectory(build())).toBe(false);
  });
});

describe("e2eEnvironment recusa um VITRINE_E2E_DIR herdado que não seja de rodada", () => {
  it("aceita uma pasta de rodada herdada", () => {
    const dir = path.join(os.tmpdir(), `${RUN_DIR_PREFIX}herdado`);
    pointRunAt(dir);
    expect(e2eEnvironment().dir).toBe(dir);
  });

  it.each([
    ["um diretório qualquer de os.tmpdir()", () => makeDir("meus-dados-")],
    ["o próprio os.tmpdir()", () => os.tmpdir()],
    ["o diretório home", () => os.homedir()],
  ])("lança com %s", (_label, build) => {
    pointRunAt(build());
    expect(() => e2eEnvironment()).toThrow(/VITRINE_E2E_DIR deve ser um diretório vitrine-e2e-\*/);
  });

  it("sem VITRINE_E2E_DIR, sorteia um diretório de rodada válido", () => {
    delete process.env.VITRINE_E2E_DIR;
    delete process.env.VITRINE_E2E_PORT;
    const { dir } = e2eEnvironment();
    expect(isRunDirectory(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false); // só o nome; quem cria é prepare-database.mjs
  });
});

describe("removeRunDirectory", () => {
  it("apaga a pasta da rodada", () => {
    const dir = makeDir(RUN_DIR_PREFIX);
    pointRunAt(dir);

    removeRunDirectory();

    expect(fs.existsSync(dir)).toBe(false);
  });

  it("recusa apagar um diretório que não é de rodada e deixa os arquivos onde estão", () => {
    const dir = makeDir("meus-dados-");
    pointRunAt(dir);

    expect(() => removeRunDirectory()).toThrow();

    expect(fs.existsSync(path.join(dir, "importante.txt"))).toBe(true);
  });

  it("recusa apagar quando o ambiente aponta para o próprio os.tmpdir()", () => {
    const marker = makeDir("meus-dados-");
    pointRunAt(os.tmpdir());

    expect(() => removeRunDirectory()).toThrow();

    expect(fs.existsSync(path.join(marker, "importante.txt"))).toBe(true);
  });
});
