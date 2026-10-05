// Alvo do rewrite do Proxy (A-014 Parte 3b, item 4; CT45): a página dinâmica que responde `notFound()`.
// É dinâmica de propósito (nada em cache por URL inexistente), e o seu segmento começa por sublinhado,
// que nenhum handle nem slug tem.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import NotFoundTarget, { dynamic } from "@/app/%5Fnao-encontrado/page";
import { HANDLE_PATTERN, SLUG_PATTERN } from "@/lib/validators";
import { NOT_FOUND_SEGMENT } from "@/proxy";

describe("a página-alvo do 404 (src/app/%5Fnao-encontrado)", () => {
  it("responde notFound() e é dinâmica (force-dynamic)", () => {
    expect(() => NotFoundTarget()).toThrow("NOT_FOUND");
    expect(dynamic).toBe("force-dynamic");
  });

  it("o segmento do Proxy é o da pasta, escrita com %5F, e nenhum handle nem slug pode ser igual a ele", () => {
    const folder = path.join(process.cwd(), "src", "app", "%5Fnao-encontrado");

    expect(NOT_FOUND_SEGMENT).toBe("_nao-encontrado");
    expect(existsSync(path.join(folder, "page.js"))).toBe(true);
    expect(readdirSync(path.join(process.cwd(), "src", "app"))).toContain("%5F" + NOT_FOUND_SEGMENT.slice(1));
    expect(HANDLE_PATTERN.test(NOT_FOUND_SEGMENT)).toBe(false);
    expect(SLUG_PATTERN.test(NOT_FOUND_SEGMENT)).toBe(false);
  });
});
