// Custo de revalidar os espaços que herdam o sistema (A-031; ADR-038, item 6; ADR-030): quando o
// administrador muda a paleta de um modo ou o nome do sistema, `revalidateInheritingSpaces` visita todo
// espaço ativo com raiz publicada (`getEffectiveAppearance` para saber se herda) e invalida o espaço
// inteiro dos que herdam (`captureSpace`, os caminhos públicos). A operação é rara (só o administrador a
// faz), mas cresce com o número de espaços e de páginas: esta é a MEDIÇÃO, que só roda com `MEDICAO=1`
// (como as do Dados e do Proxy) e imprime a tabela. O `revalidatePath` é substituído por um contador
// (medido à parte na ADR-030: 2000 chamadas em 58 ms); o que se mede aqui é o banco e o cálculo dos caminhos.
import "./env";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { revalidateInheritingSpaces } from "@/app/api/_lib/revalidation";
import { createContent, updateAppearance } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

const MEASURE = process.env.MEDICAO === "1";

/** Espaços × páginas públicas por espaço (a ADR-023 limita a 500 conteúdos por dono). */
const CASES = [
  [20, 10],
  [100, 20],
  [200, 50],
];

describe.skipIf(!MEASURE)("custo de revalidar os espaços que herdam o sistema (MEDICAO=1)", () => {
  it("tabela: espaços × páginas, a metade herda a paleta clara", async () => {
    const rows = [];
    for (const [spaces, pages] of CASES) {
      await resetDatabase();
      for (let index = 0; index < spaces; index++) {
        const user = await createTestUser({ email: `u${index}@exemplo.test`, handle: `esp-${index}` });
        for (let page = 0; page < pages; page++) {
          await createContent({ title: `p${page}`, slug: `p${page}`, type: "DOCUMENT", authorId: user.id, body: "x" });
        }
        // Metade tem paleta clara própria (não herda); a outra metade herda.
        if (index % 2 === 0) await updateAppearance(user.id, { primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" });
      }
      vi.mocked(revalidatePath).mockClear();

      const started = performance.now();
      const result = await revalidateInheritingSpaces({ units: ["lightPalette"] });
      const heirs = performance.now() - started;

      vi.mocked(revalidatePath).mockClear();
      const startedAll = performance.now();
      const all = await revalidateInheritingSpaces({ everySpace: true });
      const everyone = performance.now() - startedAll;

      expect(result.spaces).toBe(spaces / 2);
      expect(all.spaces).toBe(spaces);
      rows.push({ espacos: spaces, paginas_por_espaco: pages, herdam: result.spaces, urls_herdeiros: result.urls, ms_herdeiros: Math.round(heirs), urls_todos: all.urls, ms_todos: Math.round(everyone) });
    }
    const table = [Object.keys(rows[0]).join(" | "), ...rows.map((row) => Object.values(row).join(" | "))].join("\n");
    console.log(`\n${table}\n`);
    if (process.env.MEDICAO_RELATORIO) writeFileSync(process.env.MEDICAO_RELATORIO, `${table}\n`);
    // O tempo limite é largo: criar centenas de contas (scrypt) leva minutos.
  }, 15 * 60_000);
});
