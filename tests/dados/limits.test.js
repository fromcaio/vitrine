// Unidade: cotas por usuário (RN25), módulo puro src/lib/limits.js.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_CONTENTS_PER_USER,
  bodyBytes,
  resolveLimits,
} from "@/lib/limits";

describe("bodyBytes (RN25)", () => {
  it("mede bytes UTF-8, e não caracteres", () => {
    expect(bodyBytes("abc")).toBe(3);
    expect(bodyBytes("ação")).toBe(6); // 4 caracteres, 6 bytes
    expect(bodyBytes("€")).toBe(3);
    expect(bodyBytes("😀")).toBe(4); // um caractere fora do plano básico, 4 bytes
    expect("ação".length).toBe(4);
  });

  it("corpo ausente vale 0 byte", () => {
    expect(bodyBytes(null)).toBe(0);
    expect(bodyBytes(undefined)).toBe(0);
    expect(bodyBytes("")).toBe(0);
  });
});

describe("resolveLimits (RN25)", () => {
  it("os padrões são 500 conteúdos e 64 KiB (ADR-033)", () => {
    expect(DEFAULT_MAX_CONTENTS_PER_USER).toBe(500);
    expect(DEFAULT_MAX_BODY_BYTES).toBe(65_536);
    expect(resolveLimits(undefined)).toEqual({ maxContentsPerUser: 500, maxBodyBytes: 65_536 });
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });

  it("aceita valores informados, em separado", () => {
    expect(resolveLimits({ maxContentsPerUser: 10 })).toEqual({ maxContentsPerUser: 10, maxBodyBytes: 65_536 });
    expect(resolveLimits({ maxBodyBytes: 100 })).toEqual({ maxContentsPerUser: 500, maxBodyBytes: 100 });
  });

  it("ignora valores que não são inteiros positivos (uma variável malformada não desliga a cota)", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
      expect(resolveLimits(/** @type {any} */ ({ maxContentsPerUser: bad, maxBodyBytes: bad }))).toEqual(
        resolveLimits(undefined),
      );
    }
  });
});
