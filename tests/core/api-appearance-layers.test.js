// A aparência em duas camadas na API (A-031; D-40, ADR-038; RF41, RN30, RN31; CT64, CT68): o `GET
// /api/appearance` devolve a aparência crua e, ao lado, a efetiva e o que herda; o `PUT` aceita `null`
// (volta a herdar) e recusa a paleta incompleta e a barra sem logo nem nome; o `PUT /api/configuration`
// aceita a barra, o par de ícones e o título do diretório; e mudar o sistema revalida, por caminhos
// literais, só os espaços que herdam o que mudou. better-auth real sobre o banco temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as appearanceRoute from "@/app/api/appearance/route";
import * as configurationRoute from "@/app/api/configuration/route";
import { createContent, updateAppearance, updateConfiguration } from "@/lib/db";
import { apiRequest, createAdminSession, createUserSession, resetDatabase } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

const LIGHT = { primaryColor: "#1d4ed8", secondaryColor: "#1e293b", accentColor: "#b45309" };
const DARK = { darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" };
const NO_LIGHT = { primaryColor: null, secondaryColor: null, accentColor: null };

const getAppearance = (cookie) => appearanceRoute.GET(apiRequest("/api/appearance", { cookie }));
const putAppearance = (body, cookie) => appearanceRoute.PUT(apiRequest("/api/appearance", { method: "PUT", body, cookie }));
const putSite = (body, cookie = admin.cookie) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie }));

/** Um espaço com uma raiz publicada (RN28): só ele entra no diretório e na revalidação dos que herdam. */
async function publish(user, slug) {
  await createContent({ title: slug, slug, type: "DOCUMENT", authorId: user.id, body: "x" });
}

const pages = () => vi.mocked(revalidatePath).mock.calls.map((call) => call[0]).sort();

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

describe("GET /api/appearance: a crua, a efetiva e o que herda", () => {
  it("sem nada salvo: data com os nulos, effective com o sistema e inherits verdadeiro", async () => {
    await updateConfiguration({ siteName: "Sistema" });

    const body = await (await getAppearance(ana.cookie)).json();

    expect(body.data).toMatchObject({ siteName: null, primaryColor: null, darkPrimaryColor: null, showLogo: true, showName: true });
    expect(body.effective).toMatchObject({ siteName: "Sistema", primaryColor: "#2563eb", darkPrimaryColor: "#60a5fa" });
    expect(body.effective).not.toHaveProperty("inherits");
    expect(body.inherits).toMatchObject({ lightPalette: true, darkPalette: true, siteName: true });
  });

  it("com a paleta clara e o nome próprios: data os traz, effective os mescla e inherits só marca o noturno", async () => {
    await updateAppearance(ana.id, { siteName: "Meu espaço", ...LIGHT });

    const body = await (await getAppearance(ana.cookie)).json();

    expect(body.data).toMatchObject({ siteName: "Meu espaço", ...LIGHT, darkPrimaryColor: null });
    expect(body.effective).toMatchObject({ siteName: "Meu espaço", ...LIGHT, darkPrimaryColor: "#60a5fa" });
    expect(body.inherits).toMatchObject({ lightPalette: false, darkPalette: true, siteName: false });
  });

  it("cada usuário lê só a própria: a de outro nunca aparece", async () => {
    await updateAppearance(ana.id, { siteName: "Espaço da Ana" });

    const body = await (await getAppearance(beto.cookie)).json();

    expect(JSON.stringify(body)).not.toContain("Espaço da Ana");
  });
});

describe("PUT /api/appearance: null herda, e as regras do estado resultante", () => {
  it("null nas três cores de um modo volta a herdar (200, data com os nulos, o outro modo intacto)", async () => {
    await putAppearance({ ...LIGHT, ...DARK }, ana.cookie);

    const response = await putAppearance(NO_LIGHT, ana.cookie);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ ...NO_LIGHT, ...DARK });
  });

  it("siteName null (e vazio) volta a herdar o nome do sistema", async () => {
    await putAppearance({ siteName: "Próprio" }, ana.cookie);
    expect((await (await putAppearance({ siteName: null }, ana.cookie)).json()).data.siteName).toBeNull();

    await putAppearance({ siteName: "Outro" }, ana.cookie);
    expect((await (await putAppearance({ siteName: "  " }, ana.cookie)).json()).data.siteName).toBeNull();
  });

  it.each([
    ["uma cor do modo claro", { primaryColor: "#112233" }, "lightPalette"],
    ["duas cores do modo claro", { primaryColor: "#112233", secondaryColor: "#223344" }, "lightPalette"],
    ["uma cor do modo noturno", { darkAccentColor: "#112233" }, "darkPalette"],
  ])("%s: 422 com field %s e nada gravado", async (_name, body, field) => {
    const response = await putAppearance(body, ana.cookie);

    expect(response.status).toBe(422);
    expect((await response.json()).error.details[0].field).toBe(field);
    const after = await (await getAppearance(ana.cookie)).json();
    expect(after.data).toMatchObject({ primaryColor: null, darkAccentColor: null });
  });

  it("duas cores nulas de uma paleta completa: 422 em darkPalette, e a paleta antiga fica", async () => {
    await putAppearance(DARK, ana.cookie);

    const response = await putAppearance({ darkPrimaryColor: null, darkSecondaryColor: null }, ana.cookie);

    expect(response.status).toBe(422);
    expect((await response.json()).error.details[0].field).toBe("darkPalette");
    expect((await (await getAppearance(ana.cookie)).json()).data).toMatchObject(DARK);
  });

  it("showLogo e showName, os dois falsos: 422 com field showName; um só falso, 200", async () => {
    const both = await putAppearance({ showLogo: false, showName: false }, ana.cookie);
    expect(both.status).toBe(422);
    expect((await both.json()).error.details[0].field).toBe("showName");

    const one = await putAppearance({ showLogo: false }, ana.cookie);
    expect(one.status).toBe(200);
    expect((await one.json()).data).toMatchObject({ showLogo: false, showName: true });

    // O estado resultante conta: desligar o nome com o logo já desligado também é 422.
    expect((await putAppearance({ showName: false }, ana.cookie)).status).toBe(422);
  });

  it("cor com formato inválido, mesmo anulável: 422", async () => {
    expect((await putAppearance({ primaryColor: "azul" }, ana.cookie)).status).toBe(422);
  });
});

describe("PUT /api/configuration: a barra, o par de ícones e o título do diretório", () => {
  it("grava showLogo, showName, modeIconPair e directoryTitle, e os devolve", async () => {
    const response = await putSite({ showLogo: false, modeIconPair: "contrast_half", directoryTitle: "Pessoas" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ showLogo: false, showName: true, modeIconPair: "contrast_half", directoryTitle: "Pessoas" });
  });

  it("os dois interruptores falsos: 422 com field showName", async () => {
    const response = await putSite({ showLogo: false, showName: false });

    expect(response.status).toBe(422);
    expect((await response.json()).error.details[0].field).toBe("showName");
  });

  it.each([
    ["par de ícones fora da lista", { modeIconPair: "estrela" }, "modeIconPair"],
    ["título do diretório vazio", { directoryTitle: "   " }, "directoryTitle"],
    ["título do diretório com 41 caracteres", { directoryTitle: "x".repeat(41) }, "directoryTitle"],
  ])("%s: 422", async (_name, body, field) => {
    const response = await putSite(body);

    expect(response.status).toBe(422);
    expect(JSON.stringify((await response.json()).error.details)).toContain(field);
  });

  it("40 caracteres é o limite: 200 (pontos de código, um emoji conta 1)", async () => {
    expect((await putSite({ directoryTitle: "x".repeat(40) })).status).toBe(200);
    expect((await putSite({ directoryTitle: "😀".repeat(40) })).status).toBe(200);
  });

  it("o usuário comum não grava o sistema: 403", async () => {
    expect((await putSite({ modeIconPair: "lightbulb" }, ana.cookie)).status).toBe(403);
  });

  it("a paleta e o nome do sistema seguem obrigatórios (null é 422), ao contrário da aparência do usuário", async () => {
    expect((await putSite({ primaryColor: null })).status).toBe(422);
    expect((await putSite({ siteName: null })).status).toBe(422);
  });
});

describe("mudar o sistema revalida os espaços que herdam o que mudou (ADR-038, item 6; ADR-030)", () => {
  beforeEach(async () => {
    await publish(ana, "sobre");
    await publish(beto, "sobre");
    // O Beto tem paleta clara e nome próprios; a Ana herda tudo.
    await updateAppearance(beto.id, { siteName: "Do Beto", ...LIGHT });
    vi.mocked(revalidatePath).mockClear();
  });

  it("a paleta CLARA do sistema: o espaço da Ana (herda) e o portal; o do Beto (própria) não", async () => {
    await putSite({ primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333" });

    expect(pages()).toEqual(["/", "/ana", "/ana/sobre"]);
  });

  it("a paleta NOTURNA do sistema: os dois herdam o modo noturno (o Beto só definiu o claro)", async () => {
    await putSite({ darkPrimaryColor: "#aaaaaa", darkSecondaryColor: "#bbbbbb", darkAccentColor: "#cccccc" });

    expect(pages()).toEqual(["/", "/ana", "/ana/sobre", "/beto", "/beto/sobre"]);
  });

  it("o NOME do sistema: só quem herda o nome (a Ana; o Beto tem o dele)", async () => {
    await putSite({ siteName: "Turma 2026" });

    expect(pages()).toEqual(["/", "/ana", "/ana/sobre"]);
  });

  it("o par de ícones do botão de modo é só do sistema e aparece em todo espaço: revalida todos", async () => {
    await putSite({ modeIconPair: "lightbulb" });

    expect(pages()).toEqual(["/", "/ana", "/ana/sobre", "/beto", "/beto/sobre"]);
  });

  it("o que nenhum espaço mostra (texto do portal, diretório, título do diretório): só o portal", async () => {
    await putSite({ homeBody: "# Olá", directoryEnabled: false, directoryTitle: "Pessoas" });

    expect(pages()).toEqual(["/"]);
  });

  it("salvar o mesmo valor não revalida espaço algum: só o portal", async () => {
    await putSite({ primaryColor: "#2563eb", siteName: "Vitrine" });

    expect(pages()).toEqual(["/"]);
  });

  it("o espaço sem raiz publicada fica de fora (RN28)", async () => {
    await createUserSession({ email: "carla@exemplo.test", name: "Carla", handle: "carla" });
    vi.mocked(revalidatePath).mockClear();

    await putSite({ siteName: "Outro nome" });

    expect(pages().filter((page) => page.startsWith("/carla"))).toEqual([]);
  });

  it("a aparência de um usuário revalida só o espaço dele, nunca o de outro (ADR-030)", async () => {
    await putAppearance({ siteName: "Novo nome da Ana" }, ana.cookie);

    expect(pages().filter((page) => page.startsWith("/beto"))).toEqual([]);
    expect(pages()).toContain("/ana");
  });
});
