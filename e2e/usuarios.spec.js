// Usuários e moderação no navegador, sobre a aplicação de PRODUÇÃO (A-014 Parte 3e-2; RF27, RF34; RN18 a RN26;
// UC13, UC15; CT51, CT52, CT55): (a) criar usuário (a senha provisória aparece UMA vez, funciona no login e não
// volta ao recarregar); (b) suspender (o suspenso não entra; o motivo aparece no login) e reativar; (c) excluir
// com transferir e com apagar; (d) a própria conta e o último administrador; (e) moderar a árvore de outro
// usuário (despublicar e excluir com motivo; o dono recebe a notificação com o motivo, ESCAPADO); (f) editar o
// conteúdo alheio no editor (motivo + version; um conflito de versão); (g) no editor, um texto hostil recebe a
// mensagem exata de "complexo demais" junto do campo, sem perder o texto (a UI declarou no M-033 que não
// exercitou isto contra o servidor real); (h) o usuário comum recebe 404 nas páginas novas. Contas e conteúdo
// FICTÍCIOS. As sessões usam a fixture `page`, então a guarda de CSP vale em todo o fluxo.
import { signIn, waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, createAccount, createAdminAccount, createContent, nextIp, removeAccount } from "./support/accounts.js";
import { ADMIN } from "./support/env.js";
import { expect, test } from "./support/test.js";

const mk = (slug, name) => ({ email: `${slug}-usr-e2e@exemplo.test`, name, handle: `usr-${slug}`, password: `senha-${slug}-usr-9` });
const ANA = mk("ana", "Ana Moderada");
const BETO = mk("beto", "Beto Editado");
const SUSP = mk("susp", "Susp do Teste");
const V1 = mk("v1", "Vítima Transferida");
const V2 = mk("v2", "Vítima Apagada");
/** O segundo administrador, só da interface (teste "(0)"): ver o comentário dele. */
const ADMIN_UI = { email: "admin-ui-usr-e2e@exemplo.test", name: "Administrador da Interface", password: "senha-admin-ui-usr-9" };
const NOVO = { email: "novo-usr-e2e@exemplo.test", name: "Novo pela Interface", handle: "usr-novo" };

/** O motivo de moderação com marcação: nada disto pode virar HTML nem executar. */
const HOSTILE_REASON = "<b>negrito</b><script>window.__xss = 1</script>";
/** A mensagem exata do servidor para um texto que não renderiza no orçamento (ADR-033). */
const TOO_COMPLEX = "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.";
/** 12 KB de imagens abertas aninhadas: o renderizador leva 5 s nele (mais do que os 2 s do orçamento). */
const HOSTILE_TEXT = `${"![".repeat(2000)}a${"](x)".repeat(2000)}`;

/** Sessão de navegador com IP próprio, pela fixture `page` (a guarda de CSP vale). */
async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

/** Espera o React ligar a lista de usuários (o clique antes disso não faz nada). */
async function usersReady(page) {
  await expect(page.getByRole("region", { name: "Usuários" })).toBeVisible();
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-label="Usuários"]');
    return !!section && Object.keys(section).some((key) => key.startsWith("__reactProps$"));
  });
}

/** Busca o usuário pelo e-mail (a lista tem 50 por página) e devolve o grupo de ações do cartão dele. */
async function findUser(page, user) {
  await page.getByLabel("Buscar por e-mail ou nome").fill(user.email);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const actions = page.getByRole("group", { name: `Ações de ${user.name}` });
  await expect(actions).toBeVisible();
  return actions;
}

test.describe.serial("usuários e moderação", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {Record<string, any>} */
  const accounts = {};
  /** @type {Record<string, import("@playwright/test").APIRequestContext>} */
  const api = {};
  const ids = { aula: "", rascunho: "", colecao: "", docBeto: "" };
  /** @type {{ id: string, email: string, password: string }} */
  let adminUi;

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(240_000);
    admin = await adminLogin(playwright);
    for (const [key, spec] of Object.entries({ ana: ANA, beto: BETO, susp: SUSP, v1: V1, v2: V2 })) {
      accounts[key] = await createAccount(playwright, admin, spec);
    }
    for (const key of ["ana", "beto", "v1", "v2"]) api[key] = await apiLogin(playwright, accounts[key]);

    ids.aula = (await createContent(api.ana, { title: "Aula da Ana", slug: "aula", type: "DOCUMENT", body: "Texto da aula." })).id;
    ids.rascunho = (await createContent(api.ana, { title: "Rascunho da Ana", slug: "rascunho", type: "DOCUMENT", status: "DRAFT", body: "Texto." })).id;
    ids.colecao = (await createContent(api.ana, { title: "Coleção da Ana", slug: "colecao", type: "COLLECTION" })).id;
    await createContent(api.ana, { title: "Dentro da coleção", slug: "dentro", type: "DOCUMENT", parentId: ids.colecao, body: "Dentro." });
    ids.docBeto = (await createContent(api.beto, { title: "Documento do Beto", slug: "doc-beto", type: "DOCUMENT", body: "Texto do Beto." })).id;
    await createContent(api.v1, { title: "Aula da V1", slug: "v1-aula", type: "DOCUMENT", body: "Da V1." });
    await createContent(api.v1, { title: "Outra da V1", slug: "v1-outra", type: "DOCUMENT", body: "Da V1, outra." });
    await createContent(api.v2, { title: "Aula da V2", slug: "v2-aula", type: "DOCUMENT", body: "Da V2." });
  });

  test.afterAll(async () => {
    // O segundo administrador sai: os testes dos outros specs supõem um só (o último administrador).
    if (adminUi) await removeAccount(admin, adminUi.id);
    await admin?.dispose();
    for (const context of Object.values(api)) await context.dispose();
  });

  test("(d) a própria conta e o último administrador: nada de suspender, excluir ou rebaixar a si mesmo", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    const mine = await findUser(page, { email: ADMIN.email, name: ADMIN.name });

    await expect(mine.getByRole("button", { name: `Suspender: ${ADMIN.name}` })).toBeDisabled();
    await expect(mine.getByRole("button", { name: `Excluir: ${ADMIN.name}` })).toBeDisabled();
    await mine.getByRole("button", { name: `Editar: ${ADMIN.name}` }).click();
    await expect(page.getByLabel("Papel")).toBeDisabled(); // o único administrador ativo não é rebaixado
    await expect(page.getByText("É o último administrador ativo", { exact: false }).first()).toBeVisible();

    // O servidor decide o mesmo, pela API.
    const meId = (await (await admin.get("/api/users/me")).json()).data.id;
    expect((await admin.post(`/api/users/${meId}/ban`, { data: { reason: "x" } })).status()).toBe(403);
    expect((await admin.delete(`/api/users/${meId}`)).status()).toBe(403);
    const demote = await admin.patch(`/api/users/${meId}`, { data: { role: "user" } });
    expect([403, 409]).toContain(demote.status());
    expect((await demote.json()).error.code).toMatch(/LAST_ADMIN|FORBIDDEN/);
  });

  test("(0) um segundo administrador, só para as sessões de navegador que escrevem em /api/users", async ({ playwright }) => {
    // O limite de escritas de /api/users (RN25) é por usuário, e os specs anteriores, em série, gastaram o do administrador
    // único: a requisição da interface que cai com a janela cheia responde 429 e o diálogo fica aberto (a causa da oscilação
    // deste spec, medida no traço: `DELETE /api/users/:id 429`). Criado DEPOIS do teste (d), que supõe um só administrador.
    adminUi = await createAdminAccount(playwright, admin, ADMIN_UI);
    expect(adminUi.id).toBeTruthy();
  });

  test("(a) criar usuário: a senha provisória aparece UMA vez, funciona no login e não volta ao recarregar", async ({ page, playwright }) => {
    await login(page, ADMIN_UI);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    await expect(page.getByRole("heading", { name: "Usuários", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await page.getByRole("button", { name: "Novo usuário" }).click();
    await page.getByLabel("E-mail", { exact: true }).fill(NOVO.email);
    await page.getByLabel("Nome de exibição").fill(NOVO.name);
    await page.getByLabel("Handle (o endereço do espaço público)").fill(NOVO.handle);
    await page.getByRole("button", { name: "Criar usuário" }).click();

    const panel = page.locator('section[aria-labelledby="senha-provisoria-titulo"]');
    await expect(panel.getByRole("heading", { name: new RegExp(`Conta criada: senha provisória de ${NOVO.email}`) })).toBeVisible();
    const password = (await panel.locator("code").textContent()) ?? "";
    expect(password).toHaveLength(16);
    // A senha funciona no login (a conta nasce com a troca obrigatória).
    await (await apiLogin(playwright, { email: NOVO.email, password })).dispose();

    // Fechar: some, e não fica em lugar nenhum (nem no DOM, nem nos armazenamentos, nem na URL).
    await panel.getByRole("button", { name: "Já anotei a senha, fechar" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByText(password)).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))).not.toContain(password);
    expect(page.url()).not.toContain(password);
    await page.reload();
    await usersReady(page);
    expect(await page.content()).not.toContain(password);
    // O usuário novo está na lista.
    await findUser(page, { ...NOVO, name: NOVO.name });
  });

  test("(b) suspender com o motivo: o motivo é obrigatório e o cartão mostra a suspensão", async ({ page }) => {
    await login(page, ADMIN_UI);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    const card = await findUser(page, SUSP);

    await card.getByRole("button", { name: `Suspender: ${SUSP.name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Suspender ${SUSP.name}` });
    await dialog.getByRole("button", { name: "Suspender" }).click(); // sem o motivo: recusado, o diálogo segue aberto
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Motivo").fill("Violou as regras do espaço");
    await dialog.getByRole("button", { name: "Suspender" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText("Motivo: Violou as regras do espaço")).toBeVisible();
    await expect(page.locator('[data-state="suspended"]').first()).toBeVisible();
  });

  test("(b) o suspenso não entra, e o login mostra o motivo", async ({ page }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByLabel("E-mail").fill(SUSP.email);
    await page.getByLabel("Senha").fill(SUSP.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Violou as regras do espaço", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("(b) reativar: o usuário volta a entrar", async ({ page, playwright }) => {
    await login(page, ADMIN_UI);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    const card = await findUser(page, SUSP);

    await card.getByRole("button", { name: `Reativar: ${SUSP.name}` }).click();
    await page.getByRole("alertdialog", { name: `Reativar ${SUSP.name}?` }).or(page.getByRole("dialog", { name: `Reativar ${SUSP.name}?` })).getByRole("button", { name: "Reativar" }).click();

    await expect(page.getByText("Motivo: Violou as regras do espaço")).toHaveCount(0);
    await (await apiLogin(playwright, accounts.susp)).dispose(); // volta a entrar (200)
  });

  test("(c) excluir com TRANSFERIR: o conteúdo vai para o destino e a conta some", async ({ page }) => {
    await login(page, ADMIN_UI);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    const card = await findUser(page, V1);

    await card.getByRole("button", { name: `Excluir: ${V1.name}` }).click();
    await page.getByRole("alertdialog", { name: `Excluir ${V1.name}?` }).getByRole("button", { name: "Excluir" }).click();
    const choose = page.getByRole("alertdialog", { name: `O que fazer com o conteúdo de ${V1.name}?` });
    await choose.getByLabel("Transferir o conteúdo para outro usuário").check();
    await choose.getByLabel("Usuário de destino").selectOption({ label: `${BETO.name} (${BETO.email})` });
    await choose.getByRole("button", { name: "Excluir a conta" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("group", { name: `Ações de ${V1.name}` })).toHaveCount(0);
    expect((await admin.get(`/api/users/${accounts.v1.id}`)).status()).toBe(404);
    const betoTree = (await (await admin.get(`/api/contents?ownerId=${accounts.beto.id}`)).json()).data.map((node) => node.title);
    expect(betoTree).toEqual(expect.arrayContaining(["Documento do Beto", "Aula da V1", "Outra da V1"]));
  });

  test("(c) excluir com APAGAR: pede o e-mail da conta, e o conteúdo some junto", async ({ page }) => {
    await login(page, ADMIN_UI);
    await page.goto("/admin/usuarios");
    await usersReady(page);
    const card = await findUser(page, V2);
    const v2Content = (await (await admin.get(`/api/contents?ownerId=${accounts.v2.id}`)).json()).data[0].id;

    await card.getByRole("button", { name: `Excluir: ${V2.name}` }).click();
    await page.getByRole("alertdialog", { name: `Excluir ${V2.name}?` }).getByRole("button", { name: "Excluir" }).click();
    const choose = page.getByRole("alertdialog", { name: `O que fazer com o conteúdo de ${V2.name}?` });
    await choose.getByLabel("Excluir o conteúdo junto com a conta").check();
    await choose.getByLabel(`Para confirmar, digite o e-mail da conta: ${V2.email}`).fill("outro@exemplo.test");
    await choose.getByRole("button", { name: "Excluir a conta" }).click();
    await expect(choose).toBeVisible(); // o e-mail errado bloqueia
    expect((await admin.get(`/api/users/${accounts.v2.id}`)).status()).toBe(200);

    await choose.getByLabel(`Para confirmar, digite o e-mail da conta: ${V2.email}`).fill(V2.email);
    await choose.getByRole("button", { name: "Excluir a conta" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await admin.get(`/api/users/${accounts.v2.id}`)).status()).toBe(404);
    expect((await admin.get(`/api/contents/${v2Content}`)).status()).toBe(404);
  });

  test("(e) moderar a árvore de outro usuário: despublicar e excluir com o motivo; o motivo é obrigatório", async ({ page }) => {
    await login(page, ADMIN_UI);
    await page.goto(`/admin/usuarios/${accounts.ana.id}/conteudo`);

    await expect(page.getByRole("heading", { name: `Conteúdo de ${ANA.name}`, level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const tree = page.getByRole("region", { name: `Conteúdo de ${ANA.name}` });
    await page.waitForFunction(() => {
      const section = document.querySelector('section[aria-label^="Conteúdo de"]');
      return !!section && Object.keys(section).some((key) => key.startsWith("__reactProps$"));
    });
    // A árvore é a dela, com os rascunhos; nada do Beto.
    for (const title of ["Aula da Ana", "Rascunho da Ana", "Coleção da Ana"]) await expect(tree.getByText(title).first()).toBeVisible();
    await expect(page.getByText("Documento do Beto")).toHaveCount(0);

    // Despublicar: o motivo vazio é recusado e nada muda.
    await tree.getByRole("button", { name: "Despublicar: Aula da Ana" }).click();
    const unpublish = page.getByRole("dialog", { name: 'Despublicar o documento "Aula da Ana"?' });
    await unpublish.getByRole("button", { name: "Despublicar" }).click();
    await expect(unpublish).toBeVisible();
    expect((await (await api.ana.get(`/api/contents/${ids.aula}`)).json()).data.status).toBe("PUBLISHED");
    await unpublish.getByLabel("Motivo").fill(HOSTILE_REASON);
    await unpublish.getByRole("button", { name: "Despublicar" }).click();
    await expect(page.getByText("foi notificado(a) e vê o motivo", { exact: false }).first()).toBeVisible();
    expect((await (await api.ana.get(`/api/contents/${ids.aula}`)).json()).data.status).toBe("DRAFT");

    // Excluir a coleção com o motivo.
    await tree.getByRole("button", { name: "Excluir: Coleção da Ana" }).click();
    const remove = page.getByRole("alertdialog", { name: 'Excluir a coleção "Coleção da Ana"?' }).or(page.getByRole("dialog", { name: 'Excluir a coleção "Coleção da Ana"?' }));
    await expect(remove).toContainText("1 item que está dentro será excluído junto");
    await remove.getByLabel("Motivo").fill("excluída por duplicidade");
    await remove.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("navigation", { name: "Árvore de conteúdo" }).getByText("Coleção da Ana")).toHaveCount(0);
    expect((await api.ana.get(`/api/contents/${ids.colecao}`)).status()).toBe(404);
  });

  test("(e) o dono recebe as notificações com o motivo, ESCAPADO (nunca vira marcação)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/notificacoes");

    await expect(page.getByRole("button", { name: "Notificações, 2 não lidas" })).toBeVisible();
    const list = page.getByRole("region", { name: "Notificações" });
    await expect(list.getByText(`Motivo: ${HOSTILE_REASON}`, { exact: false })).toBeVisible();
    await expect(list.getByText("Motivo: excluída por duplicidade", { exact: false })).toBeVisible();
    await expect(list.locator("b, script")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });

  test("(f) editar o conteúdo alheio no editor: motivo + version, e o conflito de versão escolhe qual texto vale", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, ADMIN_UI);
    await page.goto(`/admin/usuarios/${accounts.beto.id}/conteudo/${ids.docBeto}`);

    await expect(page.getByRole("heading", { name: `Moderar documento de ${BETO.name}`, level: 1 })).toBeVisible();
    await expect(page.getByText(`Você está editando o conteúdo de ${BETO.name}`, { exact: false })).toBeVisible();
    const body = page.getByLabel("Texto do documento (Markdown)");
    await expect(body).toHaveValue("Texto do Beto.");
    const send = async (reason) => {
      await page.getByRole("button", { name: "Enviar nova versão" }).click();
      const dialog = page.getByRole("dialog", { name: `Enviar a nova versão do conteúdo de ${BETO.name}` });
      await dialog.getByLabel("Motivo").fill(reason);
      await dialog.getByRole("button", { name: "Enviar" }).click();
    };

    // 1. Envio normal: o corpo muda e o Beto é notificado com o motivo.
    await body.fill("Texto corrigido pela moderação.");
    await send("correção factual");
    await expect.poll(async () => (await (await api.beto.get(`/api/contents/${ids.docBeto}`)).json()).data.body).toBe("Texto corrigido pela moderação.");
    const notices = (await (await api.beto.get("/api/notifications")).json()).data;
    expect(notices.map((notice) => notice.text).join("\n")).toContain("Motivo: correção factual");

    // 2. O Beto edita depois: o envio seguinte do administrador é um conflito de versão (409).
    const current = (await (await api.beto.get(`/api/contents/${ids.docBeto}`)).json()).data;
    expect((await api.beto.patch(`/api/contents/${ids.docBeto}`, { data: { body: "O Beto mudou de novo.", version: current.updatedAt } })).status()).toBe(200);
    await body.fill("Segundo texto do administrador.");
    await send("segunda correção");
    await expect(page.getByRole("heading", { name: "Este conteúdo mudou no servidor" })).toBeVisible();
    await expect(page.getByText("O Beto mudou de novo.", { exact: false }).first()).toBeVisible(); // a versão do servidor
    expect((await (await api.beto.get(`/api/contents/${ids.docBeto}`)).json()).data.body).toBe("O Beto mudou de novo."); // nada foi enviado

    // 3. O administrador escolhe o texto dele: o motivo é o mesmo, sem pedir de novo.
    await page.getByRole("button", { name: "Enviar o meu texto e substituir o do servidor" }).click();
    await expect.poll(async () => (await (await api.beto.get(`/api/contents/${ids.docBeto}`)).json()).data.body).toBe("Segundo texto do administrador.");
  });

  test("(g) no editor, um texto hostil recebe a mensagem EXATA de \"complexo demais\" junto do campo, sem perder o texto", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, ANA);
    await page.goto("/admin/conteudo/novo");
    await page.getByLabel("Título", { exact: true }).fill("Texto hostil");
    const body = page.getByLabel("Texto do documento (Markdown)");

    await body.fill(HOSTILE_TEXT); // a pré-visualização do navegador também leva alguns segundos
    await page.getByRole("button", { name: "Enviar nova versão" }).click();

    // A mensagem aparece JUNTO do campo do texto (a região de edição) e fica ligada a ele (`aria-describedby`).
    // O alerta do campo traz o prefixo "Erro: " (para quem usa leitor de tela) e a mensagem do servidor, SEM mudar uma letra.
    const message = page.getByRole("region", { name: "Edição" }).getByRole("alert").filter({ hasText: TOO_COMPLEX });
    await expect(message).toBeVisible({ timeout: 90_000 });
    expect(((await message.textContent()) ?? "").replace("Erro:", "").trim()).toBe(TOO_COMPLEX);
    expect(await body.getAttribute("aria-describedby")).toContain("-texto-error");
    await expect(body).toHaveValue(HOSTILE_TEXT); // o texto digitado NÃO se perdeu
    const slugs = (await (await api.ana.get("/api/contents")).json()).data.map((node) => node.slug);
    expect(slugs).not.toContain("texto-hostil"); // nada foi gravado
  });

  test("(h) o usuário comum recebe 404 nas páginas novas, e não vê o link; o administrador vê", async ({ page }) => {
    await login(page, ANA);
    const status = async (path) => (await page.goto(path))?.status();

    expect(await status("/admin/usuarios")).toBe(404);
    expect(await status(`/admin/usuarios/${accounts.beto.id}/conteudo`)).toBe(404);
    expect(await status(`/admin/usuarios/${accounts.beto.id}/conteudo/${ids.docBeto}`)).toBe(404);
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Navegação do painel" }).locator(":visible").getByRole("link", { name: "Usuários" })).toHaveCount(0);
  });

  test("(h) o administrador: o usuário [id] inexistente, o conteúdo de OUTRO dono (endereço forjado) e /usuarios/[id] respondem 404", async ({ page }) => {
    await login(page, ADMIN_UI);
    const status = async (path) => (await page.goto(path))?.status();

    expect(await status("/admin/usuarios/nao-existe/conteudo")).toBe(404);
    expect(await status(`/admin/usuarios/${accounts.ana.id}/conteudo/${ids.docBeto}`)).toBe(404); // o documento é do Beto
    expect(await status(`/admin/usuarios/${accounts.beto.id}/conteudo/nao-existe`)).toBe(404);
    expect(await status(`/admin/usuarios/${accounts.beto.id}`)).toBe(404); // a rota [id] não existe (R-024)
    expect(await status(`/admin/usuarios/${accounts.beto.id}/conteudo/${ids.docBeto}`)).toBe(200); // o dono certo abre
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Navegação do painel" }).locator(":visible").getByRole("link", { name: "Usuários" })).toBeVisible();
  });
});
