// Limite do corpo e orçamento de renderização na gravação, sobre a aplicação de PRODUÇÃO (A-021, ADR-033; RN25;
// CT39 ajustado; CT novo): o worker carrega no `next build` + `next start`; um texto de 64 KiB que o
// renderizador não processa em 2 s é recusado com 422 `CONTENT_TOO_COMPLEX` (em `POST`, `PATCH`, moderação e
// `PUT /api/configuration`) SEM gravar nada; o servidor segue respondendo durante a validação (`GET /login` em
// menos de 500 ms); a fila cheia responde 503 `BUSY` com `Retry-After`; o documento comum de 62 KiB é aceito.
// Contas e conteúdo FICTÍCIOS.
import { adminLogin, apiLogin, createAccount, createContent } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const ANA = { email: "ana-limite-e2e@exemplo.test", name: "Ana do Limite", handle: "limite-ana", password: "senha-ana-limite-9" };
/** Um asterisco em torre de 64 KiB: cabe na cota (65 535 bytes) e o renderizador leva mais de 40 s nele. */
const HOSTILE = `${"*".repeat(32_767)}a${"*".repeat(32_767)}`;

/** Um documento comum de ~62 KiB (aula com títulos, listas, tabelas, código e fórmulas). */
function commonDocument() {
  const paragraph = "A derivada de uma função mede a taxa de variação instantânea; em cada ponto, o limite do quociente de Newton descreve a inclinação da reta tangente, e a integral faz o caminho inverso. ";
  let text = "# Cálculo diferencial\n\n";
  for (let i = 1; Buffer.byteLength(text) < 62 * 1024; i++) {
    text += `## Seção ${i}\n\n${paragraph.repeat(3)}**Atenção:** veja o [resumo](https://exemplo.test/${i}).\n\n`;
    if (i % 4 === 0) text += `- primeiro ponto ${i}\n- segundo ponto\n  - aninhado com $a_${i}$\n\n`;
    if (i % 6 === 0) text += `| coluna | valor |\n|---|---|\n| a | ${i} |\n\n`;
    if (i % 5 === 0) text += `$$\n\\int_0^1 x^${i}\\,dx = \\frac{1}{${i + 1}}\n$$\n\n`;
  }
  return text;
}

test.describe.serial("limite do corpo e orçamento de renderização", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  let anaId = "";
  let documentId = "";

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação da conta esperar o Retry-After.
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    const account = await createAccount(playwright, admin, ANA);
    anaId = account.id;
    ana = await apiLogin(playwright, account);
    documentId = (await createContent(ana, { title: "Aula", slug: "aula", type: "DOCUMENT", body: "Texto original." })).id;
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
  });

  test("o documento comum de 62 KiB é aceito: o worker carrega no build de produção e valida (201)", async () => {
    const start = performance.now();
    const response = await ana.post("/api/contents", { data: { title: "Comum", slug: "comum", type: "DOCUMENT", body: commonDocument() } });
    const ms = performance.now() - start;
    console.log(`DIAG POST do documento comum de 62 KiB (inclui a subida do worker na 1ª vez): ${ms.toFixed(0)} ms`);

    expect(response.status()).toBe(201);
  });

  test("o texto hostil de 64 KiB: 422 CONTENT_TOO_COMPLEX, nada gravado; e o servidor SEGUE respondendo durante a validação", async ({ request }) => {
    const before = (await (await ana.get("/api/contents")).json()).data.length;

    const pending = ana.post("/api/contents", { data: { title: "Hostil", slug: "hostil", type: "DOCUMENT", body: HOSTILE } });
    await new Promise((resolve) => setTimeout(resolve, 300)); // a validação está em andamento
    const times = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      expect((await request.get("/login")).status()).toBe(200);
      times.push(performance.now() - start);
    }
    const response = await pending;

    console.log(`DIAG GET /login durante a validação: pior ${Math.max(...times).toFixed(0)} ms (as quatro: ${times.map((ms) => ms.toFixed(0)).join(", ")})`);
    expect(Math.max(...times)).toBeLessThan(500);
    expect(response.status()).toBe(422);
    const { error } = await response.json();
    expect(error).toMatchObject({
      code: "CONTENT_TOO_COMPLEX",
      message: "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.",
      details: [{ field: "body" }],
    });
    expect((await (await ana.get("/api/contents")).json()).data.length).toBe(before);
  });

  test("PATCH com o corpo hostil: 422 e o conteúdo fica como estava; a moderação também passa pelo orçamento", async () => {
    const current = (await (await ana.get(`/api/contents/${documentId}`)).json()).data;

    const own = await ana.patch(`/api/contents/${documentId}`, { data: { body: HOSTILE, version: current.updatedAt } });
    expect(own.status()).toBe(422);
    expect((await own.json()).error.code).toBe("CONTENT_TOO_COMPLEX");

    const moderated = await admin.patch(`/api/contents/${documentId}`, { data: { body: HOSTILE, version: current.updatedAt, reason: "correção" } });
    expect(moderated.status()).toBe(422);
    expect((await moderated.json()).error.code).toBe("CONTENT_TOO_COMPLEX");

    const after = (await (await ana.get(`/api/contents/${documentId}`)).json()).data;
    expect(after.body).toBe("Texto original.");
    expect(after.updatedAt).toBe(current.updatedAt);
    expect((await (await ana.get("/api/notifications")).json()).data).toEqual([]); // ninguém foi notificado
    expect(anaId).not.toBe("");
  });

  test("PUT /api/configuration com o homeBody hostil: 422 com field homeBody", async () => {
    const response = await admin.put("/api/configuration", { data: { homeBody: HOSTILE } });

    expect(response.status()).toBe(422);
    expect((await response.json()).error).toMatchObject({ code: "CONTENT_TOO_COMPLEX", details: [{ field: "homeBody" }] });
    expect((await (await admin.get("/api/configuration")).json()).data.homeBody).not.toBe(HOSTILE);
  });

  test("a edição dos outros campos segue permitida, sem validação do texto (título)", async () => {
    const response = await ana.patch(`/api/contents/${documentId}`, { data: { title: "Aula renomeada" } });

    expect(response.status()).toBe(200);
  });

  test("a fila cheia responde 503 BUSY com Retry-After, e as demais são recusadas por complexidade (nada gravado)", async () => {
    test.setTimeout(120_000);
    const before = (await (await ana.get("/api/contents")).json()).data.length;

    // Seis textos hostis ao mesmo tempo: 1 validando, 3 esperando (até 2 s cada) e 2 recusados na hora.
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => ana.post("/api/contents", { data: { title: `H${i}`, slug: `h${i}`, type: "DOCUMENT", body: HOSTILE } })),
    );

    const statuses = responses.map((response) => response.status()).sort();
    console.log(`DIAG seis POSTs hostis simultâneos: ${statuses.join(", ")}`);
    const busy = responses.filter((response) => response.status() === 503);
    expect(busy.length).toBeGreaterThanOrEqual(1);
    for (const response of busy) {
      expect(response.headers()["retry-after"]).toBe("3");
      expect((await response.json()).error.code).toBe("BUSY");
    }
    expect(statuses.filter((status) => status === 422).length).toBeGreaterThanOrEqual(3);
    expect((await (await ana.get("/api/contents")).json()).data.length).toBe(before);
  });
});
