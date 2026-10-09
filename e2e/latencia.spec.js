// Latência da revalidação (R-032, Adendo 6 do prompt do Core; Cap. 5 §5.7, "Latência observada"): MEDIÇÃO,
// só com `MEDICAO=1`. Em ciclos de despublicar e republicar o mesmo documento, mede quanto tempo o espaço
// leva para refletir a mudança depois do `PATCH` (que chama `revalidatePath`), com o `x-nextjs-cache` de cada
// leitura. Não afirma nada sobre o tempo: imprime a tabela (e a grava em `E2E_LATENCIA_RELATORIO`, se houver).
// Sem `waitForTimeout`: o intervalo entre leituras é uma espera de estado com `expect.poll`.
import { writeFileSync } from "node:fs";
import { adminLogin, cacheState, createAccount, apiLogin, createContent } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const MEASURE = process.env.MEDICAO === "1";
const CYCLES = Number(process.env.E2E_LATENCIA_CICLOS ?? 8);
const INTERVAL = Number(process.env.E2E_LATENCIA_INTERVALO ?? 100);
/** Pausa (ms) entre assentar a página e o `PATCH`: é a VARIÁVEL do experimento, não uma espera de teste. */
const SETTLE = Number(process.env.E2E_LATENCIA_ASSENTAR ?? 0);
/** Leituras simultâneas a cada sondagem (visitantes concorrentes); o status vale o da PRIMEIRA a terminar. */
const PARALLEL = Number(process.env.E2E_LATENCIA_PARALELO ?? 1);
const ANA = { email: "ana-lat-e2e@exemplo.test", name: "Ana Latência", handle: "lat-ana", password: "senha-ana-lat-9" };

test.describe.serial("latência da revalidação (MEDICAO=1)", () => {
  test.skip(!MEASURE, "medição: só com MEDICAO=1");

  test("ciclos de despublicar e republicar: tempo até o espaço refletir", async ({ playwright, request }) => {
    test.setTimeout(10 * 60_000);
    const admin = await adminLogin(playwright);
    const account = await createAccount(playwright, admin, ANA);
    const ana = await apiLogin(playwright, account);
    const doc = await createContent(ana, { title: "Medida", slug: "medida", type: "DOCUMENT", body: "corpo" });
    const page = "/lat-ana/medida";
    expect((await request.get(page)).status()).toBe(200);

    /** Lê até o status esperado; devolve o tempo, o número de leituras e a sequência de `status:cache`. */
    async function waitFor(expected) {
      const started = performance.now();
      const trail = [];
      await expect
        .poll(
          async () => {
            const responses = await Promise.all(Array.from({ length: PARALLEL }, () => request.get(page, { maxRedirects: 0 })));
            trail.push(responses.map((response) => `${response.status()}:${cacheState(response)}`).join("+"));
            return responses.every((response) => response.status() === expected) ? expected : responses[0].status();
          },
          { intervals: [INTERVAL], timeout: 60_000 },
        )
        .toBe(expected);
      return { ms: Math.round(performance.now() - started), reads: trail.length, trail: trail.join(",") };
    }

    /** Assenta a página no cache: lê até ver HIT (duas leituras seguidas), como um visitante recorrente. */
    async function settle() {
      await expect
        .poll(async () => cacheState(await request.get(page, { maxRedirects: 0 })), { intervals: [INTERVAL], timeout: 30_000 })
        .toBe("HIT");
      if (SETTLE > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE));
    }

    const rows = [];
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      await settle();
      const hide = await ana.patch(`/api/contents/${doc.id}`, { data: { status: "DRAFT" } });
      expect(hide.status()).toBe(200);
      const hidden = await waitFor(404);
      await settle();
      const show = await ana.patch(`/api/contents/${doc.id}`, { data: { status: "PUBLISHED" } });
      expect(show.status()).toBe(200);
      const shown = await waitFor(200);
      rows.push({ ciclo: cycle, despublicar_ms: hidden.ms, leituras: hidden.reads, republicar_ms: shown.ms, leituras2: shown.reads, trilha: `${hidden.trail} | ${shown.trail}` });
    }
    const table = [Object.keys(rows[0]).join(" | "), ...rows.map((row) => Object.values(row).join(" | "))].join("\n");
    console.log(`\n${table}\n`);
    if (process.env.E2E_LATENCIA_RELATORIO) writeFileSync(process.env.E2E_LATENCIA_RELATORIO, `${table}\n`);
    await ana.dispose();
    await admin.dispose();
  });
});
