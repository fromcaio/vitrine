// Medição de desempenho e planos de consulta das leituras que as páginas públicas usarão (A-018;
// RN15, RN25, RN28; RNF de desempenho). Semeia 50 usuários com 500 conteúdos cada (25 000 linhas, o
// teto da RN25), mede a mediana, o p95 e o pior caso de 200 chamadas de cada função de leitura e
// confere, com EXPLAIN QUERY PLAN, que as consultas usam os índices do Apêndice A. Não altera
// funções nem schema: só mede. Os tetos são generosos (instabilidade entre máquinas); os números
// reais saem no console, em tabela.
//
// Épico v1 (A-026): a massa inclui 50 avatares (24 KiB cada, o tamanho de uma saída de 256x256 em
// WebP), medem-se `listPublicSpaces` (que devolve o `avatarImageId`, nunca os bytes), `getImage` (a leitura
// de `/media/<id>`) e `getEffectiveAppearance`, e o relato traz o tamanho do banco com as imagens.
//
// Fica fora da suíte do dia a dia: só roda com MEDICAO=1 (a semeadura e as 3 000+ chamadas custam
// dezenas de segundos). Exemplo: `MEDICAO=1 npx vitest run tests/dados/desempenho.test.js`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getContentByPath,
  getContentTree,
  getEffectiveAppearance,
  getImage,
  getNotification,
  getPublicPaths,
  getUserByHandle,
  listNotifications,
  listPublicSpaces,
  prisma,
} from "@/lib/db";

const ENABLED = process.env.MEDICAO === "1";

const USERS = 50;
const PER_USER = 500;
const WARMUP = 20;
const CALLS = 200;
/** Teto do p95 de cada função, em ms (generoso: o alvo real é bem menor). */
const P95_CEILING_MS = 250;
/** Acima disto, no pior caso, a medição pede um [RFC] (A-018, item 5). */
const WORST_ALERT_MS = 50;
/** Usuários 45 a 47: nenhuma raiz publicada. O 48 está suspenso. */
const NO_PUBLISHED_ROOT = [45, 46, 47];
const SUSPENDED = 48;
const NOTIFIED = 0;
/** Tamanho de cada avatar semeado: uma saída típica de 256x256 em WebP. */
const AVATAR_BYTES = 24 * 1024;
const avatarId = (/** @type {number} */ u) => `img-avatar-${String(u).padStart(2, "0")}`;

const userId = (/** @type {number} */ u) => `u${String(u).padStart(2, "0")}`;
const handleOf = (/** @type {number} */ u) => `espaco-${String(u).padStart(2, "0")}`;
/** Espaços cuja raiz publicada existe e que não estão suspensos: servem às consultas "por caminho". */
const ELIGIBLE = Array.from({ length: USERS }, (_, u) => u).filter(
  (u) => !NO_PUBLISHED_ROOT.includes(u) && u !== SUSPENDED,
);

/**
 * Estrutura de um espaço (igual para todos os donos, salvo as raízes dos sem raiz publicada):
 * 12 raízes (10 coleções e 2 documentos); cada coleção abaixo do nível 5 tem 5 filhos, 2 coleções
 * e 3 documentos; para em 500 nós, em largura. ~20% de rascunhos (inclusive coleções-rascunho com
 * descendentes publicados, que a RN15 poda).
 * @returns {Array<{ idx: number, parent: number | null, depth: number, type: string, status: string, order: number }>}
 */
function buildLayout() {
  /** @type {Array<{ idx: number, parent: number | null, depth: number, type: string, status: string, order: number }>} */
  const nodes = [];
  /** @type {number[]} */
  const queue = [];
  /** @param {number | null} parent @param {number} depth @param {string} type @param {number} order */
  const add = (parent, depth, type, order) => {
    const idx = nodes.length;
    nodes.push({ idx, parent, depth, type, status: idx % 5 === 3 ? "DRAFT" : "PUBLISHED", order });
    if (type === "COLLECTION" && depth < 5) queue.push(idx);
  };
  for (let i = 0; i < 12; i++) add(null, 1, i % 6 === 5 ? "DOCUMENT" : "COLLECTION", i);
  while (queue.length > 0 && nodes.length < PER_USER) {
    const parent = /** @type {number} */ (queue.shift());
    const depth = nodes[parent].depth + 1;
    for (let j = 0; j < 5 && nodes.length < PER_USER; j++) {
      add(parent, depth, j < 2 && depth < 5 ? "COLLECTION" : "DOCUMENT", j);
    }
  }
  return nodes;
}

/** Corpo fictício de ~3 KiB. @param {number} idx */
function bodyOf(idx) {
  const paragraph = `Parágrafo fictício do conteúdo ${idx}: texto de enchimento para dar volume ao corpo do documento. `;
  return `# Documento ${idx}\n\n${paragraph.repeat(30)}`;
}

/**
 * @param {number[]} values
 * @param {number} p
 */
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/** @type {Array<{ name: string, cold: number, median: number, p95: number, worst: number }>} */
const results = [];

/**
 * Mede `fn(i)`: a primeira chamada (fria), um aquecimento de 20 e 200 chamadas medidas, uma por vez.
 * @param {string} name
 * @param {(i: number) => Promise<unknown>} fn
 */
async function measure(name, fn) {
  let t = performance.now();
  await fn(0);
  const cold = performance.now() - t;
  for (let i = 1; i <= WARMUP; i++) await fn(i);
  /** @type {number[]} */
  const times = [];
  for (let i = 0; i < CALLS; i++) {
    t = performance.now();
    await fn(WARMUP + 1 + i);
    times.push(performance.now() - t);
  }
  const row = { name, cold, median: percentile(times, 0.5), p95: percentile(times, 0.95), worst: Math.max(...times) };
  results.push(row);
  return row;
}

/** Caminho do arquivo do banco temporário deste arquivo de teste. */
const dbPath = () => /** @type {string} */ (process.env.DATABASE_URL).replace(/^file:/, "");

/**
 * Captura o SQL (e os argumentos) que `fn` envia ao SQLite, espiando `Database#prepare` do
 * better-sqlite3, que o adaptador do Prisma usa.
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<Array<{ sql: string, args: unknown[] }>>}
 */
async function captureSql(fn) {
  /** @type {Array<{ sql: string, args: unknown[] }>} */
  const captured = [];
  const proto = /** @type {any} */ (Database.prototype);
  const original = proto.prepare;
  proto.prepare = function (/** @type {string} */ sql, ...rest) {
    const stmt = original.call(this, sql, ...rest);
    const bind = stmt.bind;
    stmt.bind = (/** @type {any[]} */ ...args) => {
      captured.push({ sql, args: args.flat() });
      return bind.apply(stmt, args);
    };
    return stmt;
  };
  try {
    await fn();
  } finally {
    proto.prepare = original;
  }
  return captured.filter(({ sql }) => /^\s*SELECT/i.test(sql));
}

/**
 * EXPLAIN QUERY PLAN de cada consulta, em linhas de texto.
 * @param {Database.Database} db
 * @param {Array<{ sql: string, args: unknown[] }>} queries
 * @returns {string[]}
 */
function explain(db, queries) {
  return queries.flatMap(({ sql, args }) =>
    /** @type {Array<{ detail: string }>} */ (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args)).map((row) => row.detail),
  );
}

/** Varreduras de tabela sem índice em `contents`, `notifications`, `images` ou `footer_links` (e em `user`, se `strictUser`). */
function scanProblems(/** @type {string[]} */ plan, strictUser = false) {
  const base = "contents|notifications|images|footer_links";
  const tables = strictUser ? `${base}|user` : base;
  return plan.filter((line) => new RegExp(`^SCAN (main\\.)?(${tables})\\b(?!.*USING)`).test(line));
}

(ENABLED ? describe : describe.skip)("desempenho das leituras públicas (A-018; MEDICAO=1)", () => {
  /** @type {ReturnType<typeof buildLayout>} */
  let layout;
  /** @type {number} */
  let shallowIdx;
  /** @type {number} */
  let deepIdx;
  /** @type {number} */
  let collectionIdx;
  /** @type {string[]} */
  let shallowSlugs;
  /** @type {string[]} */
  let deepSlugs;
  /** @type {string} */
  let notificationId;
  /** @type {Database.Database} */
  let sqlite;
  /** @type {Record<string, string[]>} */
  const plans = {};
  /** Linhas extras do relato (o tamanho do banco com as imagens). @type {string[]} */
  const extras = [];

  /** @param {number} idx */
  const slugPathOf = (idx) => {
    /** @type {string[]} */
    const slugs = [];
    for (let at = /** @type {number | null} */ (idx); at !== null; at = layout[at].parent) slugs.unshift(`n${at}`);
    return slugs;
  };
  /** O nó e todos os ancestrais publicados? @param {number} idx */
  const visible = (idx) => slugPathOf(idx).every((slug) => layout[Number(slug.slice(1))].status === "PUBLISHED");
  const owner = (/** @type {number} */ i) => userId(ELIGIBLE[i % ELIGIBLE.length]);

  beforeAll(async () => {
    layout = buildLayout();
    expect(layout).toHaveLength(PER_USER);
    shallowIdx = layout.findIndex((n) => n.depth === 1 && n.type === "DOCUMENT" && visible(n.idx));
    deepIdx = layout.findIndex((n) => n.depth === 5 && n.type === "DOCUMENT" && visible(n.idx));
    collectionIdx = layout.findIndex((n) => n.depth === 1 && n.type === "COLLECTION" && visible(n.idx));
    expect([shallowIdx, deepIdx, collectionIdx].every((i) => i >= 0)).toBe(true);
    shallowSlugs = slugPathOf(shallowIdx);
    deepSlugs = slugPathOf(deepIdx);

    await prisma.content.deleteMany();
    await prisma.image.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.createMany({
      data: Array.from({ length: USERS }, (_, u) => ({
        id: userId(u),
        name: `Autor fictício ${u}`,
        email: `autor-${u}@exemplo.test`,
        emailVerified: true,
        handle: handleOf(u),
        role: u === 0 ? "admin" : "user",
        banned: u === SUSPENDED,
        banReason: u === SUSPENDED ? "suspensão fictícia" : null,
      })),
    });

    const base = Date.UTC(2026, 0, 1);
    await prisma.$transaction(
      async (tx) => {
        for (let u = 0; u < USERS; u++) {
          const hideRoots = NO_PUBLISHED_ROOT.includes(u);
          const rows = layout.map((n) => ({
            id: `${userId(u)}-${n.idx}`,
            title: `Item ${n.idx}`,
            slug: `n${n.idx}`,
            body: n.type === "DOCUMENT" ? bodyOf(n.idx) : null,
            type: n.type,
            status: /** @type {"DRAFT" | "PUBLISHED"} */ (hideRoots && n.parent === null ? "DRAFT" : n.status),
            order: n.order,
            parentId: n.parent === null ? null : `${userId(u)}-${n.parent}`,
            authorId: userId(u),
            createdAt: new Date(base + n.idx * 60_000),
            updatedAt: new Date(base + n.idx * 60_000),
          }));
          // Pais antes dos filhos (a ordem do layout é em largura) e lotes pequenos (limite de variáveis).
          for (let i = 0; i < rows.length; i += 200) await tx.content.createMany({ data: rows.slice(i, i + 200) });
        }
        await tx.notification.createMany({
          data: Array.from({ length: 1000 }, (_, i) => ({
            id: `notif-${String(i).padStart(4, "0")}`,
            userId: userId(NOTIFIED),
            type: ["CONTRAST", "MODERATION", "ACCOUNT"][i % 3],
            severity: /** @type {const} */ (["INFO", "WARNING", "CRITICAL"][i % 3]),
            dedupeKey: i % 10 === 0 ? `chave-${i}` : null,
            data: JSON.stringify({ i }),
            readAt: i % 2 === 0 ? new Date(base + i * 60_000) : null,
            createdAt: new Date(base + i * 60_000),
            updatedAt: new Date(base + i * 60_000),
          })),
        });
        // 50 avatares de 24 KiB, um por usuário (inclusive os sem raiz publicada e o suspenso)
        await tx.image.createMany({
          data: Array.from({ length: USERS }, (_, u) => ({
            id: avatarId(u),
            kind: "avatar",
            mime: "image/webp",
            bytes: Buffer.alloc(AVATAR_BYTES, (u % 250) + 1),
            width: 256,
            height: 256,
            sha256: String(u).padStart(64, "0"),
            ownerId: userId(u),
          })),
        });
        for (let u = 0; u < USERS; u++) {
          await tx.user.update({ where: { id: userId(u) }, data: { avatarImageId: avatarId(u) } });
        }
      },
      { timeout: 600_000, maxWait: 60_000 },
    );
    notificationId = "notif-0500";
    sqlite = new Database(dbPath(), { readonly: true });
  }, 900_000);

  afterAll(() => {
    sqlite?.close();
    const rows = results.map((r) => ({
      função: r.name,
      "1ª (fria)": `${r.cold.toFixed(2)} ms`,
      mediana: `${r.median.toFixed(2)} ms`,
      p95: `${r.p95.toFixed(2)} ms`,
      "pior caso": `${r.worst.toFixed(2)} ms${r.worst > WORST_ALERT_MS ? "  (> 50 ms)" : ""}`,
    }));
    const planText = Object.entries(plans)
      .map(([name, plan]) => `PLANO ${name}\n  ${plan.join("\n  ")}`)
      .join("\n");
    // O Vitest esconde o console de um arquivo que passa: MEDICAO_RELATORIO=<arquivo> grava o relato.
    const report = process.env.MEDICAO_RELATORIO;
    if (report) {
      const lines = rows.map((r) => `| ${r["função"]} | ${r["1ª (fria)"]} | ${r.mediana} | ${r.p95} | ${r["pior caso"]} |`);
      fs.writeFileSync(report, `${lines.join("\n")}\n\n${extras.join("\n")}\n\n${planText}\n`);
    } else {
      console.table(rows);
      console.log(extras.join("\n"));
      console.log(planText);
    }
  });

  it("a massa tem 50 usuários, 25 000 conteúdos, 1 000 notificações e 50 avatares", async () => {
    expect(await prisma.user.count()).toBe(USERS);
    expect(await prisma.image.count()).toBe(USERS);
    expect(await prisma.user.count({ where: { avatarImageId: { not: null } } })).toBe(USERS);
    expect(await prisma.content.count()).toBe(USERS * PER_USER);
    expect(await prisma.notification.count({ where: { userId: userId(NOTIFIED) } })).toBe(1000);
    const drafts = await prisma.content.count({ where: { status: "DRAFT" } });
    expect(drafts / (USERS * PER_USER)).toBeGreaterThan(0.15);
    expect(drafts / (USERS * PER_USER)).toBeLessThan(0.3);
  });

  /** Medição + plano de uma função: o teto vale para o p95; o plano é registrado e conferido. */
  const cases = /** @type {Array<[string, (i: number) => Promise<unknown>, boolean?]>} */ ([
    ["getContentTree({ ownerId })", (i) => getContentTree({ ownerId: userId(i % USERS) })],
    ["getContentTree({ ownerId, onlyPublished })", (i) => getContentTree({ ownerId: owner(i), onlyPublished: true })],
    ["getContentByPath, raso (nível 1)", (i) => getContentByPath(owner(i), shallowSlugs, { onlyPublished: true })],
    ["getContentByPath, profundo (nível 5)", (i) => getContentByPath(owner(i), deepSlugs, { onlyPublished: true })],
    ["getContentByPath, inexistente", (i) => getContentByPath(owner(i), ["nao-existe", "x"], { onlyPublished: true })],
    ["getPublicPaths(ownerId)", (i) => getPublicPaths(owner(i))],
    ["getPublicPaths(ownerId, nodeId)", (i) => getPublicPaths(owner(i), `${owner(i)}-${collectionIdx}`)],
    ["listPublicSpaces() (50 usuários com avatar)", () => listPublicSpaces()],
    ["getImage (avatar de 24 KiB)", (i) => getImage(avatarId(i % USERS))],
    ["getEffectiveAppearance(ownerId)", (i) => getEffectiveAppearance(owner(i))],
    ["getUserByHandle, existente", (i) => getUserByHandle(handleOf(ELIGIBLE[i % ELIGIBLE.length])), true],
    ["getUserByHandle, inexistente", (i) => getUserByHandle(`inexistente-${i}`), true],
    ["getNotification (1 000 do usuário)", () => getNotification(userId(NOTIFIED), notificationId)],
    ["listNotifications (take 20)", () => listNotifications(userId(NOTIFIED))],
    ["listNotifications (unreadOnly, take 20)", () => listNotifications(userId(NOTIFIED), { unreadOnly: true })],
    ["listNotifications (cursor, take 20)", () => listNotifications(userId(NOTIFIED), { cursor: notificationId })],
  ]);

  describe.each(cases)("%s", (name, fn, strictUser) => {
    it(`p95 abaixo de ${P95_CEILING_MS} ms (200 chamadas, depois de 20 de aquecimento)`, async () => {
      const row = await measure(name, fn);
      expect(row.p95).toBeLessThan(P95_CEILING_MS);
    }, 300_000);

    it("o plano de consulta usa índice, sem varredura de tabela", async () => {
      const queries = await captureSql(() => fn(1));
      expect(queries.length).toBeGreaterThan(0);
      plans[name] = explain(sqlite, queries);
      expect(scanProblems(plans[name], strictUser)).toEqual([]);
    });
  });

  it("os planos citam os índices esperados do Apêndice A", () => {
    const text = (/** @type {string} */ name) => plans[name].join("\n");
    expect(text("getContentTree({ ownerId })")).toContain("contents_authorId_parentId_order_idx");
    expect(text("getContentByPath, raso (nível 1)")).toContain("contents_authorId_parentId_order_idx");
    expect(text("getUserByHandle, existente")).toContain("user_handle_key");
    expect(text("getNotification (1 000 do usuário)")).toContain("sqlite_autoindex_notifications_1");
    expect(text("listNotifications (unreadOnly, take 20)")).toContain("notifications_userId_readAt_updatedAt_idx");
    expect(text("getImage (avatar de 24 KiB)")).toContain("sqlite_autoindex_images_1");
    expect(text("getEffectiveAppearance(ownerId)")).toContain("footer_links_ownerId_order_idx");
  });

  it("listPublicSpaces devolve o avatarImageId de todos os espaços listados e nunca consulta a tabela images nem a coluna bytes", async () => {
    const spaces = await listPublicSpaces();
    for (const space of spaces) {
      expect(space.avatarImageId, space.handle).toBe(avatarId(Number(space.id.slice(1))));
    }
    const queries = await captureSql(() => listPublicSpaces());
    expect(queries.length).toBeGreaterThan(0);
    for (const { sql } of queries) {
      expect(sql).not.toMatch(/\bbytes\b/);
      expect(sql).not.toMatch(/\bFROM\s+["`]?(main["`]?\.["`]?)?images\b/i);
    }
  });

  it("o tamanho do banco com 50 avatares de 24 KiB (relato)", async () => {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    const [{ imagens }] = /** @type {any[]} */ (await prisma.$queryRawUnsafe("SELECT coalesce(sum(length(bytes)), 0) AS imagens FROM images"));
    const total = fs.statSync(dbPath()).size;
    const mib = (/** @type {number} */ n) => `${(Number(n) / 1024 / 1024).toFixed(2)} MiB`;
    expect(Number(imagens)).toBe(USERS * AVATAR_BYTES);
    extras.push(`Banco com ${USERS} avatares de ${AVATAR_BYTES / 1024} KiB: arquivo ${mib(total)}, dos quais ${mib(Number(imagens))} em images (${USERS} linhas).`);
    expect(total).toBeGreaterThan(Number(imagens));
  });

  it("listPublicSpaces devolve só os espaços com raiz publicada e não suspensos (RN15, RN23, RN28)", async () => {
    const spaces = await listPublicSpaces();
    expect(spaces).toHaveLength(USERS - NO_PUBLISHED_ROOT.length - 1);
    expect(spaces.map((s) => s.handle)).not.toContain(handleOf(SUSPENDED));
  });

  it("o teste tem dentes: sem o índice (authorId, parentId, order), o plano acusa SCAN em contents", async () => {
    const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vitrine-desempenho-")), "sem-indice.db");
    try {
      await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(dbPath(), copy);
      const db = new Database(copy);
      try {
        db.exec('DROP INDEX "contents_authorId_parentId_order_idx"');
        const queries = await captureSql(() => getContentTree({ ownerId: userId(1) }));
        const problems = scanProblems(explain(db, queries));
        expect(problems.length).toBeGreaterThan(0);
      } finally {
        db.close();
      }
    } finally {
      fs.rmSync(path.dirname(copy), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }, 120_000);
});
