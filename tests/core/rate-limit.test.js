// Limite de taxa das escritas por usuário (RN25, ADR-029, item 9): janela fixa de 60 s, em memória,
// por grupo e por usuário.
import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, RATE_WINDOW_MS, resetRateLimits, takeToken } from "@/app/api/_lib/rate-limit";

beforeEach(() => resetRateLimits());

describe("takeToken", () => {
  it("os limites são os da ADR-029: 60 em conteúdo, 20 em usuários, 5 em senha, janela de 60 s", () => {
    expect(RATE_LIMITS).toEqual({ content: 60, users: 20, password: 5 });
    expect(RATE_WINDOW_MS).toBe(60_000);
    expect(Object.isFrozen(RATE_LIMITS)).toBe(true);
  });

  it("aceita exatamente o máximo da janela e recusa a seguinte, com Retry-After", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(takeToken("password", "u1", t0 + i)).toEqual({ ok: true });
    expect(takeToken("password", "u1", t0 + 10_000)).toEqual({ ok: false, retryAfter: 50 });
  });

  it("a janela é fixa: depois de 60 s o contador zera", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) takeToken("password", "u1", t0);
    expect(takeToken("password", "u1", t0 + 59_999).ok).toBe(false);
    expect(takeToken("password", "u1", t0 + 60_000)).toEqual({ ok: true });
    expect(takeToken("password", "u1", t0 + 60_001)).toEqual({ ok: true });
  });

  it("o Retry-After nunca é menor que 1 segundo", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) takeToken("password", "u1", t0);
    expect(takeToken("password", "u1", t0 + 59_999)).toEqual({ ok: false, retryAfter: 1 });
  });

  it("os contadores são por usuário e por grupo", () => {
    for (let i = 0; i < 5; i++) takeToken("password", "u1");
    expect(takeToken("password", "u1").ok).toBe(false);
    expect(takeToken("password", "u2").ok).toBe(true);
    expect(takeToken("users", "u1").ok).toBe(true);
    expect(takeToken("content", "u1").ok).toBe(true);
  });

  it("grupo desconhecido é erro de programação, e não passagem livre", () => {
    expect(() => takeToken(/** @type {any} */ ("outro"), "u1")).toThrow(/desconhecido/);
  });

  it("o estado vive em globalThis, para valer entre cópias do módulo (um pacote por rota)", () => {
    takeToken("users", "u1");
    const holder = /** @type {any} */ (globalThis)[Symbol.for("vitrine.rateLimit")];
    expect(holder.get("users:u1")).toMatchObject({ count: 1 });
  });

  it("varre as janelas vencidas quando o mapa cresce demais", () => {
    const holder = /** @type {Map<string, any>} */ (/** @type {any} */ (globalThis)[Symbol.for("vitrine.rateLimit")] ?? new Map());
    takeToken("users", "primeiro", 0);
    for (let i = 0; i < 10_001; i++) holder.set(`users:u${i}`, { start: 0, count: 1 });
    takeToken("users", "novo", 120_000);
    expect(holder.size).toBeLessThan(10);
  });
});
