// O Proxy dos espaços públicos sobre a aplicação de PRODUÇÃO (A-014 Parte 3b, itens 4 e 7; ADR-030, item 4;
// RN20, RN23, RNF08; CT43, CT45): as URLs que não são de um espaço ativo respondem o mesmo 404 e NÃO
// deixam arquivo em `.next/`; um handle criado em seguida funciona sem revalidar; o espaço suspenso some
// na hora, mesmo com a página em cache; e o 404 de um caminho em maiúsculas não envenena a página real
// (em sistemas de arquivos sem distinção de caixa). O `next build` não consultar o banco (CT45) é
// verificado com `DATABASE_URL` de diretório inexistente e de banco vazio (ver o pedido de merge).
import { readdirSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./support/env.js";
import { adminLogin, apiLogin, createAccount, createContent } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const NOT_FOUND_TEXT = "O endereço que você abriu não existe ou não está disponível.";

/** Quantos arquivos o servidor tem em `.next/server/app` (onde o ISR grava as páginas e os 404). */
const serverFiles = () => readdirSync(path.join(projectRoot, ".next", "server", "app"), { recursive: true }).length;

test.describe.serial("Proxy dos espaços públicos", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let owner;
  let ownerId = "";

  test.beforeAll(async ({ playwright }) => {
    admin = await adminLogin(playwright);
    const account = await createAccount(playwright, admin, {
      email: "prx-dono-e2e@exemplo.test", name: "Dono do Proxy", handle: "prx-dono", password: "senha-prx-e2e-9",
    });
    ownerId = account.id;
    owner = await apiLogin(playwright, account);
    await createContent(owner, { title: "Sobre", slug: "sobre", type: "DOCUMENT", body: "Texto do sobre do Proxy." });
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await owner?.dispose();
  });

  test("CT45: 200 URLs aleatórias respondem 404 e não deixam arquivo nenhum em .next/", async ({ request }) => {
    // Aquece o 404 dinâmico e a página real, para não contar o que nasce na primeira visita legítima.
    expect((await request.get("/prx-dono/sobre")).status()).toBe(200);
    expect((await request.get("/prx-inexistente-aquecimento")).status()).toBe(404);
    const before = serverFiles();

    for (let i = 0; i < 200; i++) {
      const random = Math.random().toString(36).slice(2, 10);
      const url = i % 3 === 0 ? `/aleatorio-${random}` : i % 3 === 1 ? `/aleatorio-${random}/pagina/${i}` : `/Aleatorio-${random}/Pagina`;
      const response = await request.get(url);
      expect(response.status(), url).toBe(404);
      // O 404 é o mesmo de qualquer caminho inexistente, e a resposta não vem do cache de ISR.
      expect(await response.text(), url).toContain(NOT_FOUND_TEXT);
      expect(response.headers()["x-nextjs-cache"], url).toBeUndefined();
    }

    const after = serverFiles();
    expect(after - before, `arquivos em .next/server/app: ${before} antes, ${after} depois`).toBe(0);
  });

  test("CT45: um handle criado logo depois funciona sem revalidar nada", async ({ request, playwright }) => {
    expect((await request.get("/prx-recem")).status()).toBe(404);

    const account = await createAccount(playwright, admin, {
      email: "prx-recem-e2e@exemplo.test", name: "Recém-chegada", handle: "prx-recem", password: "senha-recem-e2e-9",
    });
    const recem = await apiLogin(playwright, account);
    await createContent(recem, { title: "Olá", slug: "ola", type: "DOCUMENT", body: "Texto da recém-chegada." });
    await recem.dispose();

    // Na primeira visita depois da criação, sem esperar nem revalidar.
    const home = await request.get("/prx-recem");
    expect(home.status()).toBe(200);
    expect(await (await request.get("/prx-recem/ola")).text()).toContain("Texto da recém-chegada.");
  });

  test("CT43: um caminho em maiúsculas dá 404 e não envenena a página real, mesmo em sistema de arquivos sem distinção de caixa", async ({ request }) => {
    for (const path of ["/prx-dono/Sobre", "/Prx-Dono/sobre", "/PRX-DONO/SOBRE", "/prx-dono/SOBRE/"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }

    const real = await request.get("/prx-dono/sobre");
    expect(real.status()).toBe(200);
    expect(await real.text()).toContain("Texto do sobre do Proxy.");
  });

  test("CT43: o espaço suspenso some na hora, mesmo com a página em cache, e volta ao reativar", async ({ request }) => {
    // A página está em cache (a segunda visita é HIT).
    await request.get("/prx-dono/sobre");
    expect((await request.get("/prx-dono/sobre")).headers()["x-nextjs-cache"]).toBe("HIT");

    expect((await admin.post(`/api/users/${ownerId}/ban`, { data: { reason: "Teste e2e do Proxy" } })).status()).toBe(200);
    // Sem polling: o Proxy responde 404 ANTES do cache, já na primeira visita depois da suspensão.
    for (const url of ["/prx-dono/sobre", "/prx-dono"]) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(404);
      expect(await response.text(), url).toContain(NOT_FOUND_TEXT);
    }

    expect((await admin.delete(`/api/users/${ownerId}/ban`)).status()).toBe(200);
    const back = await request.get("/prx-dono/sobre");
    expect(back.status()).toBe(200);
  });

  test("o portal, a API e o login não passam pela reescrita", async ({ request }) => {
    expect((await request.get("/")).status()).toBe(200);
    expect((await request.get("/login")).status()).toBe(200);
    expect((await request.get("/api/configuration")).status()).toBe(401); // a API responde por si
    expect((await request.get("/favicon.ico")).status()).toBe(200);
  });
});
