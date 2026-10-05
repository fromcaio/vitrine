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

const MIGRATION = path.join(projectRoot, "prisma", "migrations", "20261004120000_multiusuario", "migration.sql");

/**
 * Primeiros segmentos de URL de uma pasta de rotas do App Router. Pastas privadas (`_x`), de rotas
 * paralelas (`@x`) e dinâmicas (`[x]`) não são segmentos estáticos; grupos `(x)` não somam segmento,
 * e o que está dentro deles conta como se estivesse na pasta de cima (o portal `/` mora em
 * `(portal)`, com o layout só dele). Com `onlyDirectories`, só as pastas.
 * @param {string} dir
 * @param {{ onlyDirectories?: boolean }} [options]
 * @returns {string[]}
 */
export function staticTopSegments(dir, { onlyDirectories = false } = {}) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("(")) return staticTopSegments(path.join(dir, entry.name), { onlyDirectories });
    return onlyDirectories && !entry.isDirectory() ? [] : [entry.name];
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
    const routeFolders = staticTopSegments(appDir, { onlyDirectories: true });
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

  it("a migração do Dados só deriva handle de nomes que a lista do código reserva (pedido do M-012, item 7)", () => {
    // A migração promove o usuário mais antigo e deriva o handle do e-mail, pulando os nomes do SQL
    // `h NOT IN (...)`: um retrato da lista. Cada nome do retrato precisa estar na fonte única, para que
    // a migração nunca grave um handle que o código recusaria.
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const match = sql.match(/h NOT IN \(([^)]*)\)/);
    expect(match, "a migração tem o NOT IN com os nomes reservados").not.toBeNull();
    const snapshot = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((item) => item[1]);

    expect(snapshot.length).toBeGreaterThanOrEqual(4);
    for (const name of snapshot) expect(RESERVED_HANDLES, `${name} está na migração`).toContain(name);
    // e o contrário, ressalvando o que o GLOB do SQL já recusa: `_next` não casa com [a-z0-9-]
    for (const name of RESERVED_HANDLES) {
      if (/^[a-z0-9-]+$/.test(name)) expect(snapshot, `${name} falta na migração`).toContain(name);
    }
  });

  it("as pastas de rota que existem hoje são todas reservadas (admin, api, login)", () => {
    // `%5F` é o sublinhado na URL (Next.js): `%5Fnao-encontrado` é o segmento `_nao-encontrado`.
    const all = staticTopSegments(appDir, { onlyDirectories: true }).map((name) => ({ folder: name, segment: decodeURIComponent(name) }));
    const routeFolders = all.filter(({ segment }) => !/^[_[@]/.test(segment)).map(({ segment }) => segment);
    expect(routeFolders.sort()).toEqual(["admin", "api", "login"]);
    for (const name of routeFolders) expect(RESERVED_HANDLES).toContain(name);

    // O segmento com sublinhado (o alvo do 404 do Proxy) é rota de verdade, mas nenhum handle o tem.
    const underscored = all.filter(({ folder, segment }) => segment.startsWith("_") && folder.startsWith("%5F"));
    expect(underscored.map(({ segment }) => segment)).toEqual(["_nao-encontrado"]);
    for (const { segment } of underscored) expect(handleError(segment)).not.toBeNull();
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
