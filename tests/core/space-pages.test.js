// Páginas públicas do espaço e o portal (A-014 Parte 3b, itens 1 a 3; RF14, RF29, RF30, RN04, RN14,
// RN15, RN20, RN23, RN28; CT13, CT14, CT31, CT43, CT46): renderizadas de verdade, com react-dom/server,
// sobre o SQLite temporário. A navegação do Next.js é substituída (`notFound` e `redirect` lançam); o
// `getUserByHandle`, o diretório e a configuração são espiados para provar o que o build não consulta.
import "./env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getUserByHandle: vi.fn(actual.getUserByHandle),
    listPublicSpaces: vi.fn(actual.listPublicSpaces),
    getContentByPath: vi.fn(actual.getContentByPath),
    getConfiguration: vi.fn(actual.getConfiguration),
  };
});

import { renderToStaticMarkup } from "react-dom/server";
import PortalPage, { revalidate as portalRevalidate } from "@/app/(portal)/page";
import SpaceContentPage, { generateMetadata as contentMetadata, generateStaticParams as slugParams } from "@/app/[handle]/[...slug]/page";
import SpaceRootLayout, { generateMetadata as layoutMetadata } from "@/app/[handle]/layout";
import SpaceHomePage, { generateStaticParams as handleParams } from "@/app/[handle]/page";
import { firstDocumentPath, getPublicPage, getSpace } from "@/app/_lib/space";
import { createContent, getContentByPath, getUserByHandle, listPublicSpaces, prisma, updateAppearance, updateConfiguration, updateContent } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(getUserByHandle).mockClear();
  vi.mocked(listPublicSpaces).mockClear();
  vi.mocked(getContentByPath).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Usuário de teste com handle; devolve o `id`. */
async function user(handle, extra = {}) {
  const created = await createTestUser({ email: `${handle ?? "sem-handle"}@exemplo.test`, name: `Nome de ${handle}`, handle, ...extra });
  return created.id;
}

const doc = (authorId, slug, extra = {}) =>
  createContent({ title: `Título ${slug}`, slug, type: "DOCUMENT", authorId, body: `Corpo de ${slug}`, ...extra });
const collection = (authorId, slug, extra = {}) =>
  createContent({ title: `Coleção ${slug}`, slug, type: "COLLECTION", authorId, ...extra });

const render = (element) => renderToStaticMarkup(element);
const homeOf = async (handle) => render(await SpaceHomePage({ params: Promise.resolve({ handle }) }));
const pageOf = async (handle, ...slug) => render(await SpaceContentPage({ params: Promise.resolve({ handle, slug }) }));
/** O que a página lança (404 ou redirecionamento), como texto. */
const outcomeOf = async (promise) => {
  try {
    await promise;
    return "RENDERIZOU";
  } catch (error) {
    return /** @type {Error} */ (error).message;
  }
};

describe("getSpace: o espaço ativo de um handle (RN23, RN20)", () => {
  it("devolve o dono, a aparência, a árvore PODADA (só publicados) e o nome do espaço", async () => {
    const ana = await user("ana");
    const colecao = await collection(ana, "calculo");
    await doc(ana, "limites", { parentId: colecao.id });
    await doc(ana, "rascunho", { status: "DRAFT" });
    await updateAppearance(ana, { siteName: "Notas da Ana" });

    const space = await getSpace("ana");

    expect(space).toMatchObject({ basePath: "/ana", name: "Notas da Ana", owner: { id: ana, handle: "ana" } });
    expect(space.tree.map((node) => node.slug)).toEqual(["calculo"]); // sem o rascunho
    expect(space.tree[0].children.map((node) => node.slug)).toEqual(["limites"]);
  });

  it("sem aparência salva, o nome do espaço é o do usuário", async () => {
    await user("ana");

    expect((await getSpace("ana")).name).toBe("Nome de ana");
  });

  it.each([
    ["inexistente", "ninguem"],
    ["reservado (nunca existe)", "admin"],
    ["em maiúsculas (a consulta é exata)", "Ana"],
    ["vazio", ""],
  ])("handle %s: null (404)", async (_label, handle) => {
    await user("ana");

    expect(await getSpace(handle)).toBeNull();
  });

  it("usuário suspenso (sem prazo ou com prazo vigente): null; com o prazo vencido, o espaço volta", async () => {
    await user("sem-prazo", { banned: true, banReason: "x" });
    await user("com-prazo", { banned: true, banReason: "x", banExpires: new Date(Date.now() + 3_600_000) });
    await user("vencido", { banned: true, banReason: "x", banExpires: new Date(Date.now() - 3_600_000) });

    expect(await getSpace("sem-prazo")).toBeNull();
    expect(await getSpace("com-prazo")).toBeNull();
    expect(await getSpace("vencido")).not.toBeNull();
  });

  it("no next build não consulta o banco (ADR-021)", async () => {
    await user("ana");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(await getSpace("ana")).toBeNull();
    expect(getUserByHandle).not.toHaveBeenCalled();
  });
});

describe("getPublicPage: o conteúdo publicado de um caminho (RN04, RN15)", () => {
  it("devolve o registro com o corpo e o nó da árvore", async () => {
    const ana = await user("ana");
    const colecao = await collection(ana, "calculo");
    await doc(ana, "limites", { parentId: colecao.id });

    const page = await getPublicPage("ana", ["calculo", "limites"]);

    expect(page.content).toMatchObject({ slug: "limites", body: "Corpo de limites" });
    expect(page.node.slug).toBe("limites");
    expect(page.slugs).toEqual(["calculo", "limites"]);
  });

  it("a leitura do conteúdo é sempre só dos publicados (onlyPublished), do dono do espaço", async () => {
    const ana = await user("ana");
    await doc(ana, "limites");

    await getPublicPage("ana", ["limites"]);

    expect(getContentByPath).toHaveBeenCalledExactlyOnceWith(ana, ["limites"], { onlyPublished: true });
  });

  it("rascunho, descendente de rascunho, inexistente e segmento malformado: null, o mesmo para todos", async () => {
    const ana = await user("ana");
    const rascunho = await collection(ana, "oculta", { status: "DRAFT" });
    await doc(ana, "filho-publicado", { parentId: rascunho.id });
    await doc(ana, "documento-rascunho", { status: "DRAFT" });

    expect(await getPublicPage("ana", ["oculta"])).toBeNull();
    expect(await getPublicPage("ana", ["oculta", "filho-publicado"])).toBeNull();
    expect(await getPublicPage("ana", ["documento-rascunho"])).toBeNull();
    expect(await getPublicPage("ana", ["nao-existe"])).toBeNull();
    expect(await getPublicPage("ana", ["%E0%A4%A"])).toBeNull();
    expect(await getPublicPage("ana", [])).toBeNull();
  });

  it("o conteúdo de OUTRO dono com o mesmo slug não vaza (a árvore é de um dono só, RN13)", async () => {
    const ana = await user("ana");
    const beto = await user("beto");
    await doc(beto, "so-do-beto");
    await doc(ana, "comum");
    await doc(beto, "comum");

    expect(await getPublicPage("ana", ["so-do-beto"])).toBeNull();
    expect((await getPublicPage("ana", ["comum"])).content.authorId).toBe(ana);
    expect((await getPublicPage("beto", ["comum"])).content.authorId).toBe(beto);
  });

  it("caminho em maiúsculas não é o slug (404 canônico)", async () => {
    const ana = await user("ana");
    await doc(ana, "limites");

    expect(await getPublicPage("ana", ["Limites"])).toBeNull();
  });

  it("espaço suspenso: null, mesmo com conteúdo publicado", async () => {
    const ana = await user("ana", { banned: true, banReason: "x" });
    await doc(ana, "limites");

    expect(await getPublicPage("ana", ["limites"])).toBeNull();
  });
});

describe("firstDocumentPath: o primeiro documento na ORDEM DA ÁRVORE (RN14)", () => {
  const node = (slug, type, children = []) => ({ id: slug, slug, type, children });

  it("o primeiro filho documento", () => {
    const tree = node("c", "COLLECTION", [node("a", "DOCUMENT"), node("b", "DOCUMENT")]);
    expect(firstDocumentPath(tree, ["c"])).toEqual(["c", "a"]);
  });

  it("uma subcoleção vem antes do documento seguinte, se estiver antes na ordem", () => {
    const tree = node("c", "COLLECTION", [node("sub", "COLLECTION", [node("fundo", "DOCUMENT")]), node("solto", "DOCUMENT")]);
    expect(firstDocumentPath(tree, ["c"])).toEqual(["c", "sub", "fundo"]);
  });

  it("uma subcoleção vazia é pulada, e o documento seguinte vale", () => {
    const tree = node("c", "COLLECTION", [node("vazia", "COLLECTION"), node("solto", "DOCUMENT")]);
    expect(firstDocumentPath(tree, ["c"])).toEqual(["c", "solto"]);
  });

  it("sem documento algum: null", () => {
    expect(firstDocumentPath(node("c", "COLLECTION", [node("vazia", "COLLECTION")]), ["c"])).toBeNull();
    expect(firstDocumentPath(node("c", "COLLECTION"), ["c"])).toBeNull();
  });
});

describe("início do espaço (RF29, D-16; CT43)", () => {
  it("lista as coleções e os documentos publicados da raiz, com o nome e a descrição", async () => {
    const ana = await user("ana");
    await collection(ana, "calculo", { order: 0 });
    await doc(ana, "sobre", { order: 1 });
    await doc(ana, "rascunho", { order: 2, status: "DRAFT" });
    await updateAppearance(ana, { siteName: "Notas da Ana", siteDescription: "Material de Cálculo" });

    const html = await homeOf("ana");

    expect(html).toContain("<h1");
    expect(html).toContain("Notas da Ana");
    expect(html).toContain("Material de Cálculo");
    expect(html).toContain('href="/ana/calculo"');
    expect(html).toContain('href="/ana/sobre"');
    expect(html).toContain("Coleção");
    expect(html).toContain("Documento");
    expect(html).not.toContain("rascunho");
  });

  it("sem conteúdo publicado: o estado vazio, e não um 404 (o espaço existe)", async () => {
    await user("ana");

    expect(await homeOf("ana")).toContain("Este espaço ainda não tem conteúdo publicado.");
  });

  it("a moldura leva a aparência do dono: as duas paletas no envoltório .vitrine-tema, o rodapé e o menu", async () => {
    const ana = await user("ana");
    await collection(ana, "calculo");
    await updateAppearance(ana, { primaryColor: "#1d4ed8", darkPrimaryColor: "#93c5fd", githubUrl: "https://github.com/ana" });

    const html = await homeOf("ana");

    expect(html).toContain("vitrine-tema");
    expect(html).toContain("--vitrine-light-primary:#1d4ed8");
    expect(html).toContain("--vitrine-dark-primary:#93c5fd");
    expect(html).toContain('href="https://github.com/ana"');
    expect(html).toContain('href="/ana/calculo"'); // a aba da coleção raiz
  });

  it.each([
    ["inexistente", async () => "ninguem"],
    ["sem handle", async () => "x"],
    ["reservado", async () => "admin"],
  ])("espaço %s: 404", async (_label, handleOf) => {
    await user(null);
    expect(await outcomeOf(homeOf(await handleOf()))).toBe("NOT_FOUND");
  });

  it("suspenso: 404, o mesmo de um espaço inexistente (RF14)", async () => {
    await user("ana", { banned: true, banReason: "x" });

    expect(await outcomeOf(homeOf("ana"))).toBe("NOT_FOUND");
    expect(await outcomeOf(homeOf("ninguem"))).toBe("NOT_FOUND");
  });

  it("o layout também responde 404 ao espaço inexistente e suspenso, e passa o filho ao ativo", async () => {
    await user("ana");
    await user("suspenso", { banned: true, banReason: "x" });
    const layout = (handle) => SpaceRootLayout({ children: "FILHO", params: Promise.resolve({ handle }) });

    expect(await layout("ana")).toBe("FILHO");
    expect(await outcomeOf(layout("suspenso"))).toBe("NOT_FOUND");
    expect(await outcomeOf(layout("ninguem"))).toBe("NOT_FOUND");
  });

  it("generateMetadata do layout: título 'nome', modelo '%s | nome' e a descrição do dono; sem espaço, vazio", async () => {
    const ana = await user("ana");
    await updateAppearance(ana, { siteName: "Notas da Ana", siteDescription: "Material de Cálculo" });

    expect(await layoutMetadata({ params: Promise.resolve({ handle: "ana" }) })).toEqual({
      title: { absolute: "Notas da Ana", template: "%s | Notas da Ana" },
      description: "Material de Cálculo",
    });
    expect(await layoutMetadata({ params: Promise.resolve({ handle: "ninguem" }) })).toEqual({});
  });
});

describe("coleção e documento (RF14, RN04, RN14, RN15; CT13, CT14, CT31)", () => {
  it("o documento mostra o título, o texto em Markdown e os vizinhos de leitura; a sidebar da coleção raiz", async () => {
    const ana = await user("ana");
    const calculo = await collection(ana, "calculo");
    await doc(ana, "primeiro", { parentId: calculo.id, order: 0, body: "# Introdução\n\nTexto **forte**." });
    await doc(ana, "segundo", { parentId: calculo.id, order: 1 });
    await doc(ana, "terceiro", { parentId: calculo.id, order: 2 });

    const html = await pageOf("ana", "calculo", "segundo");

    expect(html).toContain("Título segundo");
    expect(html).toContain("Corpo de segundo");
    expect(html).toContain('href="/ana/calculo/primeiro"'); // anterior
    expect(html).toContain('href="/ana/calculo/terceiro"'); // seguinte
    // A sidebar da coleção raiz: a navegação "Coleção calculo", com os documentos e o ativo marcado.
    expect(html).toMatch(/<nav [^>]*aria-label="Coleção Coleção calculo"/); // o rótulo é "Coleção " + o título da coleção
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*Título segundo/);
    expect(await pageOf("ana", "calculo", "primeiro")).toContain("Texto <strong>forte</strong>.");
  });

  it("um documento solto na raiz não tem sidebar nem vizinhos", async () => {
    const ana = await user("ana");
    await doc(ana, "sobre");

    const html = await pageOf("ana", "sobre");

    expect(html).toContain("Corpo de sobre");
    expect(html).not.toContain("Navegação entre documentos");
  });

  describe("a coleção redireciona ao primeiro documento descendente publicado, na ordem da árvore (RN14)", () => {
    it("o primeiro documento direto", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      await doc(ana, "primeiro", { parentId: calculo.id, order: 0 });
      await doc(ana, "segundo", { parentId: calculo.id, order: 1 });

      expect(await outcomeOf(pageOf("ana", "calculo"))).toBe("REDIRECT:/ana/calculo/primeiro");
    });

    it("segue a ORDEM da árvore: reordenar muda o destino", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      const a = await doc(ana, "a", { parentId: calculo.id, order: 0 });
      const b = await doc(ana, "b", { parentId: calculo.id, order: 1 });
      expect(await outcomeOf(pageOf("ana", "calculo"))).toBe("REDIRECT:/ana/calculo/a");

      await updateContent(b.id, { order: 0 });
      await updateContent(a.id, { order: 1 });

      expect(await outcomeOf(pageOf("ana", "calculo"))).toBe("REDIRECT:/ana/calculo/b");
    });

    it("desce às subcoleções na ordem da árvore e pula a que não tem documento publicado", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      const vazia = await collection(ana, "vazia", { parentId: calculo.id, order: 0 });
      await doc(ana, "rascunho-na-vazia", { parentId: vazia.id, status: "DRAFT" });
      const fundo = await collection(ana, "fundo", { parentId: calculo.id, order: 1 });
      await doc(ana, "achado", { parentId: fundo.id });
      await doc(ana, "solto", { parentId: calculo.id, order: 2 });

      expect(await outcomeOf(pageOf("ana", "calculo"))).toBe("REDIRECT:/ana/calculo/fundo/achado");
    });

    it("ignora os documentos em rascunho: o primeiro PUBLICADO vale", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      await doc(ana, "rascunho", { parentId: calculo.id, order: 0, status: "DRAFT" });
      await doc(ana, "publicado", { parentId: calculo.id, order: 1 });

      expect(await outcomeOf(pageOf("ana", "calculo"))).toBe("REDIRECT:/ana/calculo/publicado");
    });

    it("uma subcoleção também redireciona, dentro do seu ramo", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      await doc(ana, "fora", { parentId: calculo.id, order: 0 });
      const sub = await collection(ana, "sub", { parentId: calculo.id, order: 1 });
      await doc(ana, "dentro", { parentId: sub.id });

      expect(await outcomeOf(pageOf("ana", "calculo", "sub"))).toBe("REDIRECT:/ana/calculo/sub/dentro");
    });

    it("sem nenhum documento publicado, mostra o estado vazio (200), e não o 404", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      await doc(ana, "rascunho", { parentId: calculo.id, status: "DRAFT" });

      const html = await pageOf("ana", "calculo");

      expect(html).toContain("Coleção calculo");
      expect(html).toContain("Esta coleção ainda não tem documentos publicados.");
    });
  });

  describe("o mesmo 404 para tudo o que não é público (RF14, RN15; CT31, CT43)", () => {
    it("documento em rascunho, coleção em rascunho e descendente de rascunho", async () => {
      const ana = await user("ana");
      await doc(ana, "documento-rascunho", { status: "DRAFT" });
      const oculta = await collection(ana, "oculta", { status: "DRAFT" });
      await doc(ana, "filho", { parentId: oculta.id });

      expect(await outcomeOf(pageOf("ana", "documento-rascunho"))).toBe("NOT_FOUND");
      expect(await outcomeOf(pageOf("ana", "oculta"))).toBe("NOT_FOUND");
      expect(await outcomeOf(pageOf("ana", "oculta", "filho"))).toBe("NOT_FOUND");
    });

    it("o rascunho não aparece na sidebar, na barra superior nem no início do espaço (CT31)", async () => {
      const ana = await user("ana");
      const calculo = await collection(ana, "calculo");
      await doc(ana, "publicado", { parentId: calculo.id, order: 0 });
      await doc(ana, "escondido", { parentId: calculo.id, order: 1, status: "DRAFT" });
      await collection(ana, "pasta-oculta", { status: "DRAFT", order: 1 });

      for (const html of [await pageOf("ana", "calculo", "publicado"), await homeOf("ana")]) {
        expect(html).not.toContain("escondido");
        expect(html).not.toContain("pasta-oculta");
        expect(html).not.toContain("Coleção pasta-oculta");
      }
    });

    it("caminho inexistente, em maiúsculas, malformado e de outro dono", async () => {
      const ana = await user("ana");
      const beto = await user("beto");
      await doc(ana, "limites");
      await doc(beto, "so-do-beto");

      for (const slug of [["nao-existe"], ["Limites"], ["%E0%A4%A"], ["so-do-beto"], ["limites", "filho"]]) {
        expect(await outcomeOf(pageOf("ana", ...slug)), slug.join("/")).toBe("NOT_FOUND");
      }
    });

    it("espaço suspenso, removido ou sem handle: o mesmo 404 de um caminho inexistente", async () => {
      const suspensa = await user("suspensa", { banned: true, banReason: "x" });
      await doc(suspensa, "limites");
      await user(null);

      expect(await outcomeOf(pageOf("suspensa", "limites"))).toBe("NOT_FOUND");
      expect(await outcomeOf(pageOf("removida", "limites"))).toBe("NOT_FOUND");
      expect(await outcomeOf(pageOf("admin", "limites"))).toBe("NOT_FOUND");
    });
  });

  it("generateMetadata: o título do documento (o layout acrescenta ' | nome'); sem a página, vazio", async () => {
    const ana = await user("ana");
    const calculo = await collection(ana, "calculo");
    await doc(ana, "limites", { parentId: calculo.id });

    expect(await contentMetadata({ params: Promise.resolve({ handle: "ana", slug: ["calculo", "limites"] }) })).toEqual({
      title: "Título limites",
    });
    expect(await contentMetadata({ params: Promise.resolve({ handle: "ana", slug: ["nao-existe"] }) })).toEqual({});
  });
});

describe("parâmetros estáticos: sem dado no build, só os públicos em execução (ADR-021, RN28)", () => {
  it("no next build, os dois devolvem [] e não consultam o banco", async () => {
    const ana = await user("ana");
    await doc(ana, "limites");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect(await handleParams()).toEqual([]);
    expect(await slugParams()).toEqual([]);
    expect(listPublicSpaces).not.toHaveBeenCalled();
  });

  it("em execução: os espaços ativos com raiz publicada e os caminhos públicos deles", async () => {
    const ana = await user("ana");
    const calculo = await collection(ana, "calculo");
    await doc(ana, "limites", { parentId: calculo.id });
    await doc(ana, "rascunho", { status: "DRAFT" });
    await user("sem-conteudo");
    const suspensa = await user("suspensa", { banned: true, banReason: "x" });
    await doc(suspensa, "limites");

    expect(await handleParams()).toEqual([{ handle: "ana" }]);
    expect(await slugParams()).toEqual([
      { handle: "ana", slug: ["calculo"] },
      { handle: "ana", slug: ["calculo", "limites"] },
    ]);
  });
});

describe("portal / (RF30, RN28; CT46)", () => {
  const portal = async () => render(await PortalPage());

  it("o portal regenera sozinho depois de 60 s (R-016): a rede de segurança de uma instância recriada", () => {
    expect(portalRevalidate).toBe(60);
  });

  it("mostra o texto do administrador em Markdown e o nome do site", async () => {
    await updateConfiguration({ siteName: "Vitrine da Turma", homeBody: "# Bem-vindos\n\nTexto **do portal**." });

    const html = await portal();

    expect(html).toContain("Vitrine da Turma");
    expect(html).toContain("Texto <strong>do portal</strong>.");
  });

  it("a aparência do site: as duas paletas no envoltório, o logotipo e os links do rodapé", async () => {
    await updateConfiguration({ primaryColor: "#1d4ed8", darkPrimaryColor: "#93c5fd", githubUrl: "https://github.com/turma" });

    const html = await portal();

    expect(html).toContain("--vitrine-light-primary:#1d4ed8");
    expect(html).toContain("--vitrine-dark-primary:#93c5fd");
    expect(html).toContain('href="https://github.com/turma"');
  });

  it("o diretório lista só espaços ativos com ao menos uma raiz publicada, em ordem alfabética (sem acentos nem caixa)", async () => {
    for (const [handle, nome] of [["zeca", "Zeca"], ["ana", "ângela"], ["beto", "beto"], ["carla", "Carla"]]) {
      const id = await user(handle);
      await updateAppearance(id, { siteName: nome });
      await doc(id, "inicio");
    }
    const semConteudo = await user("sem-conteudo");
    await updateAppearance(semConteudo, { siteName: "Aaa vazio" });
    const rascunho = await user("so-rascunho");
    await doc(rascunho, "x", { status: "DRAFT" });
    const suspensa = await user("suspensa", { banned: true, banReason: "x" });
    await doc(suspensa, "inicio");

    const html = await portal();

    const order = ["ângela", "beto", "Carla", "Zeca"].map((name) => html.indexOf(name));
    expect(order.every((position) => position > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const absent of ["Aaa vazio", "Nome de so-rascunho", "Nome de suspensa", "Nome de sem-conteudo"]) expect(html).not.toContain(absent);
    expect(html).toContain('href="/zeca"');
  });

  it("com o diretório desligado (directoryEnabled falso), nem consulta nem mostra a lista", async () => {
    const id = await user("ana");
    await doc(id, "inicio");
    await updateConfiguration({ directoryEnabled: false, siteName: "Portal sem diretório" });

    const html = await portal();

    expect(html).toContain("Portal sem diretório");
    expect(html).not.toContain('href="/ana"');
    expect(listPublicSpaces).not.toHaveBeenCalled();
  });

  it("no next build: renderiza com os padrões, sem consultar a configuração nem o diretório", async () => {
    const id = await user("ana");
    await doc(id, "inicio");
    await updateConfiguration({ siteName: "Nome gravado" });
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    const html = await portal();

    expect(html).toContain("Vitrine");
    expect(html).not.toContain("Nome gravado");
    expect(html).not.toContain('href="/ana"');
    expect(listPublicSpaces).not.toHaveBeenCalled();
    expect(prisma).toBeTruthy();
  });
});
