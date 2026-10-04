// RN20: o handle não pode colidir com uma rota estática nem com uma pasta de `public/`. A lista de
// nomes reservados tem UMA fonte em código (RESERVED_HANDLES, em src/lib/validators.js) e este teste
// FALHA quando uma pasta nova de `public/` ou uma rota estática nova de `src/app/` nasce com um nome
// que um handle válido poderia ter e que não está na lista (R-006, decisão 3). Para corrigir: ou o
// nome entra em RESERVED_HANDLES, ou a rota muda de nome.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_HANDLES, handleError } from "@/lib/validators";
import { projectRoot } from "../setup/prisma-cli.js";

/**
 * Primeiros segmentos de URL de uma pasta de rotas do App Router. Pastas privadas (`_x`), de rotas
 * paralelas (`@x`) e dinâmicas (`[x]`) não são segmentos estáticos; grupos `(x)` não somam segmento,
 * e o que está dentro deles conta como se estivesse na pasta de cima.
 * @param {string} dir
 * @returns {string[]}
 */
export function staticTopSegments(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("(")) return staticTopSegments(path.join(dir, entry.name));
    return [entry.name];
  });
}

describe("RN20: handles reservados e rotas estáticas", () => {
  const appDir = path.join(projectRoot, "src", "app");
  const publicDir = path.join(projectRoot, "public");

  it("a lista reservada tem os nomes da RN20", () => {
    expect([...RESERVED_HANDLES].sort()).toEqual(["_next", "admin", "api", "login", "logout"]);
    for (const name of RESERVED_HANDLES) expect(typeof name).toBe("string");
  });

  it("toda rota estática de src/app/ e toda entrada de public/ é um handle inválido ou reservado", () => {
    const routeFolders = staticTopSegments(appDir).filter((name) => fs.statSync(path.join(appDir, name)).isDirectory());
    const publicEntries = fs.readdirSync(publicDir);

    const collisions = [];
    for (const name of [...routeFolders, ...publicEntries]) {
      // pastas privadas, dinâmicas e arquivos de rota (page.js, layout.js, globals.css) não viram segmento de URL
      if (/^[_[@]/.test(name)) continue;
      if (fs.statSync(path.join(appDir, name), { throwIfNoEntry: false })?.isFile()) continue;
      // `handleError` recusa: curto, longo, caracteres fora de [a-z0-9-] (um arquivo com extensão, como
      // `file.svg`, tem ponto e nunca é um handle) e os nomes reservados
      const candidate = name.toLowerCase();
      if (handleError(candidate) === null) collisions.push(`${name} → um handle "${candidate}" seria válido e colidiria`);
    }
    expect(collisions).toEqual([]);
  });

  it("as pastas de rota que existem hoje são todas reservadas (admin, api, login)", () => {
    const routeFolders = staticTopSegments(appDir).filter((name) => fs.statSync(path.join(appDir, name)).isDirectory() && !/^[_[@]/.test(name));
    expect(routeFolders.sort()).toEqual(["admin", "api", "login"]);
    for (const name of routeFolders) expect(RESERVED_HANDLES).toContain(name);
  });

  it("controle do teste: uma pasta nova com nome de handle válido seria detectada", () => {
    // `blog` seria um handle válido: uma rota estática /blog o esconderia (ou o handle esconderia a rota)
    expect(handleError("blog")).toBeNull();
    // e os reservados, com nomes de rota, são recusados
    for (const name of ["admin", "api", "login", "logout"]) expect(handleError(name)).not.toBeNull();
  });

  it("arquivos de public/ e de src/app/ com extensão nunca viram um handle (ponto não é aceito)", () => {
    for (const file of [...fs.readdirSync(publicDir), "favicon.ico", "sitemap.xml", "robots.txt"]) {
      if (file.includes(".")) expect(handleError(file.toLowerCase())).not.toBeNull();
    }
  });
});
