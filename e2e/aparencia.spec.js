// A aparência em duas camadas e o seletor do administrador, pela interface e pela API, sobre a aplicação de
// PRODUÇÃO (A-031; D-40, D-41, ADR-038; RF41, RN30; CT63, CT64, CT67): o administrador salva a paleta do
// sistema e navega SEM recarregar até outra página do painel, e a cor muda (o item 6 do épico); quem não
// definiu a própria herda a do sistema no espaço (ISR, regenerado por caminhos literais quando o sistema
// muda) e no painel; quem definiu vê a dela; o administrador vê o ESPAÇO dele com a paleta dele e o PAINEL
// com a do sistema; o seletor `?alvo=` é só do administrador; voltar a herdar pela interface funciona; e uma
// paleta ruim do sistema não notifica quem a herda. Contas FICTÍCIAS; a guarda de CSP de ./support/test.js
// vale em todo teste. As esperas são por estado (a resposta, o texto, o cabeçalho), nunca por tempo fixo.
import { waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, cacheState, createAccount, createContent, fetchUntil, openSession } from "./support/accounts.js";
import { ADMIN } from "./support/env.js";
import { expect, test } from "./support/test.js";

const HER = { email: "herdeira-apar-e2e@exemplo.test", name: "Herdeira", handle: "apar-her", password: "senha-her-apar-9" };
const PRO = { email: "propria-apar-e2e@exemplo.test", name: "Própria", handle: "apar-pro", password: "senha-pro-apar-9" };
const ADMIN_HANDLE = "apar-adm";

/** Paletas completas (as três cores): a unidade de herança. As claras têm contraste suficiente (sem aviso). */
const palette = (primary) => ({ primaryColor: primary, secondaryColor: "#1e293b", accentColor: "#b45309" });
const SYSTEM_1 = palette("#0e7490");
const SYSTEM_2 = palette("#7e22ce");
const OWN = palette("#be123c");
const ADMIN_OWN = palette("#15803d");
const DEFAULT_LIGHT = palette("#2563eb");
const BAD_DARK = { darkPrimaryColor: "#1a1a1a", darkSecondaryColor: "#202020", darkAccentColor: "#141414" };
const DEFAULT_DARK = { darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" };

/** A cor primária que o envoltório `.vitrine-tema` resolve no modo atual (o claro: a primeira visita é clara). */
const primaryOf = (page) =>
  page.locator(".vitrine-tema").first().evaluate((element) => getComputedStyle(element).getPropertyValue("--vitrine-primary").trim());

/** O espaço (ISR) só mostra a paleta nova depois da revalidação: espera o texto, nunca o tempo. */
const spaceWith = (request, path, text) => fetchUntil(request, path, (body) => body.includes(text));

test.describe.serial("aparência em duas camadas e seletor do administrador", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let her;
  /** @type {import("@playwright/test").APIRequestContext} */
  let pro;

  test.beforeAll(async ({ playwright }) => {
    // O limite de escritas do administrador (RN25) pode fazer a criação das contas esperar o Retry-After.
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    const herAccount = await createAccount(playwright, admin, HER);
    const proAccount = await createAccount(playwright, admin, PRO);
    her = await apiLogin(playwright, herAccount);
    pro = await apiLogin(playwright, proAccount);

    // O administrador também tem espaço (D-39 retirada): handle e um documento publicado.
    const me = (await (await admin.get("/api/users/me")).json()).data;
    const handled = await admin.patch(`/api/users/${me.id}`, { data: { handle: ADMIN_HANDLE } });
    expect(handled.status(), "handle do administrador").toBe(200);
    for (const [owner, title] of /** @type {const} */ ([[admin, "Início do administrador"], [her, "Início da herdeira"], [pro, "Início da própria"]])) {
      await createContent(owner, { title, slug: "inicio", type: "DOCUMENT", body: `Texto: ${title}.` });
    }
    // Estado conhecido: o sistema com a paleta 1 nos dois modos; a Própria com a clara dela; o administrador com a dele.
    expect((await admin.put("/api/configuration", { data: { ...SYSTEM_1, ...DEFAULT_DARK } })).status()).toBe(200);
    expect((await pro.put("/api/appearance", { data: OWN })).status()).toBe(200);
    expect((await admin.put("/api/appearance", { data: ADMIN_OWN })).status()).toBe(200);
  });

  test.afterAll(async () => {
    // Devolve o sistema aos padrões: os specs seguintes não esperam a paleta destes testes.
    await admin?.put("/api/configuration", { data: { ...DEFAULT_LIGHT, ...DEFAULT_DARK } });
    await admin?.put("/api/appearance", { data: { primaryColor: null, secondaryColor: null, accentColor: null } });
    await admin?.dispose();
    await her?.dispose();
    await pro?.dispose();
  });

  test("item 6: o administrador salva a paleta do sistema e, sem recarregar, a cor do painel muda na página seguinte", async ({ browser }) => {
    const { context, page } = await openSession(browser, ADMIN);
    await page.goto("/admin/aparencia");
    await expect(page.getByRole("heading", { name: "Aparência do sistema", level: 1 })).toBeVisible();
    await waitForHydration(page);
    expect(await primaryOf(page)).toBe(SYSTEM_1.primaryColor);

    await page.evaluate(() => {
      // @ts-expect-error marca de ensaio: some se a página for recarregada
      window.__semRecarga = true;
    });
    await page.getByRole("group", { name: "Paleta clara" }).getByLabel("Primária", { exact: true }).fill(SYSTEM_2.primaryColor);
    await page.getByRole("button", { name: "Salvar a aparência do sistema" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aparência do sistema salva" })).toBeVisible();

    // Navegação do cliente até outra página do painel (o layout PERSISTE entre elas).
    await page.getByRole("link", { name: "Notificações" }).click();
    await expect(page).toHaveURL(/\/admin\/notificacoes$/);
    await expect(page.getByRole("heading", { name: "Notificações", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => /** @type {any} */ (window).__semRecarga)).toBe(true);
    await expect.poll(() => primaryOf(page)).toBe(SYSTEM_2.primaryColor);
    await context.close();
  });

  test("a herança no espaço (ISR) e no painel: quem herda vê a do sistema, quem definiu vê a própria", async ({ browser, request }) => {
    // O espaço da herdeira nasce com a paleta do sistema e fica em cache; o do administrador, com a dele.
    expect((await spaceWith(request, `/${HER.handle}/inicio`, `--vitrine-light-primary:${SYSTEM_2.primaryColor}`)).body).toContain(SYSTEM_2.primaryColor);
    expect(cacheState((await fetchUntil(request, `/${HER.handle}/inicio`, (_b, r) => cacheState(r) === "HIT")).response)).toBe("HIT");

    const own = await spaceWith(request, `/${PRO.handle}/inicio`, `--vitrine-light-primary:${OWN.primaryColor}`);
    expect(own.body).not.toContain(SYSTEM_2.primaryColor);
    // A paleta noturna ela herda do sistema, por modo (a unidade de herança é a paleta de cada modo).
    expect(own.body).toContain(`--vitrine-dark-primary:${DEFAULT_DARK.darkPrimaryColor}`);

    // O espaço do administrador mostra a paleta que ele definiu para a PÁGINA dele, não a do sistema.
    const adminSpace = await spaceWith(request, `/${ADMIN_HANDLE}/inicio`, `--vitrine-light-primary:${ADMIN_OWN.primaryColor}`);
    expect(adminSpace.body).not.toContain(SYSTEM_2.primaryColor);

    // Os painéis: a herdeira vê o do sistema; a Própria, o dela; o administrador, SEMPRE o do sistema.
    for (const [account, expected] of /** @type {const} */ ([
      [HER, SYSTEM_2.primaryColor],
      [PRO, OWN.primaryColor],
      [ADMIN, SYSTEM_2.primaryColor],
    ])) {
      const { context, page } = await openSession(browser, account);
      expect(await primaryOf(page), account.email).toBe(expected);
      await page.goto("/admin/aparencia");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await primaryOf(page), `${account.email} em /admin/aparencia`).toBe(expected);
      await context.close();
    }
  });

  test("o sistema muda a paleta: o espaço de quem herda é revalidado, o de quem definiu a própria não", async ({ request }) => {
    // Aquece os dois; depois o administrador muda a paleta clara do sistema.
    for (const path of [`/${HER.handle}/inicio`, `/${PRO.handle}/inicio`]) {
      await request.get(path);
      expect(cacheState((await fetchUntil(request, path, (_b, r) => cacheState(r) === "HIT", { attempts: 5 })).response), path).toBe("HIT");
    }
    expect((await admin.put("/api/configuration", { data: SYSTEM_1 })).status()).toBe(200);

    const heir = await spaceWith(request, `/${HER.handle}/inicio`, `--vitrine-light-primary:${SYSTEM_1.primaryColor}`);
    expect(heir.body).not.toContain(SYSTEM_2.primaryColor);
    // O espaço continua estático com ISR depois de regenerar (nunca vira dinâmico).
    expect(cacheState((await fetchUntil(request, `/${HER.handle}/inicio`, (_b, r) => cacheState(r) === "HIT")).response)).toBe("HIT");

    const own = await request.get(`/${PRO.handle}/inicio`);
    expect(cacheState(own)).toBe("HIT");
    expect(await own.text()).toContain(`--vitrine-light-primary:${OWN.primaryColor}`);
  });

  test("o seletor: só o administrador o vê; o padrão é o sistema; um alvo inválido cai no padrão", async ({ browser }) => {
    const adminSession = await openSession(browser, ADMIN);
    const page = adminSession.page;
    await page.goto("/admin/aparencia");
    const selector = page.getByRole("navigation", { name: "Aparência a editar" });
    await expect(selector.getByRole("link", { name: /Aparência do sistema/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Aparência do sistema", level: 1 })).toBeVisible();

    await selector.getByRole("link", { name: /Minha página/ }).click();
    await expect(page).toHaveURL(/\/admin\/aparencia\?alvo=pagina$/);
    await expect(page.getByRole("heading", { name: "Aparência do seu espaço", level: 1 })).toBeVisible();
    await expect(selector.getByRole("link", { name: /Minha página/ })).toHaveAttribute("aria-current", "page");
    // O mesmo formulário compartilhado, agora contra a página do administrador: o nome dele é o do espaço dele.
    await expect(page.getByLabel("Nome do espaço")).toBeVisible();
    await expect(page.getByLabel("Nome do site")).toHaveCount(0);

    await page.goto("/admin/aparencia?alvo=qualquer");
    await expect(page.getByRole("heading", { name: "Aparência do sistema", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Nome do site")).toBeVisible();

    // /admin/configuracoes ficou só com o que não é visual.
    await page.goto("/admin/configuracoes");
    await expect(page.getByLabel("Texto do portal (Markdown)")).toBeVisible();
    await expect(page.getByLabel("Nome do site")).toHaveCount(0);
    await adminSession.context.close();

    // O usuário comum não vê o seletor, e `?alvo=sistema` não lhe dá o formulário do sistema; a API recusa (403).
    const { context, page: herPage } = await openSession(browser, HER);
    await herPage.goto("/admin/aparencia?alvo=sistema");
    await expect(herPage.getByRole("heading", { name: "Aparência do seu espaço", level: 1 })).toBeVisible();
    await expect(herPage.getByRole("navigation", { name: "Aparência a editar" })).toHaveCount(0);
    await expect(herPage.getByLabel("Nome do site")).toHaveCount(0);
    await context.close();
    expect((await her.put("/api/configuration", { data: SYSTEM_2 })).status()).toBe(403);
  });

  test("voltar a herdar pela interface: 'Usar a aparência do sistema' e o espaço passa a mostrar a do sistema", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, PRO);
    await page.goto("/admin/aparencia");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Usar a aparência do sistema (paleta clara)" }).click();
    await page.getByRole("button", { name: "Salvar a aparência" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aparência salva" })).toBeVisible();

    const saved = (await (await pro.get("/api/appearance")).json());
    expect(saved.data).toMatchObject({ primaryColor: null, secondaryColor: null, accentColor: null });
    expect(saved.inherits).toMatchObject({ lightPalette: true });
    const space = await spaceWith(request, `/${PRO.handle}/inicio`, `--vitrine-light-primary:${SYSTEM_1.primaryColor}`);
    expect(space.body).not.toContain(OWN.primaryColor);
    await context.close();
  });

  test("uma paleta ruim do SISTEMA avisa e notifica o administrador, e não quem a herda (ADR-038, item 7)", async () => {
    const saved = await admin.put("/api/configuration", { data: BAD_DARK });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).warnings.length).toBeGreaterThan(0);

    const contrastOf = async (client) =>
      (await (await client.get("/api/notifications")).json()).data.filter((item) => item.type === "CONTRAST" && item.resolvedAt === null);
    const adminNotices = await contrastOf(admin);
    expect(adminNotices.some((item) => item.data.scope === "site" && item.data.mode === "dark")).toBe(true);
    expect(await contrastOf(her)).toEqual([]);
    expect(await contrastOf(pro)).toEqual([]);

    // Corrigida a paleta do sistema, a notificação do administrador é resolvida.
    expect((await admin.put("/api/configuration", { data: DEFAULT_DARK })).status()).toBe(200);
    expect((await contrastOf(admin)).filter((item) => item.data.scope === "site")).toEqual([]);
  });
});
