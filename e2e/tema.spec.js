// Tema por modo e modo de cor sobre a aplicação de PRODUÇÃO (A-014 Parte 3a, item 5; ADR-030, ADR-025,
// ADR-021, ADR-022; CT47): o layout raiz é estático (o HTML pré-renderizado não tem `style` no <html>
// nem variáveis do tema, e o build não consulta o banco); o script do <head> aplica o modo noturno
// ANTES da primeira pintura; o portal, o login e o painel aplicam a paleta do site no envoltório
// `.vitrine-tema`, por modo; e a CSP não registra violação (a guarda de `./support/test.js`).
import { readFileSync } from "node:fs";
import path from "node:path";
import { signIn } from "./support/auth.js";
import { ADMIN, e2eEnvironment } from "./support/env.js";
import { BUILD_INDEX_COPY } from "./support/global-setup.js";
import { expect, test } from "./support/test.js";

const { baseURL, dir } = e2eEnvironment();

const LIGHT = { primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#b45309" };
const DARK = { darkPrimaryColor: "#93c5fd", darkSecondaryColor: "#e2e8f0", darkAccentColor: "#fcd34d" };

/** Abre `/login` e devolve a classe do <html> no DOMContentLoaded (depois do script do <head>, antes da hidratação). */
async function classAtDomContentLoaded(page, route = "/login") {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      // @ts-expect-error variável de ensaio
      window.__classAtDcl = document.documentElement.className;
    });
  });
  await page.goto(route);
  // @ts-expect-error variável de ensaio
  return page.evaluate(() => window.__classAtDcl);
}

test.describe.serial("tema por modo e modo de cor", () => {
  test("o HTML pré-renderizado no build não tem style no <html>, nem variáveis do tema, e leva o script do modo no <head>", () => {
    // A fotografia do `index.html` que o build gerou, tirada no setup global, antes de qualquer visita a `/`.
    const html = readFileSync(path.join(dir, BUILD_INDEX_COPY), "utf8");
    const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? "";

    expect(htmlTag).toContain('lang="pt-BR"');
    expect(htmlTag).not.toContain("style=");
    // O build não consulta o banco: nenhuma paleta do site no HTML (valem os padrões do globals.css).
    expect(html).not.toContain("--vitrine-light-primary");
    expect(html).not.toContain("--vitrine-dark-primary");
    const head = html.match(/<head>(.*?)<\/head>/s)?.[1] ?? "";
    // O modo vem do cookie `vitrine-modo` (ADR-036): o script o lê, e o servidor nunca.
    expect(head).toContain("vitrine-modo");
    expect(head).not.toContain("localStorage");
    expect(head).toContain('classList.add("dark")');
  });

  // Só dois modos (D-33): o cookie decide; a primeira visita é CLARA, mesmo com o sistema escuro, e o
  // valor antigo "auto" já não vale.
  for (const [scheme, stored, dark] of [
    ["dark", null, false],
    ["light", null, false],
    ["light", "dark", true],
    ["dark", "light", false],
    ["dark", "auto", false],
  ]) {
    test(`modo noturno antes da primeira pintura (CT47): sistema ${scheme}, cookie ${stored ?? "nenhum"} → ${dark ? "noturno" : "claro"}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: /** @type {"dark" | "light"} */ (scheme) });
      if (stored) await page.context().addCookies([{ name: "vitrine-modo", value: stored, url: baseURL }]);

      const classes = await classAtDomContentLoaded(page);

      expect(classes.split(/\s+/).includes("dark")).toBe(dark);
      // E continua assim depois da hidratação.
      expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(dark);
    });
  }

  test("o localStorage antigo (vitrine:modo) é ignorado, e o botão grava o cookie e vale na próxima carga (ADR-036)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("vitrine:modo", "dark"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Mudar para o modo escuro" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    await page.getByRole("button", { name: "Mudar para o modo escuro" }).click();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    const cookie = (await page.context().cookies(baseURL)).find((item) => item.name === "vitrine-modo");
    expect(cookie?.value).toBe("dark");
    expect(cookie?.httpOnly).toBe(false);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    expect(await page.evaluate(() => localStorage.getItem("vitrine:modo"))).toBeNull();

    // Na próxima carga o script do <head> já aplica o modo, antes da hidratação.
    const classes = await classAtDomContentLoaded(page, "/");
    expect(classes.split(/\s+/).includes("dark")).toBe(true);

    await page.getByRole("button", { name: "Mudar para o modo claro" }).click();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    expect((await page.context().cookies(baseURL)).find((item) => item.name === "vitrine-modo")?.value).toBe("light");
  });

  test("o 404 global usa as paletas padrão: sem envoltório do tema do site", async ({ request }) => {
    const response = await request.get("/pagina-que-nao-existe-e2e");

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("vitrine-tema");
  });

  test("a paleta do site, gravada por modo, chega ao portal (ISR), ao login e ao painel, e cada modo usa a sua", async ({ page, playwright }) => {
    // O administrador grava as duas paletas pela API real (a revalidação do portal é a do PUT).
    const admin = await playwright.request.newContext({ baseURL });
    const login = await admin.post("/api/auth/sign-in/email", {
      headers: { "x-forwarded-for": "10.60.70.1" },
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    expect(login.status()).toBe(200);
    const saved = await admin.put("/api/configuration", { data: { siteName: "Site e2e do tema", ...LIGHT, ...DARK } });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).warnings).toEqual([]);

    // O portal `/` é estático com ISR: a revalidação do PUT o regenera com a paleta do banco.
    let portal = "";
    let cacheState = "";
    for (let attempt = 0; attempt < 10 && !portal.includes("--vitrine-light-primary"); attempt++) {
      const response = await admin.get("/");
      cacheState = response.headers()["x-nextjs-cache"] ?? "(sem cabeçalho)";
      portal = await response.text();
      if (!portal.includes("--vitrine-light-primary")) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(portal.includes("--vitrine-light-primary:#1d4ed8"), `portal regenerado (x-nextjs-cache: ${cacheState})`).toBe(true);
    expect(portal).toContain("--vitrine-dark-primary:#93c5fd");
    expect(portal.match(/<html[^>]*>/)?.[0]).not.toContain("style=");
    expect(portal).toContain("Site e2e do tema"); // o título do site, no generateMetadata do portal

    // O login pelo navegador usa um IP próprio (o limite de login é por IP).
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "10.60.70.2" });

    // O login, nos dois modos: a cor do botão principal é a primária do modo.
    const primaryOfLoginButton = () => page.getByRole("button", { name: "Entrar" }).evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    expect(await primaryOfLoginButton()).toBe("rgb(29, 78, 216)");
    await expect(page).toHaveTitle("Entrar | Site e2e do tema");

    await page.context().addCookies([{ name: "vitrine-modo", value: "dark", url: baseURL }]);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    expect(await primaryOfLoginButton()).toBe("rgb(147, 197, 253)");

    // O painel, nos dois modos: a variável do envoltório acompanha o modo.
    await signIn(page);
    const wrapperVariable = () =>
      page.locator(".vitrine-tema").first().evaluate((element) => getComputedStyle(element).getPropertyValue("--vitrine-primary").trim());
    expect(await wrapperVariable()).toBe("#93c5fd");
    await page.context().addCookies([{ name: "vitrine-modo", value: "light", url: baseURL }]);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    expect(await wrapperVariable()).toBe("#1d4ed8");
    await expect(page).toHaveTitle("Painel administrativo | Site e2e do tema");

    await admin.dispose();
  });
});
