// @vitest-environment jsdom
// Popout do sino (A-027, item 1 do épico v1; RF33, RNF05): o sino é um botão de divulgação (não modal,
// sem `aria-modal`) que abre um painel com as 8 notificações recentes; ler e dispensar inline, "Marcar
// todas como lidas" e "Ver todas"; Esc, clique fora e saída do foco o fecham; o foco volta ao sino com
// o Esc; Tab não fica preso. A API é um fetch simulado; o navegador de verdade fica para o ensaio sobre
// o build de produção.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell, POPOUT_SIZE } from "@/components/admin/NotificationBell";

const json = (/** @type {number} */ status, /** @type {unknown} */ body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** @param {string} id @param {object} [extra] */
const note = (id, extra = {}) => ({
  id,
  type: "MODERATION",
  severity: "WARNING",
  title: `Título ${id}`,
  text: `Texto ${id}`,
  data: {},
  readAt: null,
  resolvedAt: null,
  createdAt: "2026-10-05T15:30:00.000Z",
  updatedAt: "2026-10-05T15:30:00.000Z",
  ...extra,
});
const page = (/** @type {object[]} */ data, unreadCount = data.length) => json(200, { data, unreadCount, nextCursor: null });

/** @param {...(Response | (() => Promise<Response>))} responses */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (typeof response === "function") fetchMock.mockImplementationOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockImplementation(async () => page([]));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // O sorteio do `useId` não importa; a consulta periódica não deve atrapalhar: intervalo enorme.
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bell = () => screen.getByRole("button", { name: /^Notificações,/ });
const panel = () => /** @type {HTMLElement} */ (document.getElementById(/** @type {string} */ (bell().getAttribute("aria-controls"))));
const renderBell = (/** @type {number} */ unread = 2) => render(<NotificationBell initialUnreadCount={unread} intervalMs={3_600_000} />);

/** Abre o painel e espera a lista chegar. */
async function open() {
  fireEvent.click(bell());
  await waitFor(() => expect(within(panel()).queryByText("Carregando as notificações…")).toBeNull());
}

describe("o botão de divulgação", () => {
  it("fechado: aria-expanded=false, aria-controls aponta para o painel, que está oculto", () => {
    stubFetch();
    renderBell();
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(panel()).toBeTruthy();
    expect(panel().hidden).toBe(true);
    expect(panel().textContent).toBe("");
  });

  it("não é modal: nenhum aria-modal, nenhum role=dialog", () => {
    stubFetch(page([note("n1")]));
    const { container } = renderBell();
    fireEvent.click(bell());
    expect(container.querySelector("[aria-modal]")).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("não busca nada enquanto não for aberto", () => {
    const fetchMock = stubFetch();
    renderBell();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abrir busca as 8 mais recentes e mostra os itens, o contador e os atalhos", async () => {
    const fetchMock = stubFetch(page([note("n1"), note("n2", { readAt: "2026-10-05T16:00:00.000Z" })], 1));
    renderBell(1);
    await open();
    expect(POPOUT_SIZE).toBe(8);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/notifications?limit=8");
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect(within(panel()).getByText("Título n1")).toBeTruthy();
    expect(within(panel()).getByText("Título n2")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: "Marcar todas como lidas" })).toBeTruthy();
    const all = within(panel()).getByRole("link", { name: "Ver todas" });
    expect(all.getAttribute("href")).toBe("/admin/notificacoes");
  });

  it("o destino de 'Ver todas' é configurável", async () => {
    stubFetch(page([]));
    render(<NotificationBell initialUnreadCount={0} href="/outra" intervalMs={3_600_000} />);
    await open();
    expect(within(panel()).getByRole("link", { name: "Ver todas" }).getAttribute("href")).toBe("/outra");
  });

  it("mostra 'Carregando…' enquanto a resposta não chega", async () => {
    let release = /** @type {(value: Response) => void} */ (() => {});
    stubFetch(() => new Promise((resolve) => (release = resolve)));
    renderBell();
    fireEvent.click(bell());
    expect(within(panel()).getByText("Carregando as notificações…")).toBeTruthy();
    await act(async () => release(page([note("n1")])));
    expect(within(panel()).getByText("Título n1")).toBeTruthy();
  });

  it("sem notificações, diz que não há nenhuma", async () => {
    stubFetch(page([], 0));
    renderBell(0);
    await open();
    expect(within(panel()).getByText("Nenhuma notificação.")).toBeTruthy();
  });

  it("o texto do servidor aparece escapado, nunca como HTML", async () => {
    stubFetch(page([note("n1", { title: "<img src=x onerror=alert(1)>", text: "<script>alert(2)</script>" })]));
    renderBell(1);
    await open();
    expect(panel().querySelector("img")).toBeNull();
    expect(panel().querySelector("script")).toBeNull();
    expect(within(panel()).getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("os títulos dos itens não criam títulos (heading) fora de ordem no cabeçalho", async () => {
    stubFetch(page([note("n1"), note("n2")]));
    renderBell();
    await open();
    expect(within(panel()).queryAllByRole("heading")).toHaveLength(0);
  });

  it("o painel é absoluto (não desloca a barra) e, abaixo de 640 px, ocupa a largura da tela", () => {
    stubFetch();
    renderBell();
    expect(panel().className).toMatch(/(^| )absolute( |$)/);
    expect(panel().className).toMatch(/max-sm:fixed/);
    expect(panel().className).toMatch(/max-sm:inset-x-0/);
  });
});

describe("fechar", () => {
  it("o segundo clique no sino fecha", async () => {
    stubFetch(page([note("n1")]));
    renderBell();
    await open();
    fireEvent.click(bell());
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
  });

  it("Esc fecha e devolve o foco ao sino", async () => {
    stubFetch(page([note("n1")]));
    renderBell(1);
    await open();
    within(panel()).getByRole("button", { name: "Dispensar: Título n1" }).focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(bell());
  });

  it("Esc com o painel fechado não faz nada", () => {
    stubFetch();
    renderBell();
    bell().blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.activeElement).not.toBe(bell());
  });

  it("clique fora fecha; clique dentro não", async () => {
    stubFetch(page([note("n1")]));
    renderBell();
    await open();
    fireEvent.pointerDown(within(panel()).getByText("Título n1"));
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab para fora do painel o fecha, e Tab para dentro dele não", async () => {
    stubFetch(page([note("n1")]));
    render(
      <>
        <NotificationBell initialUnreadCount={1} intervalMs={3_600_000} />
        <button type="button">Fora</button>
      </>,
    );
    await open();
    const inside = within(panel()).getByRole("button", { name: "Dispensar: Título n1" });
    fireEvent.blur(bell(), { relatedTarget: inside });
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    fireEvent.blur(inside, { relatedTarget: screen.getByRole("button", { name: "Fora" }) });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab não fica preso: a tecla não é interceptada", async () => {
    stubFetch(page([note("n1")]));
    renderBell();
    await open();
    const notPrevented = fireEvent.keyDown(bell(), { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("true");
  });

  it("'Ver todas' fecha o painel", async () => {
    stubFetch(page([note("n1")]));
    renderBell();
    await open();
    fireEvent.click(within(panel()).getByRole("link", { name: "Ver todas" }));
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("uma resposta que chega depois de fechar é descartada; reabrir busca de novo", async () => {
    let release = /** @type {(value: Response) => void} */ (() => {});
    const fetchMock = stubFetch(() => new Promise((resolve) => (release = resolve)), page([note("n2")]));
    renderBell();
    fireEvent.click(bell());
    fireEvent.click(bell()); // fecha antes da resposta
    await act(async () => release(page([note("n1")])));
    expect(panel().textContent).toBe("");
    fireEvent.click(bell());
    await waitFor(() => expect(within(panel()).getByText("Título n2")).toBeTruthy());
    expect(within(panel()).queryByText("Título n1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("rodadas de abertura", () => {
  it("fechar e reabrir com a primeira resposta ainda pendente: ela é descartada, vale a da segunda abertura", async () => {
    const releases = /** @type {((value: Response) => void)[]} */ ([]);
    const pending = () => new Promise((resolve) => releases.push(resolve));
    stubFetch(pending, pending);
    renderBell();
    fireEvent.click(bell()); // rodada 1
    fireEvent.click(bell()); // fecha
    fireEvent.click(bell()); // rodada 2
    await act(async () => releases[0](page([note("n1")])));
    expect(within(panel()).queryByText("Título n1")).toBeNull();
    expect(within(panel()).getByText("Carregando as notificações…")).toBeTruthy();
    await act(async () => releases[1](page([note("n2")])));
    expect(within(panel()).getByText("Título n2")).toBeTruthy();
    expect(within(panel()).queryByText("Título n1")).toBeNull();
  });
});

describe("ler e dispensar dentro do painel", () => {
  it("dispensar chama o PATCH, tira o item e atualiza o contador do sino", async () => {
    const fetchMock = stubFetch(page([note("n1"), note("n2")], 2), json(200, { data: { id: "n1", dismissed: true }, unreadCount: 1 }));
    renderBell(2);
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Dispensar: Título n1" }));
    await waitFor(() => expect(within(panel()).queryByText("Título n1")).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notifications/n1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ dismissed: true });
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notificações, 1 não lida"));
  });

  it("marcar como lida chama o PATCH e atualiza o sino", async () => {
    const fetchMock = stubFetch(page([note("n1")], 1), json(200, { data: { id: "n1", read: true }, unreadCount: 0 }));
    renderBell(1);
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Marcar como lida: Título n1" }));
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notificações, nenhuma não lida"));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ read: true });
  });

  it("'Marcar todas como lidas' chama o POST de read-all", async () => {
    const fetchMock = stubFetch(page([note("n1"), note("n2")], 2), json(200, { data: { count: 2 }, unreadCount: 0 }));
    renderBell(2);
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Marcar todas como lidas" }));
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notificações, nenhuma não lida"));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notifications/read-all");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });

  it("o modo compacto não tem o filtro nem 'Carregar mais'", async () => {
    stubFetch(json(200, { data: [note("n1")], unreadCount: 1, nextCursor: "abc" }));
    renderBell(1);
    await open();
    expect(within(panel()).queryByRole("checkbox")).toBeNull();
    expect(within(panel()).queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });
});

describe("erros", () => {
  it("falha ao carregar mostra a mensagem e 'Tentar de novo', que busca outra vez", async () => {
    const fetchMock = stubFetch(json(500, { error: { code: "X", message: "m", details: [] } }), page([note("n1")]));
    renderBell(1);
    fireEvent.click(bell());
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toMatch(/servidor não conseguiu atender/);
    fireEvent.click(within(panel()).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(within(panel()).getByText("Título n1")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sem rede: a mensagem de conexão", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderBell();
    fireEvent.click(bell());
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toMatch(/conectar ao servidor/);
  });

  it("sessão expirada: a mensagem de login, com 'Ver todas' ainda à mão", async () => {
    stubFetch(json(401, { error: { code: "UNAUTHENTICATED", message: "m", details: [] } }));
    renderBell();
    fireEvent.click(bell());
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toMatch(/sessão expirou/);
  });
});
