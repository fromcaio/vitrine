// Notificações, sino e menu no navegador, sobre a aplicação de PRODUÇÃO (A-014 Parte 3d, itens 3 a 6; RF33,
// RF29, RN19, RN21, RN26; CT50, CT47): o administrador modera o conteúdo de um usuário (com `reason`) e o
// sino do dono mostra o contador, com o rótulo acessível; a lista traz o texto em português com o motivo
// ESCAPADO (um motivo com `<b>` e `<script>` nunca vira marcação); ler, dispensar e marcar todas derrubam o
// contador; quem tem a senha provisória vê só "Trocar a senha" e nenhum sino; o início do espaço usa o
// `SpaceHome`. Contas e conteúdo FICTÍCIOS. As sessões de navegador usam a fixture `page`, para a guarda de
// CSP de `./support/test.js` valer em todo o fluxo (um `x-forwarded-for` por sessão: o limite de login é por IP).
import { signIn, waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, createAccount, createContent, fetchUntil, nextIp } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const ANA = { email: "ana-notif-e2e@exemplo.test", name: "Ana das Notificações", handle: "notif-ana", password: "senha-ana-notif-9" };
const BETO = { email: "beto-notif-e2e@exemplo.test", name: "Beto sem Avisos", handle: "notif-beto", password: "senha-beto-notif-9" };
const TEMP = { email: "temp-notif-e2e@exemplo.test", name: "Quem Tem Senha Provisória", handle: "notif-temp" };
/** Um motivo hostil: nada disto pode virar marcação nem executar. */
const HOSTILE_REASON = "<b>negrito</b><script>window.__xss = 1</script>";

/** Sessão de navegador com IP próprio, pela fixture `page` (a guarda de CSP vale). */
async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

test.describe.serial("notificações, sino e menu", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  let temporaryPassword = "";
  const ids = { unpublished: "", removed: "", second: "" };

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(180_000);
    admin = await adminLogin(playwright);
    const ana = await createAccount(playwright, admin, ANA);
    await createAccount(playwright, admin, BETO);
    const created = await admin.post("/api/users", { data: { email: TEMP.email, name: TEMP.name, handle: TEMP.handle } });
    expect(created.status()).toBe(201);
    temporaryPassword = (await created.json()).data.temporaryPassword;

    const owner = await apiLogin(playwright, ana);
    ids.unpublished = (await createContent(owner, { title: "Aula despublicada", slug: "aula", type: "DOCUMENT", body: "Texto da aula." })).id;
    ids.second = (await createContent(owner, { title: "Outra aula", slug: "outra", type: "DOCUMENT", body: "Outro texto." })).id;
    ids.removed = (await createContent(owner, { title: "Aula removida", slug: "removida", type: "DOCUMENT", body: "Texto removido." })).id;
    await createContent(owner, { title: "Aula que fica", slug: "fica", type: "DOCUMENT", body: "Texto que fica." });
    await createContent(owner, { title: "Rascunho do dono", slug: "rascunho", type: "DOCUMENT", status: "DRAFT", body: "Segredo." });
    await owner.dispose();

    // Três moderações do administrador: duas despublicações e uma exclusão, todas com motivo.
    expect((await admin.patch(`/api/contents/${ids.unpublished}`, { data: { status: "DRAFT", reason: HOSTILE_REASON } })).status()).toBe(200);
    expect((await admin.patch(`/api/contents/${ids.second}`, { data: { status: "DRAFT", reason: "texto repetido" } })).status()).toBe(200);
    expect((await admin.delete(`/api/contents/${ids.removed}?reason=plagio`)).status()).toBe(204);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("o sino do dono mostra o contador e o rótulo acessível; o menu por papel só liga as páginas que existem (CT50)", async ({ page }) => {
    await login(page, ANA);

    await expect(page.getByRole("button", { name: "Notificações, 3 não lidas" })).toBeVisible();
    // O menu lateral (o do celular é o mesmo, recolhido): todas as páginas do usuário comum já existem (Aparência, Notificações, Conteúdo, Perfil e a troca da senha são links), e nada fica "em breve".
    const menu = page.locator('nav[aria-label="Navegação do painel"]:visible');
    await expect(menu.getByRole("link", { name: "Aparência" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Notificações" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Trocar a senha" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Conteúdo" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Perfil" })).toBeVisible();
    await expect(menu.getByText("em breve")).toHaveCount(0);
    // Só o administrador tem as Configurações e os Usuários.
    await expect(menu.getByText("Configurações")).toHaveCount(0);
    await expect(menu.getByText("Usuários")).toHaveCount(0);
  });

  test("a lista: texto em português com o motivo ESCAPADO; ler, dispensar e marcar todas derrubam o contador (CT50, CT47)", async ({ page }) => {
    await login(page, ANA);
    await page.getByRole("button", { name: "Notificações, 3 não lidas" }).click();
    await page.getByRole("link", { name: "Ver todas" }).click();
    await expect(page).toHaveURL(/\/admin\/notificacoes$/);
    // Sem a hidratação da lista, o clique não faz nada: o React 19 grava `__reactProps$…` nos elementos que controla.
    await page.waitForFunction(() => {
      const section = document.querySelector('section[aria-label="Notificações"]');
      return !!section && Object.keys(section).some((key) => key.startsWith("__reactProps$"));
    });

    await expect(page.getByRole("heading", { name: "Notificações", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const list = page.getByRole("region", { name: "Notificações" });
    await expect(list.getByText("3 não lidas.")).toBeVisible();

    // O motivo hostil aparece como TEXTO, com os sinais de menor e maior, e nada vira marcação nem executa.
    await expect(list.getByText("Motivo: <b>negrito</b><script>window.__xss = 1</script>", { exact: false })).toBeVisible();
    await expect(list.locator("b, script")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
    await expect(list.getByText("Um administrador despublicou", { exact: false }).first()).toBeVisible();
    await expect(list.getByText("Um administrador excluiu", { exact: false })).toBeVisible();

    // Marcar uma como lida: o contador da lista e o do sino caem para 2.
    await list.getByRole("button", { name: "Marcar como lida: Conteúdo despublicado" }).first().click();
    await expect(page.getByRole("button", { name: "Notificações, 2 não lidas" })).toBeVisible();
    await expect(list.getByText("2 não lidas.")).toBeVisible();

    // Dispensar a exclusão (não lida): sai da lista e o contador cai para 1.
    await list.getByRole("button", { name: "Dispensar: Conteúdo excluído" }).click();
    await expect(list.getByText("Um administrador excluiu", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Notificações, 1 não lida" })).toBeVisible();

    // Marcar todas: zero, no sino e na lista.
    await list.getByRole("button", { name: "Marcar todas como lidas" }).click();
    await expect(page.getByRole("button", { name: "Notificações, nenhuma não lida" })).toBeVisible();
    await expect(list.getByText("Nenhuma não lida.")).toBeVisible();
    await expect(list.getByRole("button", { name: "Marcar todas como lidas" })).toBeDisabled();

    // O servidor guardou: ao recarregar, o contador inicial (lido no servidor) e a lista seguem assim.
    await page.reload();
    await expect(page.getByRole("button", { name: "Notificações, nenhuma não lida" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Notificações" }).getByText("Nenhuma não lida.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Notificações" }).getByText("Um administrador despublicou", { exact: false })).toHaveCount(2);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });

  test("/admin/notificacoes não registra erro nem aviso no console, nem o de preload da folha do KaTeX (A-014 3d, item 4)", async ({ page }) => {
    // O Chromium avisa "preloaded using link preload but not used" só alguns segundos depois do carregamento:
    // a UI o viu na página de ensaio dela; aqui, na página real, sobre o build de produção.
    /** @type {string[]} */
    const messages = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
    await login(page, ANA);

    await page.goto("/admin/notificacoes");
    await expect(page.getByRole("heading", { name: "Notificações", level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(6000);

    expect(messages).toEqual([]);
    expect(await page.locator('link[rel="preload"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/katex/i)]),
    );
  });

  test("só as notificações do próprio usuário (RN19): outro usuário abre a página e vê a dele, vazia", async ({ page }) => {
    await login(page, BETO);

    await expect(page.getByRole("button", { name: "Notificações, nenhuma não lida" })).toBeVisible();
    await page.goto("/admin/notificacoes?userId=qualquer&user=notif-ana");
    await expect(page.getByText("Nenhuma notificação.", { exact: true })).toBeVisible();
    await expect(page.getByText("Um administrador", { exact: false })).toHaveCount(0);
  });

  test("com a senha provisória: só \"Trocar a senha\", sem sino, e a página de notificações leva à troca (RN21)", async ({ page }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByLabel("E-mail").fill(TEMP.email);
    await page.getByLabel("Senha").fill(temporaryPassword);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin$/);
    await expect(page.getByRole("link", { name: /^Notificações/ })).toHaveCount(0);
    const menu = page.locator('nav[aria-label="Navegação do painel"]:visible');
    await expect(menu.getByRole("link")).toHaveCount(1);
    await expect(menu.getByRole("link", { name: "Trocar a senha" })).toBeVisible();
    await expect(menu.getByText("em breve")).toHaveCount(0);

    await page.goto("/admin/notificacoes");
    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin%2Fnotificacoes$/);
  });

  test("o início do espaço usa o SpaceHome: só os itens publicados da raiz, e o estado vazio (RF29, RN15)", async ({ request }) => {
    // O início de `notif-ana` é regenerado quando a moderação despublica e exclui (a visita seguinte o refaz).
    const { body: home } = await fetchUntil(request, "/notif-ana", (html) =>
      ["Aula despublicada", "Outra aula", "Aula removida"].every((title) => !html.includes(title)),
    );

    // O espaço sem nome próprio herda o nome do sistema (ADR-038, item 8).
    expect(home).toContain((await (await admin.get("/api/configuration")).json()).data.siteName);
    expect(home).toContain('href="/notif-ana/fica"');
    expect(home).toContain("Aula que fica");
    expect(home).toContain("Documento");
    for (const hidden of ["Rascunho do dono", "Aula despublicada", "Outra aula", "Aula removida"]) expect(home, hidden).not.toContain(hidden);

    const empty = await (await request.get("/notif-beto")).text();
    expect(empty).toContain("Este espaço ainda não tem conteúdo publicado.");
  });
});
