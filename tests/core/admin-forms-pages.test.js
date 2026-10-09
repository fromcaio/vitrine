// Páginas /admin/aparencia e /admin/configuracoes (A-014 Parte 3c, item 1; A-031; RF18, RF31, RN19, RN25,
// D-40, D-41; CT23, CT24): a aparência é a DA SESSÃO (nunca de um identificador da URL), com o seletor
// `?alvo=` só para o administrador; as configurações do portal são só do administrador
// (`requireSession({ role: "admin" })`: o outro recebe `notFound()`); e os formulários da UI recebem só os
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
vi.mock("@/components/admin/SiteIdentityForm", () => ({ SiteIdentityForm: () => null }));
vi.mock("@/components/admin/PortalSettingsForm", () => ({ PortalSettingsForm: () => null }));
vi.mock("@/components/admin/AppearanceTargetTabs", () => ({ AppearanceTargetTabs: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getAppearance: vi.fn(actual.getAppearance), getConfiguration: vi.fn(actual.getConfiguration) };
});

import { requireSession } from "@/app/admin/_lib/session";
import { appearanceInitial, configurationInitial, systemReference } from "@/app/admin/_lib/forms";
import AppearancePage, { metadata as appearanceMetadata } from "@/app/admin/aparencia/page";
import ConfigurationPage, { metadata as configurationMetadata } from "@/app/admin/configuracoes/page";
import { AppearanceForm } from "@/components/admin/AppearanceForm";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { PortalSettingsForm } from "@/components/admin/PortalSettingsForm";
import { SiteIdentityForm } from "@/components/admin/SiteIdentityForm";
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
const propsOf = (element, type) => [element.props.children].flat().find((child) => child?.type === type)?.props;

/** O pedido da página: `?alvo=` (ou nenhum). */
const query = (alvo) => ({ searchParams: Promise.resolve(alvo === undefined ? {} : { alvo }) });

describe("appearanceInitial e configurationInitial: só os campos simples", () => {
  const record = {
    ownerId: "u1", persisted: true, createdAt: new Date(), updatedAt: new Date(), id: "default",
    siteName: "Nome", siteDescription: null, showLogo: true, showName: false, modeIconPair: "lightbulb",
    logoImageId: "img1", faviconImageId: null, directoryTitle: "Pessoas",
    primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455",
    darkPrimaryColor: "#445566", darkSecondaryColor: "#556677", darkAccentColor: "#667788",
    homeBody: "# Portal", directoryEnabled: false,
  };

  it("a aparência leva identidade, barra superior e as duas paletas, e nada do resto (datas, dono, imagens, persistência)", () => {
    const initial = appearanceInitial(record);

    expect(Object.keys(initial)).toHaveLength(10);
    expect(initial).toMatchObject({ siteName: "Nome", showLogo: true, showName: false, darkAccentColor: "#667788" });
    for (const forbidden of ["ownerId", "persisted", "createdAt", "updatedAt", "id", "logoImageId", "homeBody", "directoryEnabled", "modeIconPair"]) {
      expect(initial).not.toHaveProperty(forbidden);
    }
  });

  it("a configuração acrescenta o par de ícones, o texto do portal e o diretório", () => {
    const initial = configurationInitial(record);

    expect(Object.keys(initial)).toHaveLength(14);
    expect(initial).toMatchObject({
      homeBody: "# Portal", directoryEnabled: false, directoryTitle: "Pessoas", modeIconPair: "lightbulb", siteName: "Nome",
    });
    expect(initial).not.toHaveProperty("createdAt");
    expect(initial).not.toHaveProperty("logoImageId");
  });

  it("a referência do sistema é só o nome e as seis cores", () => {
    const reference = systemReference(record);

    expect(Object.keys(reference).sort()).toEqual([
      "accentColor", "darkAccentColor", "darkPrimaryColor", "darkSecondaryColor", "primaryColor", "secondaryColor", "siteName",
    ]);
    expect(reference.siteName).toBe("Nome");
  });

  it("campo ausente vira null (o formulário o mostra vazio), e nunca undefined (não atravessa a rede)", () => {
    const initial = appearanceInitial({ siteName: "Só o nome" });

    expect(initial.siteDescription).toBeNull();
    expect(Object.values(initial).includes(undefined)).toBe(false);
  });
});

describe("/admin/aparencia: o usuário comum", () => {
  it("monta o AppearanceForm com a aparência DO USUÁRIO DA SESSÃO, a referência do sistema e mais nada", async () => {
    const palette = (/** @type {string[]} */ [primary, secondary, accent]) => ({ primaryColor: primary, secondaryColor: secondary, accentColor: accent });
    await updateAppearance(ana.id, { siteName: "Espaço da Ana", ...palette(["#1d4ed8", "#1e293b", "#b45309"]) });
    await updateAppearance(beto.id, { siteName: "Espaço do Beto", ...palette(["#be123c", "#4c0519", "#9a3412"]) });
    await updateConfiguration({ siteName: "Sistema" });

    const element = await AppearancePage(query());
    const { initial, system } = propsOf(element, AppearanceForm);

    expect(initial).toMatchObject({ siteName: "Espaço da Ana", primaryColor: "#1d4ed8" });
    expect(JSON.stringify(initial)).not.toContain("Beto");
    expect(JSON.stringify(initial)).not.toContain("#be123c");
    expect(getAppearance).toHaveBeenCalledExactlyOnceWith(ana.id);
    expect(Object.keys(initial)).toHaveLength(10);
    expect(system).toMatchObject({ siteName: "Sistema", primaryColor: "#2563eb" });
  });

  it("não vê o seletor como administrador: a aba recebe o papel e some para ele", async () => {
    const tabs = propsOf(await AppearancePage(query()), AppearanceTargetTabs);

    expect(tabs).toMatchObject({ role: "user", active: "pagina" });
  });

  it("?alvo=sistema não lhe dá o formulário do sistema: continua na própria página", async () => {
    const element = await AppearancePage(query("sistema"));

    expect(propsOf(element, SiteIdentityForm)).toBeUndefined();
    expect(propsOf(element, AppearanceForm)).toBeDefined();
    expect(getConfiguration).toHaveBeenCalledTimes(1); // só a referência da herança, nunca como o que se edita
  });

  it("sem aparência salva, o formulário recebe tudo nulo: o nome e as paletas herdam o sistema (ADR-038)", async () => {
    const { initial } = propsOf(await AppearancePage(query()), AppearanceForm);

    expect(initial.siteName).toBeNull();
    expect(initial.primaryColor).toBeNull();
    expect(initial.darkPrimaryColor).toBeNull();
    expect(initial).toMatchObject({ showLogo: true, showName: true });
  });

  it("exige a sessão da página, não lê o banco sem ela, e tem a h1 e o noindex", async () => {
    const element = await AppearancePage(query());
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/aparencia" });
    expect(JSON.stringify(element.props.children[0])).toContain("Aparência do seu espaço");
    expect(appearanceMetadata).toEqual({ title: "Aparência", robots: { index: false, follow: false } });

    session.user = null;
    vi.mocked(getAppearance).mockClear();
    await expect(AppearancePage(query())).rejects.toThrow("REDIRECT:/admin/aparencia");
    expect(getAppearance).not.toHaveBeenCalled();
  });

  it("um usuário que já não existe (sessão velha): 404", async () => {
    session.user = { id: "nao-existe", role: "user" };

    await expect(AppearancePage(query())).rejects.toThrow("NOT_FOUND");
  });
});

describe("/admin/aparencia: o administrador e o seletor do alvo (D-41)", () => {
  beforeEach(() => {
    session.user = admin;
  });

  it("sem ?alvo= e com um valor inválido, o alvo é o SISTEMA (SiteIdentityForm com a configuração)", async () => {
    await updateConfiguration({ siteName: "Vitrine da Turma", showName: false, modeIconPair: "contrast_half" });
    for (const alvo of [undefined, "sistema", "qualquer", "", "PAGINA"]) {
      const element = await AppearancePage(query(alvo));

      expect(propsOf(element, AppearanceTargetTabs)).toMatchObject({ role: "admin", active: "sistema" });
      expect(propsOf(element, AppearanceForm)).toBeUndefined();
      expect(propsOf(element, SiteIdentityForm).initial).toMatchObject({
        siteName: "Vitrine da Turma", showName: false, modeIconPair: "contrast_half", primaryColor: "#2563eb",
      });
      expect(JSON.stringify(element.props.children[0])).toContain("Aparência do sistema");
    }
  });

  it("?alvo=pagina é a página do próprio administrador (AppearanceForm), nunca a de outro", async () => {
    await updateAppearance(admin.id, { siteName: "Espaço do Admin" });
    await updateAppearance(ana.id, { siteName: "Espaço da Ana" });

    const element = await AppearancePage(query("pagina"));

    expect(propsOf(element, AppearanceTargetTabs)).toMatchObject({ role: "admin", active: "pagina" });
    expect(propsOf(element, SiteIdentityForm)).toBeUndefined();
    expect(propsOf(element, AppearanceForm).initial.siteName).toBe("Espaço do Admin");
    expect(getAppearance).toHaveBeenLastCalledWith(admin.id);
  });

  it("os dois alvos têm chaves diferentes: o estado do formulário não vaza de um para o outro", async () => {
    const sistema = [(await AppearancePage(query("sistema"))).props.children].flat().find((c) => c?.type === SiteIdentityForm);
    const pagina = [(await AppearancePage(query("pagina"))).props.children].flat().find((c) => c?.type === AppearanceForm);

    expect(sistema.key).toBe("sistema");
    expect(pagina.key).toBe("pagina");
  });

  it("o destino do login e da troca de senha preserva ?alvo=pagina", async () => {
    await AppearancePage(query("pagina"));
    expect(requireSession).toHaveBeenLastCalledWith({ path: "/admin/aparencia?alvo=pagina" });

    await AppearancePage(query("sistema"));
    expect(requireSession).toHaveBeenLastCalledWith({ path: "/admin/aparencia" });
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

  it("o administrador recebe o PortalSettingsForm com a configuração do sistema e o limite de bytes do portal", async () => {
    session.user = admin;
    await updateConfiguration({ homeBody: "# Portal", directoryEnabled: false, directoryTitle: "Pessoas" });
    vi.stubEnv("MAX_BODY_BYTES", "12345");

    const element = await ConfigurationPage();
    const { initial, maxBodyBytes } = propsOf(element, PortalSettingsForm);

    expect(initial).toMatchObject({ homeBody: "# Portal", directoryEnabled: false, directoryTitle: "Pessoas" });
    expect(maxBodyBytes).toBe(12345);
    expect(Object.keys(initial)).toHaveLength(14);
    expect(initial).not.toHaveProperty("id");
    expect(JSON.stringify(element.props.children[0])).toContain("Configurações do site");
    expect(configurationMetadata).toEqual({ title: "Configurações do site", robots: { index: false, follow: false } });
  });

  it("sem MAX_BODY_BYTES, vale o padrão do servidor (64 KiB)", async () => {
    session.user = admin;
    vi.stubEnv("MAX_BODY_BYTES", "");

    expect(propsOf(await ConfigurationPage(), PortalSettingsForm).maxBodyBytes).toBe(64 * 1024);
  });
});
