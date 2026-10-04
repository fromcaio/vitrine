// Critério de aceite da A-014: "nenhuma rota chama auth.api.* sem headers" (ADR-029, item 1). Chamado
// sem `headers`, o `auth.api.*` do better-auth NÃO verifica a sessão nem a permissão: é a porta de
// serviço do servidor. Só o bootstrap (`admin:create`, `admin:reset-password`) o faz, e por isso usa o
// adaptador interno em src/lib/auth.js. Este teste lê o código-fonte e falha se uma chamada de
// `auth.api.<nome>(...)` em src/app/ não passar `headers`, ou se alguma aparecer fora dos lugares
// previstos.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectRoot } from "../setup/prisma-cli.js";

/** Todos os arquivos .js sob um diretório. @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Chamadas `auth.api.nome(` e o texto dos argumentos, até o parêntese que fecha.
 * @param {string} source
 */
export function authApiCalls(source) {
  const calls = [];
  const pattern = /auth\.api\.(\w+)\s*\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 1;
    let index = pattern.lastIndex;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") depth -= 1;
      index += 1;
    }
    calls.push({ name: match[1], args: source.slice(pattern.lastIndex, index - 1) });
  }
  return calls;
}

describe("auth.api.* sempre com os headers do pedido (A-014, critério de aceite)", () => {
  const files = sourceFiles(path.join(projectRoot, "src")).filter((file) => !file.includes(`${path.sep}components${path.sep}`));

  it("o leitor de chamadas acha o que procura (controle do próprio teste)", () => {
    expect(authApiCalls("await auth.api.createUser({ headers, body: {} }); auth.api.signOut({ headers: await headers() })")).toEqual([
      { name: "createUser", args: "{ headers, body: {} }" },
      { name: "signOut", args: "{ headers: await headers() }" },
    ]);
    expect(authApiCalls("auth.api.getSession({ body: {} })")[0].args).not.toMatch(/\bheaders\b/);
  });

  it("toda chamada em src/ passa headers", () => {
    const offenders = [];
    let total = 0;
    for (const file of files) {
      for (const call of authApiCalls(fs.readFileSync(file, "utf8"))) {
        total += 1;
        if (!/\bheaders\b/.test(call.args)) offenders.push(`${path.relative(projectRoot, file)}: auth.api.${call.name}`);
      }
    }
    expect(total).toBeGreaterThan(5); // as rotas de usuários, getSession e signOut
    expect(offenders).toEqual([]);
  });

  it("o bootstrap não usa auth.api.* (usa o adaptador interno): o arquivo de auth tem só getSession", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "lib", "auth.js"), "utf8");
    expect(authApiCalls(source).map((call) => call.name)).toEqual(["getSession"]);
  });

  it("os scripts de terminal não chamam auth.api.*", () => {
    for (const script of ["create-admin.js", "reset-password.js"]) {
      expect(authApiCalls(fs.readFileSync(path.join(projectRoot, "scripts", script), "utf8"))).toEqual([]);
    }
  });
});
