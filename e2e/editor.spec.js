// Páginas do editor sobre a aplicação de PRODUÇÃO (A-014 Parte 3a, item 7; P-012, R-007; RN18, RN19;
// CT19/CT20 do editor, CT53): criar e editar um documento pelo navegador, o conflito de versão com
// DUAS sessões do mesmo dono (409, os dois textos, a escolha de qual enviar) e a recusa a quem não é o
// dono (404). Contas e conteúdo FICTÍCIOS; o administrador de teste é o de `npm run admin:create`.
import { signIn } from "./support/auth.js";
import { ADMIN, e2eEnvironment } from "./support/env.js";
import { expect, newGuardedContext, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();
const OWNER = { email: "dona-editor-e2e@exemplo.test", name: "Dona do Editor", handle: "dona-editor-e2e", password: "senha-dona-e2e-9" };
const OTHER = { email: "outro-editor-e2e@exemplo.test", name: "Outro Autor", handle: "outro-editor-e2e", password: "senha-outro-e2e-9" };

// O limite de tentativas de login do better-auth é por IP (5 por minuto); cada login deste arquivo usa
// um IP próprio, para não competir com os demais specs.
let ipCounter = 0;
const nextIp = () => `10.40.50.${++ipCounter}`;

/** Contexto de requisições com o próprio jar de cookies, já autenticado. */
async function apiLogin(playwright, credentials) {
  const context = await playwright.request.newContext({ baseURL });
  const response = await context.post("/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": nextIp() },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status()).toBe(200);
  return context;
}

/** Cria a conta pelo administrador e troca a senha provisória: devolve o identificador. */
async function createAccount(playwright, admin, account) {
  const created = await admin.post("/api/users", { data: { email: account.email, name: account.name, handle: account.handle } });
  expect(created.status()).toBe(201);
  const { data } = await created.json();
  const context = await apiLogin(playwright, { email: account.email, password: data.temporaryPassword });
  const changed = await context.post("/api/users/me/password", { data: { current: data.temporaryPassword, next: account.password } });
  expect(changed.status()).toBe(200);
  await context.dispose();
  return data.id;
}

/**
 * Entra pelo formulário em uma página nova de um contexto novo do navegador (uma sessão própria), com um
 * IP próprio (o limite de login do better-auth é por IP: sem isso, os logins deste arquivo esgotariam o
 * limite do IP local e derrubariam os demais specs).
 * @param {import("@playwright/test").Browser} browser
 */
async function openSession(browser, credentials) {
  const context = await newGuardedContext(browser, { baseURL, locale: "pt-BR", extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
  const page = await context.newPage();
  await signIn(page, credentials);
  return { context, page };
}

/** Espera o editor (carregado só no navegador, `ssr: false`) e devolve os campos principais. */
async function editorOf(page) {
  const title = page.getByLabel("Título", { exact: true });
  await expect(title).toBeVisible();
  return {
    title,
    slug: page.getByLabel("Endereço (slug)"),
    body: page.getByRole("textbox", { name: "Texto do documento (Markdown)" }),
    send: page.getByRole("button", { name: "Enviar nova versão" }),
  };
}

test.describe.serial("editor de conteúdo", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let owner;
  let collectionId = "";
  let documentId = "";

  test.beforeAll(async ({ playwright }) => {
    admin = await apiLogin(playwright, ADMIN);
    await createAccount(playwright, admin, OWNER);
    await createAccount(playwright, admin, OTHER);
    owner = await apiLogin(playwright, OWNER);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await owner?.dispose();
  });

  test("sem sessão, o editor leva ao login e volta ao destino, com ?pai=", async ({ page }) => {
    await page.goto("/admin/conteudo/novo?pai=abc");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fadmin%2Fconteudo%2Fnovo%3Fpai%3Dabc$/);
  });

  test("a dona cria um documento dentro de uma coleção sua, e a URL passa a ser a de edição (CT20)", async ({ browser }) => {
    const collection = await owner.post("/api/contents", { data: { title: "Pasta e2e", slug: "pasta-e2e", type: "COLLECTION" } });
    expect(collection.status()).toBe(201);
    collectionId = (await collection.json()).data.id;

    const { context, page } = await openSession(browser, OWNER);
    await page.goto(`/admin/conteudo/novo?pai=${collectionId}`);
    await expect(page.getByRole("heading", { name: "Novo conteúdo", level: 1 })).toBeVisible();
    const editor = await editorOf(page);

    await editor.title.fill("Documento do editor e2e");
    await expect(editor.slug).toHaveValue("documento-do-editor-e2e");
    await editor.body.fill("# Primeira versão\n\nTexto inicial com $x^2$.");
    await editor.send.click();

    await expect(page.getByRole("status").filter({ hasText: "Nova versão enviada" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/conteudo\/[^/?]+$/);
    documentId = new URL(page.url()).pathname.split("/").pop();

    const stored = (await (await owner.get(`/api/contents/${documentId}`)).json()).data;
    expect(stored).toMatchObject({
      title: "Documento do editor e2e",
      slug: "documento-do-editor-e2e",
      parentId: collectionId,
      status: "PUBLISHED",
      body: "# Primeira versão\n\nTexto inicial com $x^2$.",
    });
    await context.close();
  });

  test("recarregar a página de edição abre o conteúdo, com o texto do servidor, e editar o atualiza", async ({ browser }) => {
    const { context, page } = await openSession(browser, OWNER);
    await page.goto(`/admin/conteudo/${documentId}`);
    await expect(page.getByRole("heading", { name: "Editar conteúdo", level: 1 })).toBeVisible();
    const editor = await editorOf(page);
    await expect(editor.title).toHaveValue("Documento do editor e2e");
    await expect(editor.body).toHaveValue(/Primeira versão/);

    await editor.body.fill("# Segunda versão");
    await editor.send.click();
    await expect(page.getByRole("status").filter({ hasText: "Nova versão enviada" })).toBeVisible();

    expect((await (await owner.get(`/api/contents/${documentId}`)).json()).data.body).toBe("# Segunda versão");
    await context.close();
  });

  test("duas sessões do mesmo dono: a segunda a enviar recebe o conflito de versão e escolhe qual texto vale (RN18, CT53)", async ({ browser }) => {
    const first = await openSession(browser, OWNER);
    const second = await openSession(browser, OWNER);
    await first.page.goto(`/admin/conteudo/${documentId}`);
    await second.page.goto(`/admin/conteudo/${documentId}`);
    const a = await editorOf(first.page);
    const b = await editorOf(second.page);
    await expect(a.body).toHaveValue("# Segunda versão");
    await expect(b.body).toHaveValue("# Segunda versão");

    // A primeira sessão envia: a versão do servidor muda.
    await a.body.fill("Texto da primeira sessão");
    await a.send.click();
    await expect(first.page.getByRole("status").filter({ hasText: "Nova versão enviada" })).toBeVisible();

    // A segunda ainda tem a versão antiga: o envio é recusado, com os dois textos à vista.
    await b.body.fill("Texto da segunda sessão");
    await b.send.click();
    await expect(second.page.getByRole("heading", { name: "Este conteúdo mudou no servidor" })).toBeVisible();
    await expect(second.page.getByLabel("Texto: Versão do servidor")).toHaveText("Texto da primeira sessão");
    await expect(second.page.getByLabel("Texto: O seu texto")).toHaveText("Texto da segunda sessão");
    // Nada foi enviado: o servidor continua com o texto da primeira sessão.
    expect((await (await owner.get(`/api/contents/${documentId}`)).json()).data.body).toBe("Texto da primeira sessão");

    // A segunda sessão escolhe sobrescrever com o seu texto.
    await second.page.getByRole("button", { name: "Enviar o meu texto e substituir o do servidor" }).click();
    await expect(second.page.getByRole("status").filter({ hasText: "Nova versão enviada" })).toBeVisible();
    expect((await (await owner.get(`/api/contents/${documentId}`)).json()).data.body).toBe("Texto da segunda sessão");

    await first.context.close();
    await second.context.close();
  });

  test("o conflito também deixa ficar com o texto do servidor, sem enviar nada", async ({ browser }) => {
    const first = await openSession(browser, OWNER);
    const second = await openSession(browser, OWNER);
    await first.page.goto(`/admin/conteudo/${documentId}`);
    await second.page.goto(`/admin/conteudo/${documentId}`);
    const a = await editorOf(first.page);
    const b = await editorOf(second.page);

    await a.body.fill("Texto vencedor");
    await a.send.click();
    await expect(first.page.getByRole("status").filter({ hasText: "Nova versão enviada" })).toBeVisible();

    await b.body.fill("Texto descartado");
    await b.send.click();
    await expect(second.page.getByRole("heading", { name: "Este conteúdo mudou no servidor" })).toBeVisible();
    await second.page.getByRole("button", { name: "Ficar com o texto do servidor" }).click();

    await expect(b.body).toHaveValue("Texto vencedor");
    expect((await (await owner.get(`/api/contents/${documentId}`)).json()).data.body).toBe("Texto vencedor");

    await first.context.close();
    await second.context.close();
  });

  test("quem não é o dono recebe 404 no documento e em ?pai=, e o administrador também (RN19)", async ({ browser }) => {
    for (const credentials of [OTHER, ADMIN]) {
      const { context, page } = await openSession(browser, credentials);

      for (const path of [`/admin/conteudo/${documentId}`, `/admin/conteudo/novo?pai=${collectionId}`]) {
        const response = await page.goto(path);
        expect(response?.status(), `${credentials.email} em ${path}`).toBe(404);
        await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
      }
      await context.close();
    }
  });

  test("?pai= que não é uma coleção da dona responde 404 também para ela (documento e inexistente)", async ({ browser }) => {
    const { context, page } = await openSession(browser, OWNER);

    for (const pai of [documentId, "nao-existe"]) {
      const response = await page.goto(`/admin/conteudo/novo?pai=${pai}`);
      expect(response?.status(), `pai=${pai}`).toBe(404);
    }
    // E a coleção dela abre o editor, com a página nova.
    const ok = await page.goto(`/admin/conteudo/novo?pai=${collectionId}`);
    expect(ok?.status()).toBe(200);
    await editorOf(page);
    await context.close();
  });
});
