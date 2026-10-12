// Página /admin/pagina-inicial e as árvores de conteúdo com a linha "Página inicial" (P-033; M26, ADR-040; RF42 a
// RF44, RN35, RN38; UC23, UC24; CT77, CT78, CT79): a página é a DA SESSÃO (nunca de um identificador da URL); o
// ADMINISTRADOR escolhe o alvo por `?alvo=` (padrão `sistema`) e vê o seletor; o USUÁRIO COMUM só tem o alvo
// `pagina`, sem seletor, e `?alvo=sistema` é 404. O `publicHref` e o `publicBasePath` só existem com o espaço no
// ar (handle e conta ativa). A sessão e os componentes da UI são substituídos; o banco é o SQLite temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/components/admin/HomeEditor", () => ({ HomeEditor: () => null }));
vi.mock("@/components/admin/AppearanceTargetTabs", () => ({ AppearanceTargetTabs: () => null }));
vi.mock("@/components/admin/ContentTree", () => ({ ContentTree: () => null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getHome: vi.fn(actual.getHome), getConfiguration: vi.fn(actual.getConfiguration) };
});

import { requireSession } from "@/app/admin/_lib/session";
import ContentPage from "@/app/admin/conteudo/page";
import HomePage, { metadata } from "@/app/admin/pagina-inicial/page";
import ModerateContentPage from "@/app/admin/usuarios/[id]/conteudo/page";
import { AppearanceTargetTabs } from "@/components/admin/AppearanceTargetTabs";
import { ContentTree } from "@/components/admin/ContentTree";
import { HomeEditor } from "@/components/admin/HomeEditor";
import { getConfiguration, getHome, prisma, updateConfiguration, updateHome } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string, role: string }} */
let ana;
/** @type {{ id: string, role: string }} */
let admin;
/** @type {{ id: string, role: string }} */
let semHandle;

beforeEach(async () => {
  await resetDatabase();
  const a = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  const c = await createTestUser({ email: "admin@exemplo.test", name: "Admin", role: "admin", handle: "ada" });
  const d = await createTestUser({ email: "sem@exemplo.test", name: "Sem Handle" });
  ana = { id: a.id, role: "user" };
  admin = { id: c.id, role: "admin" };
  semHandle = { id: d.id, role: "user" };
  session.user = ana;
  vi.mocked(requireSession).mockClear();
  vi.mocked(getHome).mockClear();
  vi.mocked(getConfiguration).mockClear();
});

/** Props do componente `type` na árvore devolvida pela página. */
const propsOf = (element, type) => [element.props.children].flat().find((child) => child?.type === type)?.props;

/** O pedido da página: `?alvo=` (ou nenhum). */
const query = (alvo) => ({ searchParams: Promise.resolve(alvo === undefined ? {} : { alvo }) });

describe("/admin/pagina-inicial: o administrador (CT77)", () => {
  it("o alvo padrão é o sistema: seletor com os rótulos da página inicial e o editor do portal, com `/` como link", async () => {
    session.user = admin;
    await updateConfiguration({ homeBody: "# Portal", homeStatus: "DRAFT", directoryEnabled: false, directoryTitle: "Pessoas" });

    const element = await openHome();
    const tabs = propsOf(element, AppearanceTargetTabs);
    const editor = propsOf(element, HomeEditor);

    expect(tabs).toMatchObject({
      role: "admin",
      active: "sistema",
      labels: { nav: "Página inicial a editar", system: "Página inicial do sistema", page: "Minha página inicial" },
    });
    expect(editor).toMatchObject({
      target: "sistema",
      userId: admin.id,
      publicHref: "/",
      maxBodyBytes: 64 * 1024,
      initial: { homeBody: "# Portal", homeStatus: "DRAFT", directoryEnabled: false, directoryTitle: "Pessoas" },
    });
    expect(Object.keys(editor.initial).sort()).toEqual(["directoryEnabled", "directoryTitle", "homeBody", "homeStatus"]);
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/pagina-inicial" });
    expect(getHome).not.toHaveBeenCalled();
  });

  it("`?alvo=pagina` edita a PRÓPRIA página: initial é o getHome dele e o link é /{handle}", async () => {
    session.user = admin;
    await updateHome(admin.id, { homeBody: "da Ada", homeShowItems: false });

    const element = await openHome("pagina");
    const editor = propsOf(element, HomeEditor);

    expect(propsOf(element, AppearanceTargetTabs)).toMatchObject({ role: "admin", active: "pagina" });
    expect(editor).toMatchObject({
      target: "pagina",
      userId: admin.id,
      publicHref: "/ada",
      initial: { homeBody: "da Ada", homeStatus: "PUBLISHED", homeShowItems: false },
    });
    expect(getHome).toHaveBeenCalledWith(admin.id);
    expect(getConfiguration).not.toHaveBeenCalled();
    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/pagina-inicial?alvo=pagina" });
  });

  it("um valor desconhecido de `?alvo=` cai no padrão (o sistema); o editor remonta ao trocar de alvo (key)", async () => {
    session.user = admin;

    const unknown = await openHome("qualquer");
    expect(propsOf(unknown, HomeEditor).target).toBe("sistema");
    expect([unknown.props.children].flat().find((child) => child?.type === HomeEditor).key).toBe("sistema");
    expect([(await openHome("pagina")).props.children].flat().find((child) => child?.type === HomeEditor).key).toBe("pagina");
  });

  it("o limite de bytes do editor vem do ambiente (MAX_BODY_BYTES)", async () => {
    session.user = admin;
    vi.stubEnv("MAX_BODY_BYTES", "12345");
    try {
      expect(propsOf(await openHome(), HomeEditor).maxBodyBytes).toBe(12345);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sem sessão, vai ao login (o destino preserva o alvo), sem ler nada", async () => {
    session.user = null;

    await expect(openHome("pagina")).rejects.toThrow("REDIRECT:/admin/pagina-inicial?alvo=pagina");
    expect(getHome).not.toHaveBeenCalled();
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("os metadados: título e noindex", () => {
    expect(metadata).toEqual({ title: "Página inicial", robots: { index: false, follow: false } });
  });
});

describe("/admin/pagina-inicial: o usuário comum (CT77)", () => {
  it("só a própria página, sem seletor para ele (a UI não monta o seletor fora do administrador) e sem ler a configuração", async () => {
    await updateHome(ana.id, { homeBody: "da Ana", homeStatus: "DRAFT" });

    for (const alvo of [undefined, "pagina", "qualquer"]) {
      const element = await openHome(alvo);
      expect(propsOf(element, AppearanceTargetTabs)).toMatchObject({ role: "user", active: "pagina" });
      expect(propsOf(element, HomeEditor)).toMatchObject({
        target: "pagina",
        userId: ana.id,
        publicHref: "/ana",
        initial: { homeBody: "da Ana", homeStatus: "DRAFT", homeShowItems: true },
      });
    }
    expect(getConfiguration).not.toHaveBeenCalled();
  });

  it("`?alvo=sistema` responde 404 e não lê a configuração do sistema", async () => {
    await expect(openHome("sistema")).rejects.toThrow("NOT_FOUND");
    expect(getConfiguration).not.toHaveBeenCalled();
    expect(getHome).not.toHaveBeenCalled();
  });

  it("sem handle, o link da página pública é null (o espaço não existe)", async () => {
    session.user = semHandle;

    expect(propsOf(await openHome(), HomeEditor).publicHref).toBeNull();
  });

  it("conta suspensa no banco (o espaço sai do ar): o link é null", async () => {
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banExpires: null } });

    expect(propsOf(await openHome(), HomeEditor).publicHref).toBeNull();
  });
});

describe("a árvore do próprio usuário: a linha Página inicial e o botão Ver (RF44, RN38; CT76, CT78)", () => {
  it("homeRow vem do getHome (estado e se há texto), homeEditHref leva ao editor e publicBasePath é /{handle}", async () => {
    await updateHome(ana.id, { homeBody: "texto", homeStatus: "DRAFT" });

    const props = propsOf(await ContentPage(), ContentTree);

    expect(props.homeRow).toEqual({ status: "DRAFT", hasBody: true });
    expect(props.homeEditHref).toBe("/admin/pagina-inicial");
    expect(props.publicBasePath).toBe("/ana");
    expect(props.moderation).toBeUndefined();
  });

  it("sem texto: hasBody é false; texto só de espaços não conta (o Dados o grava como nulo)", async () => {
    await updateHome(ana.id, { homeBody: "   " });

    expect(propsOf(await ContentPage(), ContentTree).homeRow).toEqual({ status: "PUBLISHED", hasBody: false });
  });

  it("sem handle, publicBasePath é null (nenhum botão Ver)", async () => {
    session.user = semHandle;

    expect(propsOf(await ContentPage(), ContentTree).publicBasePath).toBeNull();
  });

  it("lê SÓ a página inicial do usuário da sessão", async () => {
    await updateHome(ana.id, { homeBody: "da Ana" });
    await ContentPage();

    expect(getHome).toHaveBeenCalledTimes(1);
    expect(getHome).toHaveBeenCalledWith(ana.id);
  });
});

describe("a árvore de moderação: a página inicial do DONO (RF43, RN37, RN38; CT76, CT78)", () => {
  const moderate = (id) => ModerateContentPage({ params: Promise.resolve({ id }) });

  it("homeRow e publicBasePath são do DONO da árvore, nunca do administrador", async () => {
    session.user = admin;
    await updateHome(ana.id, { homeBody: "da Ana", homeStatus: "PUBLISHED" });
    await updateHome(admin.id, { homeBody: "da Ada", homeStatus: "DRAFT" });

    const props = propsOf(await moderate(ana.id), ContentTree);

    expect(props.homeRow).toEqual({ status: "PUBLISHED", hasBody: true });
    expect(props.publicBasePath).toBe("/ana");
    expect(props.moderation).toMatchObject({ ownerId: ana.id });
    expect(getHome).toHaveBeenCalledWith(ana.id);
    expect(getHome).not.toHaveBeenCalledWith(admin.id);
  });

  it("dono suspenso ou sem handle: publicBasePath é null (a linha continua, para moderar)", async () => {
    session.user = admin;
    await updateHome(semHandle.id, { homeBody: "texto" });
    const banned = await createTestUser({ email: "banida@exemplo.test", handle: "banida", banned: true, banReason: "x" });
    await updateHome(banned.id, { homeBody: "texto" });

    const sem = propsOf(await moderate(semHandle.id), ContentTree);
    const suspended = propsOf(await moderate(banned.id), ContentTree);

    expect(sem.publicBasePath).toBeNull();
    expect(sem.homeRow).toEqual({ status: "PUBLISHED", hasBody: true });
    expect(suspended.publicBasePath).toBeNull();
    expect(suspended.homeRow).toEqual({ status: "PUBLISHED", hasBody: true });
  });

  it("o usuário comum recebe 404 e usuário inexistente também", async () => {
    await expect(moderate(ana.id)).rejects.toThrow("NOT_FOUND");
    session.user = admin;
    await expect(moderate("nao-existe")).rejects.toThrow("NOT_FOUND");
  });
});

/** A página inicial do painel com o `?alvo=` pedido. @param {string} [alvo] */
function openHome(alvo) {
  return HomePage(query(alvo));
}
