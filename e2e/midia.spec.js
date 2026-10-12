// Mídia, rodapé e avatar, pela API e pela interface, sobre a aplicação de PRODUÇÃO (A-029; RF24, RF35, RF36; RN17,
// RN19, RN29; ADR-034, ADR-035; CT57 a CT63): enviar, servir (`/media`, imutável), trocar (a antiga some: 404) e
// remover o logotipo, o favicon e o avatar; recusar SVG, GIF, HTML renomeado, ZIP, arquivo de 0 byte, bomba de
// pixels e 2 MB + 1 (413), sem eco do arquivo; o EXIF com GPS que não sai; o favicon no `<head>` do espaço; o
// avatar no diretório da `/`; o rodapé por ícones (https, e-mail); a moderação do avatar (motivo, notificação); as
// combinações da barra superior e a regra "pelo menos um"; o título do diretório. A CSP de produção MANTÉM `https:`
// no `img-src` (ADR-034, item 11): a guarda de ./support/test.js falha em qualquer violação, e vale em todo o fluxo
// (a pré-visualização `data:` e o `/media` real incluídos). Contas FICTÍCIAS. As esperas são por estado (a resposta,
// o texto, o cabeçalho), nunca por tempo fixo.
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { waitForHydration } from "./support/auth.js";
import { adminLogin, apiLogin, cacheState, createAccount, createAdminAccount, createContent, fetchUntil, openSession, removeAccount } from "./support/accounts.js";
import { ADMIN } from "./support/env.js";
import { expect, test } from "./support/test.js";

const ANA = { email: "ana-midia-e2e@exemplo.test", name: "Ana Mídia", handle: "mid-ana", password: "senha-ana-mid-9" };
const BETO = { email: "beto-midia-e2e@exemplo.test", name: "Beto Mídia", handle: "mid-beto", password: "senha-beto-mid-9" };
// O envio de imagem tem limite de taxa próprio (10 por minuto por usuário): cada grupo de testes usa a sua conta.
const RAI = { email: "rai-midia-e2e@exemplo.test", name: "Rai Mídia", handle: "mid-rai", password: "senha-rai-mid-9" };
const CRIS = { email: "cris-midia-e2e@exemplo.test", name: "Cris Mídia", handle: "mid-cris", password: "senha-cris-mid-9" };
// A remoção do avatar de outro usuário (/api/users, grupo `users`, 20 por minuto por usuário) é feita pela INTERFACE, que não
// espera o Retry-After de um 429: um administrador só dela evita depender da janela gasta pelos specs anteriores.
const ADMIN_UI = { email: "admin-ui-midia-e2e@exemplo.test", name: "Administrador da Interface de Mídia", password: "senha-admin-ui-mid-9" };
const SENTINEL = "SEGREDO-DO-GPS-4242";

const png = (width = 300, height = 200, background = "#c81e3c") => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const jpegWithExif = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: "#1e90ff" } })
    .withExif({ IFD0: { Copyright: SENTINEL }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 32/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "46/1 38/1 0/1" } })
    .jpeg()
    .toBuffer();

/** PNG sintético com IHDR de 30000x30000 (a bomba de pixels). */
function bombPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(30000, 0);
  header.writeUInt32BE(30000, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", Buffer.alloc(0)), chunk("IEND", Buffer.alloc(0))]);
}

/** O corpo `multipart` com o arquivo no campo `file`. */
const file = (buffer, { name = "imagem.png", mimeType = "image/png" } = {}) => ({ multipart: { file: { name, mimeType, buffer } } });

test.describe.serial("mídia, rodapé e avatar", () => {
  /** @type {import("@playwright/test").APIRequestContext} */
  let admin;
  /** @type {import("@playwright/test").APIRequestContext} */
  let ana;
  /** @type {import("@playwright/test").APIRequestContext} */
  let beto;
  /** @type {import("@playwright/test").APIRequestContext} */
  let rai;
  /** @type {import("@playwright/test").APIRequestContext} */
  let cris;
  /** @type {{ id: string }} */
  let anaAccount;
  /** @type {{ id: string, email: string, password: string }} */
  let adminUi;

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(120_000);
    admin = await adminLogin(playwright);
    anaAccount = await createAccount(playwright, admin, ANA);
    const betoAccount = await createAccount(playwright, admin, BETO);
    ana = await apiLogin(playwright, anaAccount);
    beto = await apiLogin(playwright, betoAccount);
    rai = await apiLogin(playwright, await createAccount(playwright, admin, RAI));
    cris = await apiLogin(playwright, await createAccount(playwright, admin, CRIS));
    adminUi = await createAdminAccount(playwright, admin, ADMIN_UI);
    for (const [owner, title] of /** @type {const} */ ([[ana, "Início da Ana"], [beto, "Início do Beto"]])) {
      await createContent(owner, { title, slug: "inicio", type: "DOCUMENT", body: `Texto: ${title}.` });
    }
  });

  test.afterAll(async () => {
    // Devolve o sistema ao estado de antes: sem imagem, sem rodapé, com o título padrão do diretório.
    // O administrador da interface sai: os testes do "último administrador" (usuarios.spec) supõem um só.
    if (adminUi) await removeAccount(admin, adminUi.id);
    await admin?.delete("/api/configuration/logo");
    await admin?.delete("/api/configuration/favicon");
    await admin?.put("/api/configuration/footer-links", { data: { links: [] } });
    await admin?.put("/api/configuration", { data: { directoryTitle: "Espaços", showLogo: true, showName: true } });
    await admin?.dispose();
    await ana?.dispose();
    await beto?.dispose();
    await rai?.dispose();
    await cris?.dispose();
  });

  test("logotipo pela API: enviar, servir (público, imutável), trocar (a antiga some) e remover", async ({ request }) => {
    const sent = await rai.put("/api/appearance/logo", file(await png(1600, 800)));
    expect(sent.status()).toBe(200);
    const first = (await sent.json()).data;
    expect(first).toEqual({ id: expect.any(String), url: `/media/${first.id}`, width: 512, height: 256 });

    // Público (sem cookie), com o tipo fixo da saída, nosniff, ETag e o cache imutável.
    const served = await request.get(first.url);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/webp");
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");
    expect(served.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    const etag = served.headers().etag;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect((await served.body()).subarray(0, 4).toString("ascii")).toBe("RIFF");
    const cached = await request.get(first.url, { headers: { "if-none-match": etag } });
    expect(cached.status()).toBe(304);

    // Trocar: id novo, e a URL antiga passa a dar 404 (a imagem antiga é apagada).
    const replaced = await rai.put("/api/appearance/logo", file(await png(400, 400, "#00aa55")));
    const second = (await replaced.json()).data;
    expect(second.id).not.toBe(first.id);
    expect((await request.get(first.url)).status()).toBe(404);
    expect((await request.get(second.url)).status()).toBe(200);

    expect((await rai.delete("/api/appearance/logo")).status()).toBe(204);
    expect((await request.get(second.url)).status()).toBe(404);
    expect((await rai.delete("/api/appearance/logo")).status()).toBe(204); // idempotente
  });

  test("o EXIF com GPS NÃO sai: os bytes servidos em /media não têm o metadado", async ({ request }) => {
    const input = await jpegWithExif();
    expect(input.includes(Buffer.from(SENTINEL))).toBe(true);

    const sent = await rai.put("/api/users/me/avatar", file(input, { name: "foto.jpg", mimeType: "image/jpeg" }));
    expect(sent.status()).toBe(200);
    const avatar = (await sent.json()).data;
    expect(avatar).toMatchObject({ width: 256, height: 256 });
    const served = await (await request.get(avatar.url)).body();

    expect(served.includes(Buffer.from(SENTINEL))).toBe(false);
    expect(served.includes(Buffer.from("Exif"))).toBe(false);
    expect((await sharp(served).metadata()).exif).toBeUndefined();
    expect((await rai.delete("/api/users/me/avatar")).status()).toBe(204);
  });

  test("recusas: SVG, GIF, HTML renomeado, ZIP, 0 byte, bomba de pixels (422 sem eco), 2 MB + 1 (413) e JSON (400)", async () => {
    const hostile = [
      ["SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "image/svg+xml"],
      ["GIF", Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;"), "image/gif"],
      ["HTML .png", Buffer.from("<!doctype html><script>alert(1)</script>"), "image/png"],
      ["ZIP", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 1, 2, 3, 4]), "application/zip"],
      ["0 byte", Buffer.alloc(0), "image/png"],
      ["PNG declarado como JPEG", await png(), "image/jpeg"],
      ["bomba de pixels", bombPng(), "image/png"],
    ];
    for (const [name, buffer, mimeType] of hostile) {
      const response = await cris.put("/api/users/me/avatar", file(buffer, { name: "segredo-do-arquivo.png", mimeType }));
      const text = await response.text();
      expect(response.status(), name).toBe(422);
      const { error } = JSON.parse(text);
      expect(error.code, name).toBe("INVALID_IMAGE");
      expect(error.details, name).toEqual([{ field: "file" }]);
      expect(text, name).not.toContain("segredo-do-arquivo");
      expect(text, name).not.toMatch(/svg|script|alert/i);
    }

    const base = await png(1500, 1500);
    const tooBig = Buffer.concat([base, Buffer.alloc(2 * 1024 * 1024 + 1 - base.length)]);
    const big = await cris.put("/api/users/me/avatar", file(tooBig));
    expect(big.status()).toBe(413);
    expect((await big.json()).error.code).toBe("PAYLOAD_TOO_LARGE");

    const asJson = await cris.put("/api/users/me/avatar", { data: { file: "x" } });
    expect(asJson.status()).toBe(400);

    // Nada foi gravado.
    expect((await (await cris.get("/api/users/me")).json()).data.avatarImageId).toBeNull();
  });

  test("a imagem de outro não se troca: não há rota que o faça (405), e o usuário comum não grava o sistema (403)", async () => {
    expect((await beto.put(`/api/users/${anaAccount.id}/avatar`, file(await png()))).status()).toBe(405);
    expect((await admin.put(`/api/users/${anaAccount.id}/avatar`, file(await png()))).status()).toBe(405);
    expect((await ana.put("/api/configuration/logo", file(await png()))).status()).toBe(403);
    expect((await ana.put("/api/configuration/favicon", file(await png()))).status()).toBe(403);
    expect((await ana.delete(`/api/users/${anaAccount.id}/avatar?reason=teste`)).status()).toBe(403);
  });

  test("logotipo e favicon do espaço pela interface: pré-visualização, envio, e o favicon vai ao <head> do espaço", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ANA);
    await page.goto("/admin/aparencia");
    await expect(page.getByRole("heading", { name: "Aparência do seu espaço", level: 1 })).toBeVisible();
    await waitForHydration(page);

    // Logotipo: a pré-visualização local é um data: URL (a CSP não admite blob:), e o envio mostra a imagem de /media.
    await page.getByLabel("Arquivo: logotipo").setInputFiles({ name: "meu-logo.png", mimeType: "image/png", buffer: await png(900, 300) });
    await expect(page.getByRole("img", { name: "Pré-visualização: logotipo" })).toHaveAttribute("src", /^data:image\/png;base64,/);
    await page.getByRole("button", { name: "Enviar logotipo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Logotipo enviado." })).toBeVisible();
    const logo = page.getByRole("img", { name: "Logotipo atual" });
    await expect(logo).toHaveAttribute("src", /^\/media\/[A-Za-z0-9_-]+$/);
    const logoUrl = /** @type {string} */ (await logo.getAttribute("src"));

    // Favicon.
    await page.getByLabel("Arquivo: favicon").setInputFiles({ name: "icone.png", mimeType: "image/png", buffer: await png(200, 200, "#7e22ce") });
    await page.getByRole("button", { name: "Enviar favicon" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Favicon enviado." })).toBeVisible();
    const faviconUrl = /** @type {string} */ (await page.getByRole("img", { name: "Favicon atual" }).getAttribute("src"));
    expect(faviconUrl).toMatch(/^\/media\/[A-Za-z0-9_-]+$/);

    // O espaço (ISR) mostra o logotipo na barra e o favicon no <head> depois da revalidação; o do Beto, sem favicon, não.
    const space = await fetchUntil(request, `/${ANA.handle}/inicio`, (body) => body.includes(`href="${faviconUrl}"`));
    expect(space.body).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*href="${faviconUrl}"|<link[^>]*href="${faviconUrl}"[^>]*rel="icon"`));
    expect(space.body).toContain(`src="${logoUrl}"`);
    const betoSpace = await (await request.get(`/${BETO.handle}/inicio`)).text();
    expect(betoSpace).not.toContain(faviconUrl);
    expect(betoSpace).not.toContain(logoUrl);
    expect(cacheState((await fetchUntil(request, `/${ANA.handle}/inicio`, (_b, r) => cacheState(r) === "HIT")).response)).toBe("HIT");

    // O navegador carrega o logotipo (a imagem de /media passa pela CSP de produção) e a barra o mostra.
    await page.goto(`/${ANA.handle}/inicio`);
    await expect(page.locator(`img[src="${logoUrl}"]`).first()).toBeVisible();
    expect(await page.locator(`img[src="${logoUrl}"]`).first().evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(`link[rel="icon"][href="${faviconUrl}"]`)).toHaveCount(1);
    // O favicon.ico de reserva NÃO concorre com o enviado (só o do espaço no <head>); sem favicon enviado, é ele que vale.
    expect(await page.locator('link[rel~="icon"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([faviconUrl]);
    await page.goto(`/${BETO.handle}/inicio`);
    expect(await page.locator('link[rel~="icon"]').evaluateAll((links) => links.map((link) => (link.getAttribute("href") ?? "").split("?")[0]))).toEqual(["/favicon.ico"]);

    // Remover pela interface volta ao logotipo embutido.
    await page.goto("/admin/aparencia");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Remover logotipo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Logotipo removido." })).toBeVisible();
    await context.close();
    expect((await request.get(logoUrl)).status()).toBe(404);
  });

  test("avatar pela interface: aparece no diretório da / com o nome e o handle", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ANA);
    await page.goto("/admin/perfil");
    await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
    await waitForHydration(page);

    await page.getByLabel("Arquivo: avatar").setInputFiles({ name: "eu.jpg", mimeType: "image/jpeg", buffer: await jpegWithExif() });
    await page.getByRole("button", { name: "Enviar avatar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Avatar enviado." })).toBeVisible();
    const avatarUrl = /** @type {string} */ (await page.getByRole("img", { name: "Avatar atual" }).getAttribute("src"));
    expect(avatarUrl).toMatch(/^\/media\/[A-Za-z0-9_-]+$/);

    // O portal (ISR, revalidado por caminho literal) traz o avatar no cartão do espaço.
    await fetchUntil(request, "/", (body) => body.includes(avatarUrl));
    await page.goto("/");
    const card = page.locator("article", { hasText: `@${ANA.handle}` });
    await expect(card.getByRole("link", { name: ANA.name })).toBeVisible();
    await expect(card.locator(`img[src="${avatarUrl}"]`)).toBeVisible();
    expect(await card.locator(`img[src="${avatarUrl}"]`).evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0);
    // Quem não tem avatar mostra as iniciais, sem imagem.
    await expect(page.locator("article", { hasText: `@${BETO.handle}` }).locator("img")).toHaveCount(0);
    await context.close();
  });

  test("moderação do avatar: o administrador remove com o motivo (obrigatório) e o dono é notificado", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, adminUi);
    await page.goto("/admin/usuarios");
    await expect(page.getByRole("region", { name: "Usuários" })).toBeVisible();
    await waitForHydration(page);
    await page.getByLabel("Buscar por e-mail ou nome").fill(ANA.email);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    const actions = page.getByRole("group", { name: `Ações de ${ANA.name}` });
    await expect(actions).toBeVisible();

    const avatarUrl = (await (await ana.get("/api/users/me")).json()).data.avatarImageId;
    expect(avatarUrl).toBeTruthy();

    await actions.getByRole("button", { name: `Remover avatar: ${ANA.name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Remover o avatar de ${ANA.name}` });
    await dialog.getByRole("button", { name: "Remover avatar" }).click(); // sem o motivo: recusado, o diálogo segue aberto
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Motivo").fill("Imagem imprópria para o ambiente");
    await dialog.getByRole("button", { name: "Remover avatar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText(`O avatar de ${ANA.name} foi removido.`)).toBeVisible();
    await context.close();

    expect((await request.get(`/media/${avatarUrl}`)).status()).toBe(404);
    expect((await (await ana.get("/api/users/me")).json()).data.avatarImageId).toBeNull();
    const notifications = (await (await ana.get("/api/notifications")).json()).data;
    const moderation = notifications.find((item) => item.data?.event === "AVATAR_REMOVED");
    expect(moderation).toMatchObject({ type: "MODERATION", data: { reason: "Imagem imprópria para o ambiente" } });
    expect(JSON.stringify(moderation)).toContain("Imagem imprópria para o ambiente");
    // Sem o motivo, a API recusa; sem avatar, 404.
    expect((await admin.delete(`/api/users/${anaAccount.id}/avatar`)).status()).toBe(422);
    expect((await admin.delete(`/api/users/${anaAccount.id}/avatar?reason=outra`)).status()).toBe(404);
  });

  test("rodapé: pela interface (um link https no espaço) e pela API (e-mail, ordem, e as recusas da RN17)", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ANA);
    await page.goto("/admin/aparencia");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Adicionar link" }).click();
    await page.getByLabel("Endereço (https://…)").fill("https://github.com/ana-midia");
    await page.getByRole("button", { name: "Salvar o rodapé" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Rodapé salvo/ })).toBeVisible();
    await context.close();

    const saved = await fetchUntil(request, `/${ANA.handle}/inicio`, (body) => body.includes("https://github.com/ana-midia"));
    expect(saved.body).toMatch(/<a[^>]*href="https:\/\/github\.com\/ana-midia"[^>]*rel="noopener noreferrer"|<a[^>]*rel="noopener noreferrer"[^>]*href="https:\/\/github\.com\/ana-midia"/);

    // API: ordem, e-mail (mailto:), a lista inteira substituída.
    const links = [
      { icon: "website", url: "https://ana.exemplo.com" },
      { icon: "email", url: "mailto:ana@exemplo.com" },
      { icon: "github", url: "https://github.com/ana-midia" },
    ];
    expect((await ana.put("/api/footer-links", { data: { links } })).status()).toBe(200);
    expect((await (await ana.get("/api/footer-links")).json()).data).toEqual(links);
    const mailed = await fetchUntil(request, `/${ANA.handle}/inicio`, (body) => body.includes("mailto:ana@exemplo.com"));
    expect(mailed.body.indexOf("https://ana.exemplo.com")).toBeLessThan(mailed.body.indexOf("mailto:ana@exemplo.com"));

    // As recusas (RN17): javascript:, data:, http:, sem esquema, ícone repetido, e-mail sem mailto:; nada muda.
    for (const bad of [
      [{ icon: "github", url: "javascript:alert(1)" }],
      [{ icon: "website", url: "data:text/html,<script>alert(1)</script>" }],
      [{ icon: "github", url: "http://github.com/ana" }],
      [{ icon: "github", url: "github.com/ana" }],
      [{ icon: "email", url: "https://nao-e-mailto.test" }],
      [{ icon: "github", url: "https://a.test" }, { icon: "github", url: "https://b.test" }],
    ]) {
      const refused = await ana.put("/api/footer-links", { data: { links: bad } });
      expect(refused.status(), JSON.stringify(bad)).toBe(422);
      expect((await refused.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect((await (await ana.get("/api/footer-links")).json()).data).toEqual(links);

    // O rodapé do Beto não herda o da Ana nem o do sistema.
    expect((await (await beto.get("/api/footer-links")).json()).data).toEqual([]);
    expect((await ana.get("/api/configuration/footer-links")).status()).toBe(403);
    expect((await ana.put("/api/footer-links", { data: { links: [] } })).status()).toBe(200);
  });

  test("a barra superior: logotipo e nome, só o logotipo, só o nome; os dois desligados é 422 (a regra é do servidor)", async ({ browser, request }) => {
    const NAME = "Espaço do Beto";
    const sent = await beto.put("/api/appearance/logo", file(await png(300, 100, "#0e7490")));
    const logo = (await sent.json()).data.url;
    expect((await beto.put("/api/appearance", { data: { siteName: NAME, showLogo: true, showName: true } })).status()).toBe(200);
    const header = async (page) => {
      await page.goto(`/${BETO.handle}/inicio`);
      return page.locator("header").first();
    };
    const { context, page } = await openSession(browser, BETO);

    // Os dois: o logotipo (decorativo, alt vazio) e o nome.
    await fetchUntil(request, `/${BETO.handle}/inicio`, (body) => body.includes(`src="${logo}"`));
    let bar = await header(page);
    await expect(bar.locator(`img[src="${logo}"]`)).toHaveAttribute("alt", "");
    await expect(bar.getByText(NAME)).toBeVisible();

    // Só o logotipo: o nome some da barra e a imagem passa a ter o nome acessível do espaço.
    expect((await beto.put("/api/appearance", { data: { showName: false } })).status()).toBe(200);
    await fetchUntil(request, `/${BETO.handle}/inicio`, (body) => body.includes(`alt="${NAME}"`));
    bar = await header(page);
    await expect(bar.locator(`img[src="${logo}"]`)).toHaveAttribute("alt", NAME);
    await expect(bar.getByText(NAME)).toHaveCount(0);

    // Só o nome: sem imagem na barra.
    expect((await beto.put("/api/appearance", { data: { showName: true, showLogo: false } })).status()).toBe(200);
    await fetchUntil(request, `/${BETO.handle}/inicio`, (body) => !body.includes(`src="${logo}"`));
    bar = await header(page);
    await expect(bar.locator("img")).toHaveCount(0);
    await expect(bar.getByText(NAME)).toBeVisible();
    await context.close();

    // "Pelo menos um": os dois desligados é 422 com field showName, e nada muda (no espaço e no sistema).
    const none = await beto.put("/api/appearance", { data: { showLogo: false, showName: false } });
    expect(none.status()).toBe(422);
    expect((await none.json()).error.details[0].field).toBe("showName");
    expect((await (await beto.get("/api/appearance")).json()).data).toMatchObject({ showLogo: false, showName: true });
    expect((await admin.put("/api/configuration", { data: { showLogo: false, showName: false } })).status()).toBe(422);

    // Restaura: o espaço volta a herdar o nome, com os dois ligados, e sem logotipo próprio.
    expect((await beto.put("/api/appearance", { data: { siteName: null, showLogo: true, showName: true } })).status()).toBe(200);
    expect((await beto.delete("/api/appearance/logo")).status()).toBe(204);
  });

  test("o título do diretório da / é editável pelo administrador (e o logotipo do sistema aparece no portal)", async ({ browser, request }) => {
    const { context, page } = await openSession(browser, ADMIN);
    await page.goto("/admin/pagina-inicial");
    await expect(page.getByRole("heading", { name: "Página inicial do sistema", level: 1 })).toBeVisible();
    await waitForHydration(page);
    await page.getByLabel("Título do diretório").fill("Pessoas da turma");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /salv/i }).first()).toBeVisible();
    await context.close();

    const portal = await fetchUntil(request, "/", (body) => body.includes("Pessoas da turma"));
    expect(portal.body).toContain("Pessoas da turma");

    // O logotipo do SISTEMA vai ao portal e, por herança, ao espaço de quem não enviou o próprio.
    const sent = await admin.put("/api/configuration/logo", file(await png(500, 200, "#be123c")));
    expect(sent.status()).toBe(200);
    const systemLogo = (await sent.json()).data.url;
    await fetchUntil(request, "/", (body) => body.includes(`src="${systemLogo}"`));
    const inherited = await fetchUntil(request, `/${BETO.handle}/inicio`, (body) => body.includes(`src="${systemLogo}"`));
    expect(inherited.body).toContain(`src="${systemLogo}"`);
    // A Ana tem logotipo próprio? Não (removido antes): herda também. O favicon do sistema entra no <head>.
    const favicon = await admin.put("/api/configuration/favicon", file(await png(128, 128, "#15803d")));
    const faviconUrl = (await favicon.json()).data.url;
    const withIcon = await fetchUntil(request, "/", (body) => body.includes(`href="${faviconUrl}"`));
    expect(withIcon.body).toContain(`href="${faviconUrl}"`);
    expect((await fetchUntil(request, `/${BETO.handle}/inicio`, (body) => body.includes(`href="${faviconUrl}"`))).body).toContain(faviconUrl);
  });
});
