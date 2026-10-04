// Modo do banco (ADR-002, ADR-028): db.js abre cada conexão em WAL, com synchronous=NORMAL,
// foreign_keys=ON e um tempo de espera do bloqueio. Importa uma cópia nova do módulo para obter uma
// conexão que o setup dos testes (que desliga o fsync) ainda não tocou.
import { afterEach, describe, expect, it, vi } from "vitest";

/** @param {{ $queryRawUnsafe: (sql: string) => Promise<any[]> }} client @param {string} name */
async function pragma(client, name) {
  const [row] = await client.$queryRawUnsafe(`PRAGMA ${name}`);
  return Number(Object.values(row)[0]);
}

/** @param {{ $queryRawUnsafe: (sql: string) => Promise<any[]> }} client */
async function journalMode(client) {
  const [row] = await client.$queryRawUnsafe("PRAGMA journal_mode");
  return row.journal_mode;
}

describe("db.js: conexão (WAL, synchronous, foreign_keys, busy_timeout)", () => {
  /** @type {null | { prisma: { $disconnect: () => Promise<void> } }} */
  let fresh = null;

  afterEach(async () => {
    await fresh?.prisma.$disconnect();
    fresh = null;
    vi.resetModules();
  });

  async function openFreshModule() {
    vi.resetModules();
    delete (/** @type {any} */ (globalThis).prisma);
    fresh = await import("@/lib/db");
    return /** @type {any} */ (fresh);
  }

  it("abre o banco em WAL com synchronous=NORMAL e as chaves estrangeiras ligadas", async () => {
    const { prisma, BUSY_TIMEOUT_MS } = await openFreshModule();

    expect(await journalMode(prisma)).toBe("wal");
    expect(await pragma(prisma, "synchronous")).toBe(1); // 1 = NORMAL (FULL = 2)
    expect(await pragma(prisma, "foreign_keys")).toBe(1);
    expect(BUSY_TIMEOUT_MS).toBe(5000);
    expect(await pragma(prisma, "busy_timeout")).toBe(BUSY_TIMEOUT_MS);
  });

  it("reaplica o modo a cada conexão: depois de $disconnect, a nova conexão também é NORMAL", async () => {
    const { prisma } = await openFreshModule();
    await pragma(prisma, "synchronous");
    await prisma.$disconnect();

    expect(await pragma(prisma, "synchronous")).toBe(1);
    expect(await pragma(prisma, "foreign_keys")).toBe(1);
    expect(await journalMode(prisma)).toBe("wal");
  });
});
