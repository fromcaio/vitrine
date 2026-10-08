// Varredura de acessibilidade com o axe-core (A-023, item 2; RNF05, RNF06): WCAG 2.1 A e AA, mais as boas
// práticas, sobre a aplicação de PRODUÇÃO (o `build` e o `start` reais, o banco temporário, a API real e a
// guarda de CSP de `./support/test.js`), nos DOIS modos (claro e noturno) e em 1280 e 320 px, nas páginas
// públicas e do painel, mais os estados com diálogo aberto. Contas e conteúdo FICTÍCIOS.
//
//   npm run test:a11y        (marcado `@a11y`: o `npm run test:e2e` não o roda, para não alongar a rodada)
//
// Meta: zero violações de impacto `serious` e `critical`. As `moderate` e `minor` vão ao relatório
// (`test-results/acessibilidade.txt`), cada uma corrigida ou justificada. Nenhuma regra é desligada e nenhum
// elemento é excluído da varredura. Os testes-canário provam que a varredura FALHA diante de uma violação
// conhecida (botão sem nome, imagem sem `alt`, campo sem rótulo, contraste abaixo de 4,5:1).
import { ADMIN, e2eEnvironment } from "./support/env.js";
import { adminLogin, apiLogin, createAccount, createContent, openSession } from "./support/accounts.js";
import { BLOCKING, results, scan, scanAll, writeReport, report } from "./support/a11y.js";
import { expect, newGuardedContext, test } from "./support/test.js";

const { baseURL } = e2eEnvironment();

const ANA = { email: "ana-a11y@exemplo.test", name: "Ana A11y", handle: "a11y-ana", password: "senha-ana-a11y-9" };
const BETO = { email: "beto-a11y@exemplo.test", name: "Beto A11y", handle: "a11y-beto", password: "senha-beto-a11y-9" };
const SUSP = { email: "susp-a11y@exemplo.test", name: "Susp A11y", handle: "a11y-susp", password: "senha-susp-a11y-9" };

/** O texto do documento com matemática, código e tabela (RF09 a RF11). */
const MATH_BODY = [
  "## Definição",
  "",
  "O limite $\\lim_{x\\to 0} \\frac{\\sin x}{x} = 1$ vale, e em bloco:",
  "",
  "$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$",
  "",
  "| Função | Limite |",
  "|---|---|",
  "| $\\sin x / x$ | 1 |",
  "| $(1+x)^{1/x}$ | $e$ |",
  "",
  "```js",
  "const limite = Math.sin(1e-9) / 1e-9;",
  "console.log(limite);",
  "```",
  "",
  "Uma lista:",
  "",
  "- primeiro item",
  "- segundo item com [um link](https://exemplo.test)",
  "",
].join("\n");

test.describe.configure({ timeout: 180_000 });

test.describe.serial("acessibilidade (axe, WCAG 2.1 AA) @a11y", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  const ids = { ana: "", beto: "", limites: "", sobre: "", adminDoc: "" };
  /** Estado de sessão (cookies) por e-mail: o login é feito uma vez por conta. @type {Map<string, Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>>} */
  const sessions = new Map();

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(240_000);
    admin = await adminLogin(playwright);
    const anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    await createAccount(playwright, admin, SUSP);
    ids.ana = anaAccount.id;
    ids.beto = betoAccount.id;
    ana = await apiLogin(playwright, anaAccount);

    // O espaço da Ana: coleções aninhadas, um rascunho, um documento com matemática, código e tabela.
    const calculo = await createContent(ana, { title: "Cálculo", slug: "calculo", type: "COLLECTION" });
    const limites = await createContent(ana, { title: "Limites", slug: "limites", type: "DOCUMENT", parentId: calculo.id, body: MATH_BODY });
    ids.limites = limites.id;
    const derivadas = await createContent(ana, { title: "Derivadas", slug: "derivadas", type: "DOCUMENT", parentId: calculo.id, body: "Texto de derivadas." });
    await createContent(ana, { title: "Anotação privada", slug: "rascunho", type: "DOCUMENT", parentId: calculo.id, status: "DRAFT", body: "x" });
    const avancado = await createContent(ana, { title: "Avançado", slug: "avancado", type: "COLLECTION", parentId: calculo.id });
    await createContent(ana, { title: "Séries", slug: "series", type: "DOCUMENT", parentId: avancado.id, body: "Texto de séries." });
    const sobre = await createContent(ana, { title: "Sobre", slug: "sobre", type: "DOCUMENT", body: "Texto do sobre." });
    ids.sobre = sobre.id;
    // O administrador também tem um documento (a página do editor do próprio administrador).
    ids.adminDoc = (await createContent(admin, { title: "Documento do administrador", slug: "doc-admin", type: "DOCUMENT", body: MATH_BODY })).id;
    // Uma moderação: o administrador despublica um documento da Ana com motivo, e a Ana recebe a notificação.
    const moderated = await admin.patch(`/api/contents/${derivadas.id}`, { data: { status: "DRAFT", reason: "Conteúdo desatualizado: revise antes de publicar." } });
    expect(moderated.status()).toBe(200);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await ana?.dispose();
    const file = writeReport();
    console.log(`\n${report()}\n\nRelatório gravado em ${file}`);
  });

  /**
   * Abre uma página com a sessão da conta (o login é feito uma vez; depois, só os cookies) e a entrega a `body`.
   * @param {import("@playwright/test").Browser} browser
   * @param {{ email: string, password: string }} who
   * @param {(page: import("@playwright/test").Page) => Promise<void>} body
   */
  async function withSession(browser, who, body) {
    const stored = sessions.get(who.email);
    if (stored) {
      const context = await newGuardedContext(browser, { baseURL, locale: "pt-BR", storageState: stored });
      try {
        await body(await context.newPage());
      } finally {
        await context.close();
      }
      return;
    }
    const { context, page } = await openSession(browser, who);
    sessions.set(who.email, await context.storageState());
    try {
      await body(page);
    } finally {
      await context.close();
    }
  }

  /**
   * As violações que derrubam (`serious` e `critical`), de TODOS os estados: cada estado as acrescenta aqui e o
   * último teste as confere. Assim uma rodada mostra tudo o que há, em vez de parar na primeira página com
   * problema (o `describe.serial` pulava o resto).
   * @type {string[]}
   */
  const blocking = [];

  /**
   * Varre o estado atual da página nos dois modos e nas duas larguras e guarda o que derruba.
   * @param {import("@playwright/test").Page} page
   * @param {string} name
   */
  async function check(page, name) {
    blocking.push(...(await scanAll(page, name)));
  }

  /** Espera a página estar de pé: o título de nível 1 e o carregamento. @param {import("@playwright/test").Page} page */
  async function ready(page) {
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("load");
  }

  // ---------------------------------------------------------------------------------------------
  // Páginas públicas (sem sessão)
  // ---------------------------------------------------------------------------------------------

  /** @type {[string, () => string][]} */
  const PUBLIC = [
    ["público: portal /", () => "/"],
    ["público: início de um espaço", () => `/${ANA.handle}`],
    ["público: documento com matemática, código e tabela", () => `/${ANA.handle}/calculo/limites`],
    ["público: 404", () => `/${ANA.handle}/nao-existe`],
    ["público: /login", () => "/login"],
  ];
  for (const [name, path] of PUBLIC) {
    test(name, async ({ page }) => {
      await page.goto(path());
      await ready(page);
      if (name.includes("matemática")) await expect(page.locator(".katex").first()).toBeVisible();
      await check(page, name);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Painel: o administrador
  // ---------------------------------------------------------------------------------------------

  /** @type {[string, () => string, ((page: import("@playwright/test").Page) => Promise<void>)?][]} */
  const ADMIN_PAGES = [
    ["admin: visão geral", () => "/admin"],
    ["admin: árvore do conteúdo (vazia de coleções)", () => "/admin/conteudo"],
    ["admin: novo conteúdo", () => "/admin/conteudo/novo"],
    ["admin: editor de um documento (matemática)", () => `/admin/conteudo/${ids.adminDoc}`, async (page) => {
      await expect(page.getByLabel("Texto do documento (Markdown)")).toBeVisible();
      await expect(page.getByRole("region", { name: "Pré-visualização do documento" }).locator(".katex").first()).toBeVisible();
    }],
    ["admin: aparência", () => "/admin/aparencia"],
    ["admin: configurações do site", () => "/admin/configuracoes"],
    ["admin: notificações", () => "/admin/notificacoes"],
    ["admin: perfil", () => "/admin/perfil"],
    ["admin: trocar a senha", () => "/admin/senha"],
    ["admin: usuários", () => "/admin/usuarios", async (page) => {
      await expect(page.locator("li[data-user-id]").first()).toBeVisible();
    }],
    ["admin: moderação, árvore de outro usuário", () => `/admin/usuarios/${ids.ana}/conteudo`, async (page) => {
      await expect(page.locator("li[data-node-id]").first()).toBeVisible();
    }],
    ["admin: moderação, editor de conteúdo alheio", () => `/admin/usuarios/${ids.ana}/conteudo/${ids.limites}`, async (page) => {
      await expect(page.getByLabel("Texto do documento (Markdown)")).toBeVisible();
      await expect(page.getByRole("region", { name: "Pré-visualização do documento" }).locator(".katex").first()).toBeVisible();
    }],
  ];
  for (const [name, path, extra] of ADMIN_PAGES) {
    test(name, async ({ browser }) => {
      await withSession(browser, ADMIN, async (page) => {
        await page.goto(path());
        await ready(page);
        if (extra) await extra(page);
        await check(page, name);
      });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Painel: um usuário comum (a Ana)
  // ---------------------------------------------------------------------------------------------

  /** @type {[string, () => string, ((page: import("@playwright/test").Page) => Promise<void>)?][]} */
  const USER_PAGES = [
    ["usuário: visão geral", () => "/admin"],
    ["usuário: árvore do conteúdo (coleções, rascunhos)", () => "/admin/conteudo", async (page) => {
      await expect(page.locator("li[data-node-id]").first()).toBeVisible();
    }],
    ["usuário: editor de um documento (matemática)", () => `/admin/conteudo/${ids.limites}`, async (page) => {
      await expect(page.getByRole("region", { name: "Pré-visualização do documento" }).locator(".katex").first()).toBeVisible();
    }],
    ["usuário: aparência", () => "/admin/aparencia"],
    ["usuário: notificações (com uma moderação)", () => "/admin/notificacoes", async (page) => {
      await expect(page.getByText("Conteúdo desatualizado: revise antes de publicar.")).toBeVisible();
    }],
    ["usuário: perfil", () => "/admin/perfil"],
  ];
  for (const [name, path, extra] of USER_PAGES) {
    test(name, async ({ browser }) => {
      await withSession(browser, ANA, async (page) => {
        await page.goto(path());
        await ready(page);
        if (extra) await extra(page);
        await check(page, name);
      });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Estados do épico v1 (A-027): o popout do sino, o link "Administração" e a herança da aparência
  // ---------------------------------------------------------------------------------------------

  test("popout: o sino aberto, com as notificações recentes (painel, não modal)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.goto("/admin");
      await ready(page);
      const bell = page.getByRole("button", { name: /^Notificações,/ });
      await bell.click();
      await expect(bell).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Conteúdo desatualizado: revise antes de publicar.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Ver todas" })).toBeVisible();
      await check(page, "popout: o sino aberto");
    });
  });

  test("público: portal e espaço com o link Administração (sessão ativa, cookie-marcador)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.context().addCookies([{ name: "vitrine-logado", value: "1", url: baseURL }]);
      for (const [name, path] of /** @type {const} */ ([
        ["público: portal com o link Administração", "/"],
        ["público: espaço com o link Administração", `/${ANA.handle}`],
      ])) {
        await page.goto(path);
        await ready(page);
        await expect(page.getByRole("link", { name: "Administração" })).toBeVisible();
        await check(page, name);
      }
    });
  });

  test("usuário: aparência com a paleta herdada do sistema (referência somente leitura)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.goto("/admin/aparencia");
      await ready(page);
      await page.getByRole("button", { name: "Usar a aparência do sistema (paleta clara)" }).click();
      await page.getByRole("button", { name: "Usar a aparência do sistema (paleta noturna)" }).click();
      await expect(page.getByRole("list", { name: "Paleta do sistema, modo claro" })).toBeVisible();
      await check(page, "usuário: aparência com a paleta herdada");
    });
  });

  test("admin: configurações com o seletor de ícones e a barra superior desligada em parte", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto("/admin/configuracoes");
      await ready(page);
      await page.getByRole("checkbox", { name: "Mostrar o logotipo" }).first().uncheck();
      await page.getByRole("radio", { name: "Lâmpada acesa e apagada" }).check();
      await page.getByRole("checkbox", { name: "Mostrar o nome" }).first().click(); // recusado: pelo menos um fica ligado
      await expect(page.getByText("Deixe pelo menos um ligado: o logotipo ou o nome.")).toBeVisible();
      await check(page, "admin: configurações com a barra superior e o erro do último ligado");
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Estados com diálogo aberto
  // ---------------------------------------------------------------------------------------------

  test("diálogo: nova coleção (formulário em diálogo)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.goto("/admin/conteudo");
      await ready(page);
      await page.getByRole("button", { name: "Nova coleção" }).click();
      await expect(page.getByRole("dialog", { name: "Nova coleção" })).toBeVisible();
      await check(page, "diálogo: nova coleção");
    });
  });

  test("diálogo: excluir conteúdo (alertdialog)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.goto("/admin/conteudo");
      await ready(page);
      await page.getByRole("button", { name: "Excluir: Sobre" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await check(page, "diálogo: excluir conteúdo");
    });
  });

  test("diálogo: mover conteúdo (seletor de destino)", async ({ browser }) => {
    await withSession(browser, ANA, async (page) => {
      await page.goto("/admin/conteudo");
      await ready(page);
      await page.getByRole("button", { name: "Mover para outra coleção: Sobre" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await check(page, "diálogo: mover conteúdo");
    });
  });

  test("diálogo: suspender usuário (moderação, com o prazo)", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto("/admin/usuarios");
      await expect(page.locator("li[data-user-id]").first()).toBeVisible();
      await page.getByRole("button", { name: `Suspender: ${BETO.name}` }).click();
      await expect(page.getByRole("alertdialog", { name: `Suspender ${BETO.name}` })).toBeVisible();
      await check(page, "diálogo: suspender usuário");
    });
  });

  test("diálogo: redefinir a senha de um usuário", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto("/admin/usuarios");
      await expect(page.locator("li[data-user-id]").first()).toBeVisible();
      await page.getByRole("button", { name: `Redefinir a senha: ${BETO.name}` }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await check(page, "diálogo: redefinir a senha");
    });
  });

  test("diálogo: excluir usuário com conteúdo (a escolha do destino)", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto("/admin/usuarios");
      await expect(page.locator("li[data-user-id]").first()).toBeVisible();
      await page.getByRole("button", { name: `Excluir: ${ANA.name}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
      await expect(page.getByRole("alertdialog", { name: new RegExp(`O que fazer com o conteúdo de ${ANA.name}`) })).toBeVisible();
      await page.getByRole("alertdialog").getByLabel("Transferir o conteúdo para outro usuário").check();
      await expect(page.getByLabel("Usuário de destino")).toBeVisible();
      await check(page, "diálogo: excluir usuário com conteúdo");
    });
  });

  test("painel da senha provisória (mostrada uma única vez)", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto("/admin/usuarios");
      await expect(page.locator("li[data-user-id]").first()).toBeVisible();
      await page.getByRole("button", { name: "Novo usuário" }).click();
      await page.getByLabel("E-mail", { exact: true }).fill("novo-a11y@exemplo.test");
      await page.getByLabel("Nome de exibição").fill("Novo A11y");
      await page.getByRole("button", { name: "Criar usuário" }).click();
      await expect(page.locator('section[aria-labelledby="senha-provisoria-titulo"]')).toBeVisible();
      await check(page, "painel: senha provisória");
    });
  });

  test("diálogo: moderação, despublicar conteúdo alheio", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto(`/admin/usuarios/${ids.ana}/conteudo`);
      await expect(page.locator("li[data-node-id]").first()).toBeVisible();
      await page.getByRole("button", { name: "Despublicar: Limites" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await check(page, "diálogo: moderação, despublicar");
    });
  });

  test("diálogo: moderação, enviar o conteúdo alheio com motivo", async ({ browser }) => {
    await withSession(browser, ADMIN, async (page) => {
      await page.goto(`/admin/usuarios/${ids.ana}/conteudo/${ids.limites}`);
      await expect(page.getByLabel("Texto do documento (Markdown)")).toBeVisible();
      await page.getByLabel("Texto do documento (Markdown)").fill(`${MATH_BODY}\nUm acréscimo.`);
      await page.getByRole("button", { name: "Enviar nova versão" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await check(page, "diálogo: moderação, enviar com motivo");
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Testes-canário: a varredura FALHA diante de uma violação conhecida
  // ---------------------------------------------------------------------------------------------

  test("canário: a varredura detecta um botão sem nome, uma imagem sem alt, um campo sem rótulo e um contraste abaixo de 4,5:1", async ({ page }) => {
    await page.goto("/login");
    await ready(page);
    const before = (await scan(page)).filter((finding) => BLOCKING.has(finding.impact));
    expect(before, "a página limpa não tem violações sérias").toEqual([]);

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML =
        '<button type="button"></button>' +
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' +
        '<input type="text">' +
        '<p style="color:#bbbbbb;background:#ffffff">Texto cinza claro sobre fundo branco</p>';
      document.body.appendChild(host);
    });
    const found = await scan(page);
    const blocking = found.filter((finding) => BLOCKING.has(finding.impact)).map((finding) => finding.id);
    for (const rule of ["button-name", "image-alt", "label", "color-contrast"]) {
      expect(blocking, `a varredura tem de apontar ${rule}`).toContain(rule);
    }
  });

  test("canário: scanAll devolve as violações sérias com o contexto (página, modo, largura) para o relatório", async ({ page }) => {
    await page.goto("/login");
    await ready(page);
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.type = "button";
      document.body.appendChild(button);
    });
    const blocking = await scanAll(page, "canário: botão sem nome");
    expect(blocking.length).toBeGreaterThanOrEqual(4); // 2 modos × 2 larguras
    expect(blocking[0]).toMatch(/canário: botão sem nome \[claro, 1280px\] critical button-name/);
    // Os resultados do canário não entram no relatório da rodada.
    results.splice(results.findIndex((item) => item.page === "canário: botão sem nome"), results.length);
  });

  // ---------------------------------------------------------------------------------------------
  // O resultado da rodada (sempre o ÚLTIMO teste)
  // ---------------------------------------------------------------------------------------------

  test("meta: zero violações de impacto sério e crítico em todos os estados varridos", () => {
    expect(blocking, `violações sérias ou críticas (${blocking.length}):\n${blocking.join("\n")}`).toEqual([]);
  });
});
