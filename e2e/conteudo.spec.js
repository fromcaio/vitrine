// O painel de conteúdo no navegador, sobre a aplicação de PRODUÇÃO (A-014 Parte 3e-1; RF03, RF06, RF07, RF26,
// RF28, RN05 a RN07, RN21, RN25; CT10 a CT12): a visão geral com os números do próprio usuário; a árvore (só a
// dele, com os rascunhos); criar uma coleção; publicar e despublicar (ícone e nome); subir e descer; mover;
// excluir PELO DIÁLOGO, com a contagem de descendentes; o aviso e o bloqueio da cota (20 no e2e); o perfil (o
// nome novo no cabeçalho e, depois, no diretório do portal); e a senha provisória leva a /admin/senha. Contas e
// conteúdo FICTÍCIOS. As sessões usam a fixture `page`, então a guarda de CSP vale em todo o fluxo.
import { signIn, waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, createAccount, createContent, fetchUntil, nextIp } from "./support/accounts.js";
import { expect, test } from "./support/test.js";

const ANA = { email: "ana-conteudo-e2e@exemplo.test", name: "Ana do Conteúdo", handle: "cont-ana", password: "senha-ana-cont-9" };
const BETO = { email: "beto-conteudo-e2e@exemplo.test", name: "Beto do Conteúdo", handle: "cont-beto", password: "senha-beto-cont-9" };
const TEMP = { email: "temp-conteudo-e2e@exemplo.test", name: "Quem Tem Senha Provisória", handle: "cont-temp" };
/** A cota de conteúdos por usuário no e2e (`MAX_CONTENTS_PER_USER`, em `support/env.js`). */
const QUOTA = 20;

/** Sessão de navegador com IP próprio, pela fixture `page` (a guarda de CSP vale). */
async function login(page, credentials) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await signIn(page, credentials);
}

/** Espera o React ligar a árvore (o clique antes disso não faz nada). */
async function treeReady(page) {
  await expect(page.getByRole("region", { name: "Conteúdo" })).toBeVisible();
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-label="Conteúdo"]');
    return !!section && Object.keys(section).some((key) => key.startsWith("__reactProps$"));
  });
}

test.describe.serial("painel de conteúdo", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  let temporaryPassword = "";
  const ids = { um: "", dois: "", col: "", dentro: "", moderado: "" };

  /** A árvore de Ana, como a API a devolve. */
  const tree = async () => (await (await ana.get("/api/contents")).json()).data;
  const rootSlugs = async () => (await tree()).map((node) => node.slug);

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(180_000);
    admin = await adminLogin(playwright);
    const anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    const created = await admin.post("/api/users", { data: { email: TEMP.email, name: TEMP.name, handle: TEMP.handle } });
    expect(created.status()).toBe(201);
    temporaryPassword = (await created.json()).data.temporaryPassword;

    ana = await apiLogin(playwright, anaAccount);
    ids.um = (await createContent(ana, { title: "Aula um", slug: "um", type: "DOCUMENT", body: "Texto um." })).id;
    ids.dois = (await createContent(ana, { title: "Aula dois", slug: "dois", type: "DOCUMENT", status: "DRAFT", body: "Texto dois." })).id;
    ids.col = (await createContent(ana, { title: "Coleção de Ana", slug: "col", type: "COLLECTION" })).id;
    ids.dentro = (await createContent(ana, { title: "Aula dentro", slug: "dentro", type: "DOCUMENT", parentId: ids.col, body: "Texto dentro." })).id;
    ids.moderado = (await createContent(ana, { title: "Aula moderada", slug: "moderado", type: "DOCUMENT", body: "Texto moderado." })).id;
    // Uma moderação do administrador: o conteúdo vira rascunho e a Ana tem 1 notificação não lida.
    expect((await admin.patch(`/api/contents/${ids.moderado}`, { data: { status: "DRAFT", reason: "texto fora do tema" } })).status()).toBe(200);

    // O Beto tem o conteúdo dele: nunca pode aparecer na árvore nem nos números da Ana.
    const beto = await apiLogin(playwright, betoAccount);
    const betoCol = await createContent(beto, { title: "Coleção secreta do Beto", slug: "secreta", type: "COLLECTION" });
    await createContent(beto, { title: "Documento secreto do Beto", slug: "doc-beto", type: "DOCUMENT", parentId: betoCol.id, body: "Do Beto." });
    await beto.dispose();
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
  });

  test("a visão geral traz os números do PRÓPRIO usuário, o espaço e os atalhos que existem (RF26, RN25)", async ({ page }) => {
    await login(page, ANA);

    await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
    const card = (label) => page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
    await expect(card("Conteúdos")).toContainText(`5 de ${QUOTA}`);
    await expect(card("Publicados")).toContainText("3");
    await expect(card("Rascunhos")).toContainText("2");
    await expect(card("Notificações não lidas")).toContainText("1");
    await expect(page.getByRole("link", { name: "/cont-ana" })).toBeVisible();
    // Conteúdo e Perfil existem (links, não "em breve"); os Usuários só o administrador veria, e ainda não existem.
    const shortcuts = page.getByRole("region", { name: "Atalhos" }).or(page.locator('section[aria-labelledby="atalhos-titulo"]'));
    await expect(shortcuts.getByRole("link", { name: "Conteúdo" })).toBeVisible();
    await expect(shortcuts.getByRole("link", { name: "Perfil" })).toBeVisible();
    await expect(shortcuts.getByText("em breve")).toHaveCount(0);
  });

  test("a árvore é a do dono, com os rascunhos; a de outro usuário nunca aparece (RF03, RF26, RN19)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo?ownerId=qualquer&user=cont-beto");

    await expect(page.getByRole("heading", { name: "Conteúdo", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const nav = page.getByRole("navigation", { name: "Árvore de conteúdo" });
    for (const title of ["Aula um", "Aula dois", "Coleção de Ana", "Aula moderada"]) await expect(nav.getByText(title).first()).toBeVisible();
    await expect(page.getByText("Rascunho").first()).toBeVisible(); // o estado é ícone e NOME
    await expect(page.getByText("Publicado").first()).toBeVisible();
    for (const hidden of ["Coleção secreta do Beto", "Documento secreto do Beto"]) await expect(page.getByText(hidden)).toHaveCount(0);

  });

  test("o outro usuário vê só a árvore dele", async ({ page }) => {
    await login(page, BETO);
    await page.goto("/admin/conteudo");

    await expect(page.getByText("Coleção secreta do Beto").first()).toBeVisible();
    for (const hidden of ["Aula um", "Aula dois", "Coleção de Ana", "Aula moderada"]) await expect(page.getByText(hidden)).toHaveCount(0);
  });

  test("criar uma coleção pelo diálogo (RF06): o slug é sugerido e a coleção aparece na árvore e na API", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);

    await page.getByRole("button", { name: "Nova coleção" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova coleção" });
    await dialog.getByLabel("Título").fill("Cálculo II");
    await expect(dialog.getByLabel("Slug (o final do endereço)")).toHaveValue("calculo-ii");
    await dialog.getByRole("button", { name: "Criar coleção" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Árvore de conteúdo" }).getByText("Cálculo II").first()).toBeVisible();
    expect(await rootSlugs()).toContain("calculo-ii");
  });

  test("publicar e despublicar: o estado em ícone e nome muda, e o servidor guarda (RF07, RN16)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);

    await page.getByRole("button", { name: "Publicar: Aula dois" }).click();
    await expect(page.getByRole("button", { name: "Passar para rascunho: Aula dois" })).toBeVisible();
    expect((await tree()).find((node) => node.id === ids.dois).status).toBe("PUBLISHED");

    await page.getByRole("button", { name: "Passar para rascunho: Aula dois" }).click();
    await expect(page.getByRole("button", { name: "Publicar: Aula dois" })).toBeVisible();
    expect((await tree()).find((node) => node.id === ids.dois).status).toBe("DRAFT");
  });

  test("subir e descer troca a ordem na hora, e a ordem fica guardada (RN05)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);
    const before = await rootSlugs();
    expect(before.slice(0, 2)).toEqual(["um", "dois"]);

    await page.getByRole("button", { name: /^Descer: Aula um/ }).click();
    await expect(page.getByRole("button", { name: /^Subir: Aula um \(posição 2 de/ })).toBeVisible();
    await expect.poll(rootSlugs).toEqual(["dois", "um", ...before.slice(2)]);

    await page.getByRole("button", { name: /^Subir: Aula um/ }).click();
    await expect.poll(rootSlugs).toEqual(before);
  });

  test("mover para outra coleção: só destinos válidos, e a API confirma o pai novo (RN05, RN06)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);

    await page.getByRole("button", { name: "Mover para outra coleção: Aula dois" }).click();
    const dialog = page.getByRole("dialog", { name: 'Mover "Aula dois"' });
    const options = await dialog.getByLabel("Mover para").locator("option").allTextContents();
    expect(options.join("|")).toContain("Coleção de Ana");
    expect(options.join("|")).not.toContain("Aula dois"); // nunca ele mesmo
    await dialog.getByLabel("Mover para").selectOption({ label: options.find((label) => label.includes("Coleção de Ana")) });
    await dialog.getByRole("button", { name: "Mover" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await (await ana.get(`/api/contents/${ids.dois}`)).json()).data.parentId).toBe(ids.col);
  });

  // O diálogo de exclusão é a variante `danger`: o papel é `alertdialog`.
  test("excluir pelo diálogo: informa quantos itens saem junto, cancelar não apaga, confirmar apaga tudo (RN07)", async ({ page }) => {
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);
    const total = async () => {
      const count = (nodes) => nodes.reduce((sum, node) => sum + 1 + count(node.children), 0);
      return count(await tree());
    };
    const before = await total();

    await page.getByRole("button", { name: "Excluir: Coleção de Ana" }).click();
    const dialog = page.getByRole("alertdialog", { name: /Excluir a coleção "Coleção de Ana"\?/ });
    await expect(dialog).toContainText("2 itens que estão dentro serão excluídos junto"); // "Aula dentro" e "Aula dois"
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await total()).toBe(before);

    await page.getByRole("button", { name: "Excluir: Coleção de Ana" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Árvore de conteúdo" }).getByText("Coleção de Ana")).toHaveCount(0);
    expect(await total()).toBe(before - 3);
    expect((await ana.get(`/api/contents/${ids.dentro}`)).status()).toBe(404);
  });

  test("a cota (RN25): o aviso perto do limite e o bloqueio no limite", async ({ page }) => {
    const now = async () => {
      const count = (nodes) => nodes.reduce((sum, node) => sum + 1 + count(node.children), 0);
      return count(await tree());
    };
    // Perto do limite (90%): QUOTA - 2.
    let n = 0;
    while ((await now()) < QUOTA - 2) await createContent(ana, { title: `Cota ${++n}`, slug: `cota-${n}`, type: "DOCUMENT", body: "x" });
    await login(page, ANA);
    await page.goto("/admin/conteudo");
    await treeReady(page);
    await expect(page.getByText(`Faltam 2 conteúdos para o limite de ${QUOTA}.`)).toBeVisible();

    // No limite: o aviso muda e criar é recusado pela API (e a interface não oferece criar).
    while ((await now()) < QUOTA) await createContent(ana, { title: `Cota ${++n}`, slug: `cota-${n}`, type: "DOCUMENT", body: "x" });
    await page.reload();
    await treeReady(page);
    await expect(page.getByText(`Você atingiu o limite de ${QUOTA} conteúdos. Exclua algum para criar outro.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova coleção" })).toBeDisabled();
    const over = await ana.post("/api/contents", { data: { title: "Passou", slug: "passou", type: "DOCUMENT", body: "x" } });
    expect(over.status()).toBe(422);
    expect((await over.json()).error.code).toBe("QUOTA_EXCEEDED");

    // A visão geral concorda.
    await page.goto("/admin");
    await expect(page.locator("dl > div").filter({ has: page.getByText("Conteúdos", { exact: true }) })).toContainText(`${QUOTA} de ${QUOTA}`);
    await expect(page.getByText(`Você atingiu o limite de ${QUOTA} conteúdos.`)).toBeVisible();
  });

  test("o perfil (RF28): o nome novo aparece no cabeçalho e, depois, no diretório do portal", async ({ page, request }) => {
    await login(page, ANA);
    await page.goto("/admin/perfil");

    await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByLabel("E-mail")).toHaveValue(ANA.email);
    await page.waitForFunction(() => {
      const form = document.querySelector("main form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
    });

    await page.getByLabel("Nome de exibição").fill("Ana Renomeada");
    await page.getByRole("button", { name: "Salvar nome" }).click();

    await expect(page.getByText("Nome atualizado.")).toBeVisible();
    // O cabeçalho do painel (o layout) se atualiza sem recarregar: o envoltório chama router.refresh().
    await expect(page.locator("header").getByText("Ana Renomeada")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nome de exibição")).toHaveValue("Ana Renomeada");

    // O diretório do portal (revalidado pela rota) passa a mostrar o nome novo.
    const { body } = await fetchUntil(request, "/", (html) => html.includes("Ana Renomeada"));
    expect(body).toContain("Ana Renomeada");
  });

  test("o perfil não deixa mudar o papel nem o handle: o servidor os ignora mesmo se o corpo os trouxer (CT39)", async () => {
    const response = await ana.patch("/api/users/me", { data: { name: "Ana Renomeada", role: "admin", handle: "invadido" } });

    expect(response.status()).toBe(200);
    expect((await response.json()).data).toMatchObject({ role: "user", handle: "cont-ana" });
    expect((await admin.get("/api/users/me")).status()).toBe(200);
  });

  test("com a senha provisória só /admin/senha abre: o painel, o conteúdo e o perfil levam à troca (RN21)", async ({ page }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByLabel("E-mail").fill(TEMP.email);
    await page.getByLabel("Senha").fill(temporaryPassword);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/senha\?redirectTo=%2Fadmin$/);

    for (const [path, encoded] of [["/admin/conteudo", "%2Fadmin%2Fconteudo"], ["/admin/perfil", "%2Fadmin%2Fperfil"], ["/admin", "%2Fadmin"]]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/admin/senha\\?redirectTo=${encoded}$`));
    }
    await expect(page.getByRole("heading", { name: "Trocar a senha", level: 1 })).toBeVisible();
  });
});
