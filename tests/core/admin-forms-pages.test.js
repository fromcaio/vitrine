// Páginas /admin/aparencia e /admin/configuracoes (A-014 Parte 3c, item 1; RF18, RF31, RN19, RN25; CT23, CT24):
// a aparência é a DA SESSÃO (nunca de um identificador da URL), a configuração é só do administrador
// (`requireSession({ role: "admin" })`: o outro recebe `notFound()`), e os formulários da UI recebem só os
// campos simples. A sessão e os formulários (da UI) são substituídos; o banco é o SQLite temporário.
import "./env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: /** @type {{ id: string, role: string } | null} */ (null) }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async (options) => {
    if (!session.user) throw new Error(`REDIRECT:${options?.path}`);
    if (options?.role && session.user.role !== options.role) throw new Error("NOT_FOUND");
    return { user: session.user };
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/components/admin/AppearanceForm", () => ({ AppearanceForm: () => null }));
vi.mock("@/components/admin/ConfigurationForm", () => ({ ConfigurationForm: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getAppearance: vi.fn(actual.getAppearance), getConfiguration: vi.fn(actual.getConfiguration) };
});

import { requireSession } from "@/app/admin/_lib/session";
import { appearanceInitial, configurationInitial } from "@/app/admin/_lib/forms";
import AppearancePage, { metadata as appearanceMetadata } from "@/app/admin/aparencia/page";
import ConfigurationPage, { metadata as configurationMetadata } from "@/app/admin/configuracoes/page";
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { ConfigurationForm } from "@/components/admin/ConfigurationForm";
import { getAppearance, getConfiguration, updateAppearance, updateConfiguration } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string, role: string }} */
let ana;
/** @type {{ id: string, role: string }} */
let beto;
/** @type {{ id: string, role: string }} */
let admin;

beforeEach(async () => {
  await resetDatabase();
  const a = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  const b = await createTestUser({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
  const c = await createTestUser({ email: "admin@exemplo.test", name: "Admin", role: "admin" });
  ana = { id: a.id, role: "user" };
  beto = { id: b.id, role: "user" };
  admin = { id: c.id, role: "admin" };
  session.user = ana;
  vi.mocked(requireSession).mockClear();
  vi.mocked(getAppearance).mockClear();
  vi.mocked(getConfiguration).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Props do componente `type` na árvore devolvida pela página. */
const propsOf = (element, type) => [element.props.children].flat().find((child) => child?.type === type).props;

describe("appearanceInitial e configurationInitial: só os campos simples", () => {
  const record = {
    ownerId: "u1", persisted: true, createdAt: new Date(), updatedAt: new Date(), id: "default",
    siteName: "Nome", siteDescription: null, logoUrl: "/logo.svg", faviconUrl: null,
    githubUrl: "https://github.com/x", discordUrl: null, youtubeUrl: null, instagramUrl: null, linkedinUrl: null, twitchUrl: null,
    primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455",
    darkPrimaryColor: "#445566", darkSecondaryColor: "#556677", darkAccentColor: "#667788",
    homeBody: "# Portal", directoryEnabled: false,
  };

  it("a aparência leva identidade, links e as duas paletas, e nada do resto (datas, dono, persistência)", () => {
    const initial = appearanceInitial(record);

    expect(Object.keys(initial)).toHaveLength(16);
    expect(initial).toMatchObject({ siteName: "Nome", githubUrl: "https://github.com/x", darkAccentColor: "#667788" });
    for (const forbidden of ["ownerId", "persisted", "createdAt", "updatedAt", "id", "homeBody", "directoryEnabled"]) {
      expect(initial).not.toHaveProperty(forbidden);
    }
  });

  it("a configuração acrescenta o texto do portal e o diretório", () => {
    const initial = configurationInitial(record);

    expect(Object.keys(initial)).toHaveLength(18);
    expect(initial).toMatchObject({ homeBody: "# Portal", directoryEnabled: false, siteName: "Nome" });
    expect(initial).not.toHaveProperty("createdAt");
  });

  it("campo ausente vira null (o formulário o mostra vazio), e nunca undefined (não atravessa a rede)", () => {
    const initial = appearanceInitial({ siteName: "Só o nome" });

    expect(initial.siteDescription).toBeNull();
    expect(Object.values(initial).includes(undefined)).toBe(false);
  });
});

describe("/admin/aparencia", () => {
  it("monta o AppearanceForm com a aparência DO USUÁRIO DA SESSÃO, e com mais nada", async () => {
    const palette = (/** @type {string[]} */ [primary, secondary, accent]) => ({ primaryColor: primary, secondaryColor: secondary, accentColor: accent });
    await updateAppearance(ana.id, { siteName: "Espaço da Ana", ...palette(["#1d4ed8", "#1e293b", "#b45309"]) });
    await updateAppearance(beto.id, { siteName: "Espaço do Beto", ...palette(["#be123c", "#4c0519", "#9a3412"]) });

    const element = await AppearancePage();
    const { initial } = propsOf(element, AppearanceForm);

    expect(initial).toMatchObject({ siteName: "Espaço da Ana", primaryColor: "#1d4ed8" });
    expect(JSON.stringify(initial)).not.toContain("Beto");
    expect(JSON.stringify(initial)).not.toContain("#be123c");
    expect(getAppearance).toHaveBeenCalledExactlyOnceWith(ana.id);
    expect(Object.keys(initial)).toHaveLength(16);
  });

  it("outro usuário na sessão vê só a dele; o administrador também vê só a sua (não a de outro)", async () => {
    await updateAppearance(ana.id, { siteName: "Espaço da Ana" });
    await updateAppearance(admin.id, { siteName: "Espaço do Admin" });

    session.user = beto;
    expect(propsOf(await AppearancePage(), AppearanceForm).initial.siteName).toBeNull(); // nulo: herda o nome do sistema (ADR-038)

    session.user = admin;
    expect(propsOf(await AppearancePage(), AppearanceForm).initial.siteName).toBe("Espaço do Admin");
    expect(getAppearance).toHaveBeenLastCalledWith(admin.id);
  });

  it("sem aparência salva, o formulário recebe tudo nulo: o nome e as paletas herdam o sistema (ADR-038)", async () => {
    const { initial } = propsOf(await AppearancePage(), AppearanceForm);

    expect(initial.siteName).toBeNull();
    expect(initial.primaryColor).toBeNull();
    expect(initial.darkPrimaryColor).toBeNull();
  });

  it("exige a sessão da página, não lê o banco sem ela, e tem a h1 e o noindex", async () => {
    const element = await AppearancePage();
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/aparencia" });
    expect(JSON.stringify(element.props.children[0])).toContain("Aparência do seu espaço");
    expect(appearanceMetadata).toEqual({ title: "Aparência", robots: { index: false, follow: false } });

    session.user = null;
    vi.mocked(getAppearance).mockClear();
    await expect(AppearancePage()).rejects.toThrow("REDIRECT:/admin/aparencia");
    expect(getAppearance).not.toHaveBeenCalled();
  });

  it("um usuário que já não existe (sessão velha): 404", async () => {
    session.user = { id: "nao-existe", role: "user" };

    await expect(AppearancePage()).rejects.toThrow("NOT_FOUND");
  });
});

describe("/admin/configuracoes", () => {
  it("só o administrador: o usuário comum recebe notFound(), sem ler a configuração", async () => {
    session.user = ana;

    await expect(ConfigurationPage()).rejects.toThrow("NOT_FOUND");
    expect(requireSession).toHaveBeenCalledWith({ role: "admin", path: "/admin/configuracoes" });
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("sem sessão, vai ao login, sem ler a configuração", async () => {
    session.user = null;

    await expect(ConfigurationPage()).rejects.toThrow("REDIRECT:/admin/configuracoes");
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("o administrador recebe o ConfigurationForm com a configuração do site e o limite de bytes do portal", async () => {
    session.user = admin;
    await updateConfiguration({ siteName: "Vitrine da Turma", homeBody: "# Portal", directoryEnabled: false });
    vi.stubEnv("MAX_BODY_BYTES", "12345");

    const element = await ConfigurationPage();
    const { initial, maxBodyBytes } = propsOf(element, ConfigurationForm);

    expect(initial).toMatchObject({ siteName: "Vitrine da Turma", homeBody: "# Portal", directoryEnabled: false });
    expect(maxBodyBytes).toBe(12345);
    expect(Object.keys(initial)).toHaveLength(18);
    expect(initial).not.toHaveProperty("id");
    expect(JSON.stringify(element.props.children[0])).toContain("Configurações do site");
    expect(configurationMetadata).toEqual({ title: "Configurações do site", robots: { index: false, follow: false } });
  });

  it("sem MAX_BODY_BYTES, vale o padrão do servidor (64 KiB)", async () => {
    session.user = admin;
    vi.stubEnv("MAX_BODY_BYTES", "");

    expect(propsOf(await ConfigurationPage(), ConfigurationForm).maxBodyBytes).toBe(64 * 1024);
  });
});
