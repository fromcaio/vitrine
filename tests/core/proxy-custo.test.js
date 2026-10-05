// Custo do Proxy dos espaços públicos (A-014 Parte 3b, item 4; Cap. 5 §5.7: "o Core mede o custo de o
// Proxy consultar também o documento, e reporta"; CT45). FORA do `npm test` por padrão: só roda com
// `MEDICAO=1` (`MEDICAO=1 npx vitest run tests/core/proxy-custo.test.js`; `MEDICAO_RELATORIO=<arquivo>`
// grava a tabela). Semeia 50 usuários e, para o medido, 500 conteúdos (o teto da RN25) em 5 níveis, e
// mede, em milissegundos, a chamada do Proxy em quatro situações:
//   1. handle ativo (uma consulta pelo índice único do handle): o que o Proxy faz hoje;
//   2. handle ativo E documento (a leitura da árvore do dono, `getContentByPath`): a alternativa medida;
//   3. handle desconhecido (a mesma consulta, sem linha): o `rewrite` ao 404;
//   4. forma inválida (maiúsculas, ponto...): só a expressão regular, sem banco.
import "./env";
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getContentByPath, prisma } from "@/lib/db";
import { proxy } from "@/proxy";
import { createTestUser, resetDatabase } from "./helpers";

const ENABLED = process.env.MEDICAO === "1";
const ITERATIONS = 400;

/** @param {number[]} values */
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { median: at(0.5), p95: at(0.95), worst: sorted.at(-1), first: values[0] };
}

/** @param {() => Promise<unknown>} run */
async function measure(run) {
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  return stats(times);
}

describe.skipIf(!ENABLED)("custo do Proxy dos espaços públicos (MEDICAO=1)", () => {
  /** @type {string} */
  let deepPath = "";

  beforeAll(async () => {
    await resetDatabase();
    // 49 usuários de fundo, para o índice do handle não ser trivial.
    for (let i = 0; i < 49; i++) await createTestUser({ email: `u${i}@exemplo.test`, handle: `usuario-${i}` });
    const owner = await createTestUser({ email: "dono@exemplo.test", handle: "dono-medido" });

    // 500 conteúdos: 5 níveis de coleções (4 por nível) e documentos publicados e em rascunho.
    let remaining = 500;
    const now = new Date();
    /** @param {string | null} parentId @param {number} depth @param {string[]} path */
    async function fill(parentId, depth, path) {
      for (let order = 0; order < 4 && remaining > 0; order++) {
        const slug = `c${depth}-${order}`;
        const collection = await prisma.content.create({
          data: { title: slug, slug, type: "COLLECTION", status: "PUBLISHED", order, parentId, authorId: owner.id, createdAt: now },
        });
        remaining--;
        for (let doc = 0; doc < 4 && remaining > 0; doc++) {
          await prisma.content.create({
            data: { title: `d${doc}`, slug: `d${doc}`, type: "DOCUMENT", status: doc === 3 ? "DRAFT" : "PUBLISHED", order: doc, parentId: collection.id, authorId: owner.id, body: "x".repeat(2000), createdAt: now },
          });
          remaining--;
        }
        if (depth < 4) await fill(collection.id, depth + 1, [...path, slug]);
      }
    }
    await fill(null, 0, []);
    deepPath = "c0-0/c1-0/c2-0/c3-0/c4-0/d0";
  }, 120_000);

  it("mede as quatro situações e grava a tabela", async () => {
    const request = (path) => new NextRequest(`http://localhost:3000${path}`);

    const rows = [
      ["1. handle ativo (o Proxy de hoje)", await measure(() => proxy(request(`/dono-medido/${deepPath}`)))],
      [
        "2. handle ativo + documento (alternativa)",
        await measure(async () => {
          const response = await proxy(request(`/dono-medido/${deepPath}`));
          const owner = await prisma.user.findFirst({ where: { handle: "dono-medido" }, select: { id: true } });
          await getContentByPath(owner.id, deepPath.split("/"), { onlyPublished: true });
          return response;
        }),
      ],
      ["3. handle desconhecido (rewrite ao 404)", await measure(() => proxy(request("/ninguem-por-aqui/qualquer")))],
      ["4. forma inválida (rewrite, sem banco)", await measure(() => proxy(request("/Dono-Medido/Sobre")))],
    ];

    const total = await prisma.content.count();
    const table = [
      `Conteúdos do dono medido: ${total}; usuários: 50; ${ITERATIONS} chamadas por linha.`,
      "| Situação | 1ª (fria) | Mediana | p95 | Pior |",
      "|---|---|---|---|---|",
      ...rows.map(([label, s]) => `| ${label} | ${s.first.toFixed(2)} | ${s.median.toFixed(2)} | ${s.p95.toFixed(2)} | ${s.worst.toFixed(2)} |`),
    ].join("\n");
    console.log(`\n${table}\n`);
    if (process.env.MEDICAO_RELATORIO) writeFileSync(process.env.MEDICAO_RELATORIO, table + "\n");

    expect(total).toBeGreaterThanOrEqual(400);
    // O Proxy de hoje tem de caber folgado na visita (uma consulta indexada); a forma inválida não toca o banco.
    expect(rows[0][1].p95).toBeLessThan(20);
    expect(rows[3][1].median).toBeLessThan(rows[0][1].median);
  }, 120_000);
});
