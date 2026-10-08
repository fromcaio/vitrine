// Contraste por modo no servidor (A-014 Parte 3a, item 3; RN09, RN26, RN27, ADR-026; CT24, CT50): os
// `PUT` de aparência e de configuração trazem em `warnings` os avisos dos DOIS modos; cada modo com aviso
// gera uma notificação `CONTRAST` ao DONO do registro gravado, reaberta a cada ocorrência pela chave de
// deduplicação (`contrast:{modo}` na aparência, `contrast-site:{modo}` no site) e resolvida quando o modo
// passa a atender. better-auth real sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import * as appearanceRoute from "@/app/api/appearance/route";
import * as configurationRoute from "@/app/api/configuration/route";
import * as notificationsRoute from "@/app/api/notifications/route";
import { prisma } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

// Paletas que reprovam (claro: contra o branco; noturno: contra #0A0A0A) e paletas seguras.
const BAD_LIGHT = { primaryColor: "#facc15", secondaryColor: "#94a3b8", accentColor: "#fde68a" };
const BAD_DARK = { darkPrimaryColor: "#1a1a1a", darkSecondaryColor: "#202020", darkAccentColor: "#141414" };
const GOOD_LIGHT = { primaryColor: "#1d4ed8", secondaryColor: "#1e293b", accentColor: "#b45309" };
const GOOD_DARK = { darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" };

const putAppearance = (body, cookie) =>
  appearanceRoute.PUT(apiRequest("/api/appearance", { method: "PUT", body, cookie }));
const putSite = (body) =>
  configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie: admin.cookie }));
const listFor = async (cookie) => (await (await notificationsRoute.GET(apiRequest("/api/notifications", { cookie }))).json());
const byKey = (userId) => prisma.notification.findMany({ where: { userId, type: "CONTRAST" }, orderBy: { dedupeKey: "asc" } });
const fields = (warnings) => warnings.map((warning) => warning.field);

describe("os avisos dos dois modos em `warnings`", () => {
  it("aparência: modo claro e noturno ruins trazem os seis avisos, o noturno com o prefixo dark", async () => {
    const response = await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);

    expect(response.status).toBe(200);
    expect(fields((await response.json()).warnings)).toEqual([
      "primaryColor",
      "secondaryColor",
      "accentColor",
      "darkPrimaryColor",
      "darkSecondaryColor",
      "darkAccentColor",
    ]);
  });

  it("só o modo noturno ruim: só avisos dark; paletas seguras: lista vazia", async () => {
    const dark = await (await putAppearance({ ...GOOD_LIGHT, ...BAD_DARK }, ana.cookie)).json();
    expect(fields(dark.warnings).every((field) => field.startsWith("dark"))).toBe(true);
    expect(dark.warnings).toHaveLength(3);

    const safe = await (await putAppearance({ ...GOOD_LIGHT, ...GOOD_DARK }, ana.cookie)).json();
    expect(safe.warnings).toEqual([]);
  });

  it("a configuração do site também traz os dois modos", async () => {
    const body = await (await putSite({ ...GOOD_LIGHT, ...BAD_DARK })).json();

    expect(fields(body.warnings)).toEqual(["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"]);
  });
});

describe("a notificação CONTRAST por modo, ao dono do registro (RN26)", () => {
  it("aparência: uma notificação por modo com aviso, ao usuário, com a chave contrast:{modo}", async () => {
    await putAppearance({ ...BAD_LIGHT, ...GOOD_DARK }, ana.cookie);

    const [only, ...others] = await byKey(ana.id);
    expect(others).toEqual([]);
    expect(only).toMatchObject({ userId: ana.id, type: "CONTRAST", severity: "WARNING", dedupeKey: "contrast:light" });
    expect(JSON.parse(only.data)).toEqual({
      mode: "light",
      scope: "appearance",
      warnings: [
        { field: "primaryColor", ratio: 1.53, minimum: 4.5 },
        { field: "secondaryColor", ratio: 2.56, minimum: 4.5 },
        { field: "accentColor", ratio: 1.24, minimum: 3 },
      ],
    });
  });

  it("os dois modos ruins geram duas notificações, uma por chave", async () => {
    await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);

    const notices = await byKey(ana.id);
    expect(notices.map((notice) => notice.dedupeKey)).toEqual(["contrast:dark", "contrast:light"]);
    expect(JSON.parse(notices[0].data)).toMatchObject({ mode: "dark", scope: "appearance" });
  });

  it("paleta segura: nenhuma notificação é criada", async () => {
    await putAppearance({ ...GOOD_LIGHT, ...GOOD_DARK }, ana.cookie);

    expect(await prisma.notification.count()).toBe(0);
  });

  it("o dono é quem grava: a notificação não vai ao administrador nem a outro usuário", async () => {
    await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);

    expect(await byKey(admin.userId)).toEqual([]);
    expect(await byKey(beto.id)).toEqual([]);
    expect((await byKey(ana.id)).length).toBe(2);
  });

  it("site: a notificação vai ao administrador que gravou, com a chave contrast-site:{modo}", async () => {
    await putSite({ ...BAD_LIGHT, ...GOOD_DARK });

    const [only, ...others] = await byKey(admin.userId);
    expect(others).toEqual([]);
    expect(only).toMatchObject({ dedupeKey: "contrast-site:light" });
    expect(JSON.parse(only.data)).toMatchObject({ mode: "light", scope: "site" });
    expect(await byKey(ana.id)).toEqual([]);
  });

  it("o administrador tem os dois registros e as chaves não colidem: aparência e site convivem", async () => {
    await putAppearance({ ...BAD_LIGHT, ...GOOD_DARK }, admin.cookie);
    await putSite({ ...BAD_LIGHT, ...GOOD_DARK });

    expect((await byKey(admin.userId)).map((notice) => notice.dedupeKey)).toEqual(["contrast-site:light", "contrast:light"]);

    // Corrigir o site resolve só a do site; a da aparência continua aberta.
    await putSite({ ...GOOD_LIGHT });
    const [site, appearance] = await byKey(admin.userId);
    expect(site.resolvedAt).toBeInstanceOf(Date);
    expect(appearance.resolvedAt).toBeNull();
  });
});

describe("deduplicação, reabertura e resolução (CT50)", () => {
  it("a mesma paleta ruim, salva duas vezes, gera uma só notificação por modo", async () => {
    await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);
    await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);

    expect(await prisma.notification.count({ where: { userId: ana.id } })).toBe(2);
  });

  it("salvar de novo reabre a notificação já lida (readAt volta a nulo)", async () => {
    await putAppearance({ ...BAD_LIGHT }, ana.cookie);
    await prisma.notification.updateMany({ where: { userId: ana.id }, data: { readAt: new Date() } });
    expect((await listFor(ana.cookie)).unreadCount).toBe(0);

    await putAppearance({ siteName: "Só o nome" }, ana.cookie); // a paleta gravada continua ruim

    expect((await listFor(ana.cookie)).unreadCount).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ana.id } })).toBe(1);
  });

  it("a paleta corrigida resolve a notificação do modo, que sai do contador de não lidas", async () => {
    await putAppearance({ ...BAD_LIGHT, ...BAD_DARK }, ana.cookie);
    expect((await listFor(ana.cookie)).unreadCount).toBe(2);

    await putAppearance({ ...GOOD_LIGHT }, ana.cookie);

    const [dark, light] = await byKey(ana.id);
    expect(light.resolvedAt).toBeInstanceOf(Date);
    expect(dark.resolvedAt).toBeNull(); // o modo noturno continua ruim
    expect((await listFor(ana.cookie)).unreadCount).toBe(1);
  });

  it("a paleta ruim de novo reabre a notificação resolvida", async () => {
    await putAppearance({ ...BAD_LIGHT }, ana.cookie);
    await putAppearance({ ...GOOD_LIGHT }, ana.cookie);
    expect((await byKey(ana.id))[0].resolvedAt).toBeInstanceOf(Date);

    await putAppearance({ ...BAD_LIGHT }, ana.cookie);

    const [notice, ...others] = await byKey(ana.id);
    expect(others).toEqual([]);
    expect(notice.resolvedAt).toBeNull();
  });

  it("resolver o que não existe não cria nada", async () => {
    await putAppearance({ ...GOOD_LIGHT, ...GOOD_DARK }, ana.cookie);
    await putAppearance({ siteName: "Outro nome" }, ana.cookie);

    expect(await prisma.notification.count()).toBe(0);
  });

  it("a notificação sai da API em português, com o modo e as cores", async () => {
    await putAppearance({ ...BAD_LIGHT, ...GOOD_DARK }, ana.cookie);

    const { data, unreadCount } = await listFor(ana.cookie);

    expect(unreadCount).toBe(1);
    expect(data[0]).toMatchObject({ type: "CONTRAST", severity: "WARNING", title: "Contraste insuficiente no modo claro" });
    expect(data[0].text).toContain("a cor primária com 1,53:1 (mínimo de 4,5:1)");
    expect(data[0].text).toContain("a aparência do seu espaço");
  });
});

describe("a gravação não depende de a paleta ser boa", () => {
  it("o aviso não bloqueia: responde 200 e grava a paleta ruim", async () => {
    const response = await putAppearance({ ...BAD_LIGHT }, ana.cookie);

    expect(response.status).toBe(200);
    expect(await prisma.appearance.findFirstOrThrow({ where: { ownerId: ana.id } })).toMatchObject(BAD_LIGHT);
  });
});

// ADR-038: a paleta nula herda a do sistema; o contraste vale para a aparência EFETIVA. Antes, a rota
// calculava sobre a linha gravada e respondia 500 (TypeError: "Cor fora do formato #RRGGBB: null") a
// quem não personalizou as duas paletas.
describe("a paleta herdada: o contraste vale sobre a aparência efetiva", () => {
  it("tudo nulo (só o nome): 200 e, com as paletas padrão do sistema, nenhum aviso", async () => {
    const response = await putAppearance({ siteName: "Só o nome" }, ana.cookie);

    expect(response.status).toBe(200);
    expect((await response.json()).warnings).toEqual([]);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("só o modo claro definido: o noturno herda e o aviso vem só do que vale (aqui, o claro)", async () => {
    const body = await (await putAppearance({ ...BAD_LIGHT }, ana.cookie)).json();

    expect(body.data).toMatchObject({ ...BAD_LIGHT, darkPrimaryColor: null });
    expect(fields(body.warnings)).toEqual(["primaryColor", "secondaryColor", "accentColor"]);
  });

  it("só o modo noturno definido: o claro herda e o aviso vem só do noturno", async () => {
    const body = await (await putAppearance({ ...BAD_DARK }, ana.cookie)).json();

    expect(body.data).toMatchObject({ ...BAD_DARK, primaryColor: null });
    expect(fields(body.warnings)).toEqual(["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"]);
  });

  it("o modo herdado é conferido contra a paleta do SISTEMA, e não contra um padrão fixo", async () => {
    await putSite({ ...BAD_DARK });

    const body = await (await putAppearance({ siteName: "Herdeira" }, ana.cookie)).json();

    expect(fields(body.warnings)).toEqual(["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"]);
  });

  it("uma ou duas cores de uma paleta: 422, e a aparência não muda", async () => {
    const response = await putAppearance({ primaryColor: "#112233", secondaryColor: "#223344" }, ana.cookie);

    expect(response.status).toBe(422);
    expect(await prisma.appearance.count({ where: { ownerId: ana.id } })).toBe(0);
  });
});
