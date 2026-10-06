// @vitest-environment jsdom
// Lista de notificações (RF33, RN26, RNF05, RNF06; CT50, parte da UI): gravidade com ícone e texto,
// o texto do servidor sempre escapado, filtro de não lidas, marcar como lida, dispensar, marcar
// todas, "carregar mais" pelo cursor, o 422 do cursor, o 404 e as mensagens de 401, 403, 429. A API
// é um fetch simulado; o navegador de verdade fica para o ensaio sobre o build de produção.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { NotificationList } from "@/components/admin/NotificationList";
import { UNREAD_COUNT_EVENT, onUnreadCount } from "@/components/admin/notification-events";

const json = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const error = (/** @type {number} */ status, code = "X", headers = {}) => json(status, { error: { code, message: "m", details: [] } }, headers);

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
const page = (/** @type {object[]} */ data, unreadCount = data.length, nextCursor = /** @type {string | null} */ (null)) => json(200, { data, unreadCount, nextCursor });

/** @param {...(Response | (() => Promise<Response>))} responses */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (typeof response === "function") fetchMock.mockImplementationOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Contadores anunciados ao sino durante o teste. */
let announced = /** @type {number[]} */ ([]);
let stopListening = () => {};
beforeEach(() => {
  announced = [];
  stopListening = onUnreadCount((count) => announced.push(count));
});
afterEach(() => {
  stopListening();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const initial = (/** @type {object[]} */ items, unreadCount = items.length, nextCursor = /** @type {string | null} */ (null)) => ({ items, unreadCount, nextCursor });
const itemOf = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[id$="-item-${id}"]`));
const button = (/** @type {RegExp | string} */ name) => screen.getByRole("button", { name });
const urlOf = (/** @type {import("vitest").Mock<any>} */ fetchMock, call = 0) => fetchMock.mock.calls[call][0];

describe("os itens", () => {
  it("mostra título, texto, data e a gravidade com ícone E texto", () => {
    render(<NotificationList initial={initial([note("n1", { severity: "CRITICAL" }), note("n2", { severity: "WARNING" }), note("n3", { severity: "INFO" })])} />);
    expect(within(itemOf("n1")).getByText("Crítico")).toBeTruthy();
    expect(within(itemOf("n2")).getByText("Aviso")).toBeTruthy();
    expect(within(itemOf("n3")).getByText("Informação")).toBeTruthy();
    for (const id of ["n1", "n2", "n3"]) {
      expect(within(itemOf(id)).getByRole("heading", { level: 3, name: `Título ${id}` })).toBeTruthy();
      expect(within(itemOf(id)).getByText(`Texto ${id}`)).toBeTruthy();
      expect(itemOf(id).querySelector("svg[aria-hidden='true']")).toBeTruthy();
    }
    expect(itemOf("n1").getAttribute("data-severity")).toBe("CRITICAL");
  });

  it("a data sai em português, no horário de Brasília, com o dateTime ISO", () => {
    render(<NotificationList initial={initial([note("n1")])} />);
    const time = itemOf("n1").querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-10-05T15:30:00.000Z");
    expect(time?.textContent).toMatch(/05\/10\/2026.*12:30/);
  });

  it("uma data inválida não derruba a lista", () => {
    render(<NotificationList initial={initial([note("n1", { createdAt: "ontem" })])} />);
    expect(itemOf("n1").querySelector("time")?.textContent).toBe("");
  });

  it("a gravidade crítica usa o token de erro; a não lida tem o selo 'Não lida' (texto, não só destaque)", () => {
    render(<NotificationList initial={initial([note("n1", { severity: "CRITICAL" }), note("n2", { readAt: "2026-10-05T16:00:00.000Z" })])} />);
    expect(within(itemOf("n1")).getByText("Crítico").className).toMatch(/text-danger/);
    expect(within(itemOf("n1")).getByText("Não lida")).toBeTruthy();
    expect(within(itemOf("n2")).queryByText("Não lida")).toBeNull();
  });

  it("uma notificação resolvida (contraste corrigido) leva o selo 'Resolvida'", () => {
    render(<NotificationList initial={initial([note("n1", { resolvedAt: "2026-10-05T17:00:00.000Z" })])} />);
    expect(within(itemOf("n1")).getByText("Resolvida")).toBeTruthy();
  });

  it("o texto do servidor é exibido ESCAPADO, nunca como HTML (inclusive o motivo de uma moderação)", () => {
    const hostile = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> <b>negrito</b>';
    render(<NotificationList initial={initial([note("n1", { title: `<i>${hostile}`, text: `Motivo: ${hostile}` })])} />);
    const item = itemOf("n1");
    expect(item.querySelector("img, script, b, i")).toBeNull();
    expect(item.querySelector("p")?.textContent).toBe(`Motivo: ${hostile}`);
    expect(item.querySelector("h3")?.textContent).toBe(`<i>${hostile}`);
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });

  it("quebras de linha do texto são preservadas, sem HTML", () => {
    render(<NotificationList initial={initial([note("n1", { text: "linha 1\nlinha 2" })])} />);
    const paragraph = /** @type {HTMLElement} */ (itemOf("n1").querySelector("p"));
    expect(paragraph.textContent).toBe("linha 1\nlinha 2");
    expect(paragraph.className).toMatch(/whitespace-pre-line/);
    expect(paragraph.querySelector("br")).toBeNull();
  });

  it("sem notificações, mostra o estado vazio", () => {
    render(<NotificationList initial={initial([], 0)} />);
    expect(screen.getByText("Nenhuma notificação.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("um item malformado (sem id) é ignorado", () => {
    render(<NotificationList initial={initial([note("n1"), { title: "sem id" }, null])} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<NotificationList initial={initial([note("n1")])} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate|yellow)-\d/);
  });
});

describe("a barra de ferramentas", () => {
  it("mostra quantas não lidas há, no singular e no plural", () => {
    const { unmount } = render(<NotificationList initial={initial([note("n1")], 1)} />);
    expect(screen.getByText("1 não lida.")).toBeTruthy();
    unmount();
    render(<NotificationList initial={initial([note("n1"), note("n2")], 5)} />);
    expect(screen.getByText("5 não lidas.")).toBeTruthy();
  });

  it("sem não lidas, 'Marcar todas' fica desabilitado", () => {
    render(<NotificationList initial={initial([note("n1", { readAt: "2026-10-05T16:00:00.000Z" })], 0)} />);
    expect(screen.getByText("Nenhuma não lida.")).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (button("Marcar todas como lidas")).disabled).toBe(true);
  });
});

describe("filtro 'só as não lidas'", () => {
  it("recarrega do início com ?unread=1 e troca a lista", async () => {
    const fetchMock = stubFetch(page([note("n9")], 1));
    render(<NotificationList initial={initial([note("n1"), note("n2", { readAt: "2026-10-05T16:00:00.000Z" })], 1)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(urlOf(fetchMock)).toBe("/api/notifications?limit=20&unread=1");
    await waitFor(() => expect(itemOf("n9")).toBeTruthy());
    expect(document.querySelector('li[id$="-item-n1"]')).toBeNull();
  });

  it("desmarcar volta a pedir sem o filtro", async () => {
    const fetchMock = stubFetch(page([note("n9")], 1), page([note("n1"), note("n9")], 2));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    const filter = screen.getByRole("checkbox", { name: "Mostrar só as não lidas" });
    fireEvent.click(filter);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(/** @type {HTMLInputElement} */ (filter).disabled).toBe(false));
    fireEvent.click(filter);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(urlOf(fetchMock, 1)).toBe("/api/notifications?limit=20");
  });

  it("com o filtro ligado e nada a mostrar, o estado vazio diz que não há não lidas", async () => {
    stubFetch(page([], 0));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    expect(await screen.findByText("Nenhuma notificação não lida.")).toBeTruthy();
  });

  it("anuncia o contador da resposta ao sino", async () => {
    stubFetch(page([note("n9")], 4));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    await waitFor(() => expect(announced).toEqual([4]));
    expect(screen.getByText("4 não lidas.")).toBeTruthy();
  });

  it("um erro ao filtrar mostra a mensagem e mantém a lista", async () => {
    stubFetch(error(500));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    expect(await screen.findByText("O servidor não conseguiu atender agora. Tente de novo em instantes.")).toBeTruthy();
    expect(itemOf("n1")).toBeTruthy();
  });
});

describe("marcar como lida (PATCH { read: true })", () => {
  it("marca o item, tira o selo e o botão, atualiza o contador e avisa o sino", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "n1", read: true }, unreadCount: 1 }));
    render(<NotificationList initial={initial([note("n1"), note("n2")], 2)} />);
    fireEvent.click(button("Marcar como lida: Título n1"));
    await waitFor(() => expect(within(itemOf("n1")).queryByText("Não lida")).toBeNull());

    expect(urlOf(fetchMock)).toBe("/api/notifications/n1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ read: true });
    expect(within(itemOf("n1")).queryByRole("button", { name: /Marcar como lida/ })).toBeNull();
    expect(within(itemOf("n2")).getByText("Não lida")).toBeTruthy();
    expect(screen.getByText("1 não lida.")).toBeTruthy();
    expect(announced).toEqual([1]);
    expect(screen.getByRole("status").textContent).toContain("Notificação marcada como lida.");
  });

  it("com o filtro de não lidas ligado, a lida sai da lista", async () => {
    stubFetch(page([note("n1"), note("n2")], 2), json(200, { data: { id: "n1", read: true }, unreadCount: 1 }));
    render(<NotificationList initial={initial([note("n1"), note("n2")], 2)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    await waitFor(() => expect(/** @type {HTMLInputElement} */ (screen.getByRole("checkbox")).disabled).toBe(false));
    fireEvent.click(button("Marcar como lida: Título n1"));
    await waitFor(() => expect(document.querySelector('li[id$="-item-n1"]')).toBeNull());
    expect(itemOf("n2")).toBeTruthy();
  });

  it("os botões ficam desabilitados enquanto o pedido está em andamento", async () => {
    let finish = /** @type {(response: Response) => void} */ (() => {});
    stubFetch(() => new Promise((resolve) => { finish = resolve; }));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(button("Marcar como lida: Título n1"));
    await waitFor(() => expect(/** @type {HTMLButtonElement} */ (button("Dispensar: Título n1")).disabled).toBe(true));
    expect(/** @type {HTMLButtonElement} */ (button("Marcar todas como lidas")).disabled).toBe(true);
    expect(screen.getByRole("region", { name: "Notificações" }).getAttribute("aria-busy")).toBe("true");
    finish(json(200, { data: {}, unreadCount: 0 }));
    await waitFor(() => expect(/** @type {HTMLButtonElement} */ (button("Dispensar: Título n1")).disabled).toBe(false));
  });

  it("o botão de uma notificação já lida não existe", () => {
    render(<NotificationList initial={initial([note("n1", { readAt: "2026-10-05T16:00:00.000Z" })], 0)} />);
    expect(screen.queryByRole("button", { name: /Marcar como lida:/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Dispensar: Título n1" })).toBeTruthy();
  });
});

describe("dispensar (PATCH { dismissed: true })", () => {
  it("remove o item, atualiza o contador, avisa o sino e anuncia", async () => {
    const fetchMock = stubFetch(json(200, { data: { id: "n1", dismissed: true }, unreadCount: 1 }));
    render(<NotificationList initial={initial([note("n1"), note("n2")], 2)} />);
    fireEvent.click(button("Dispensar: Título n1"));
    await waitFor(() => expect(document.querySelector('li[id$="-item-n1"]')).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ dismissed: true });
    expect(itemOf("n2")).toBeTruthy();
    expect(announced).toEqual([1]);
    expect(screen.getByRole("status").textContent).toContain("Notificação dispensada.");
  });

  it("o foco vai para o item seguinte (e, sem ele, para o filtro): nunca se perde no <body>", async () => {
    stubFetch(json(200, { data: {}, unreadCount: 1 }), json(200, { data: {}, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1"), note("n2")], 2)} />);
    fireEvent.click(button("Dispensar: Título n1"));
    await waitFor(() => expect(document.querySelector('li[id$="-item-n1"]')).toBeNull());
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Marcar como lida: Título n2"));
    fireEvent.click(button("Dispensar: Título n2"));
    await waitFor(() => expect(screen.getByText("Nenhuma notificação.")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
  });

  it("dispensar a última faz aparecer o estado vazio", async () => {
    stubFetch(json(200, { data: {}, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(button("Dispensar: Título n1"));
    expect(await screen.findByText("Nenhuma notificação.")).toBeTruthy();
  });
});

describe("404: já dispensada em outra aba", () => {
  it("remove o item e explica, ao marcar como lida ou ao dispensar", async () => {
    stubFetch(error(404, "NOT_FOUND"), error(404, "NOT_FOUND"));
    render(<NotificationList initial={initial([note("n1"), note("n2")], 2)} />);
    fireEvent.click(button("Marcar como lida: Título n1"));
    await waitFor(() => expect(document.querySelector('li[id$="-item-n1"]')).toBeNull());
    expect(screen.getByRole("alert").textContent).toContain("Esta notificação não existe mais; talvez tenha sido dispensada em outra aba.");
    fireEvent.click(button("Dispensar: Título n2"));
    await waitFor(() => expect(document.querySelector('li[id$="-item-n2"]')).toBeNull());
    expect(announced).toEqual([]);
  });
});

describe("marcar todas (POST /api/notifications/read-all)", () => {
  it("marca todas como lidas, zera o contador, avisa o sino e conta quantas foram", async () => {
    const fetchMock = stubFetch(json(200, { data: { count: 2 }, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1"), note("n2"), note("n3", { readAt: "2026-10-05T16:00:00.000Z" })], 2)} />);
    fireEvent.click(button("Marcar todas como lidas"));
    await waitFor(() => expect(screen.queryByText("Não lida")).toBeNull());
    expect(urlOf(fetchMock)).toBe("/api/notifications/read-all");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(screen.getByText("Nenhuma não lida.")).toBeTruthy();
    expect(announced).toEqual([0]);
    expect(screen.getByRole("status").textContent).toContain("2 notificações marcadas como lidas.");
    expect(/** @type {HTMLButtonElement} */ (button("Marcar todas como lidas")).disabled).toBe(true);
  });

  it("uma só: singular", async () => {
    stubFetch(json(200, { data: { count: 1 }, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(button("Marcar todas como lidas"));
    expect(await screen.findByText("1 notificação marcada como lida.")).toBeTruthy();
  });

  it("com o filtro de não lidas, a lista esvazia", async () => {
    stubFetch(page([note("n1")], 1), json(200, { data: { count: 1 }, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1")], 1, "n1")} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    await waitFor(() => expect(/** @type {HTMLInputElement} */ (screen.getByRole("checkbox")).disabled).toBe(false));
    fireEvent.click(button("Marcar todas como lidas"));
    expect(await screen.findByText("Nenhuma notificação não lida.")).toBeTruthy();
  });
});

describe("carregar mais, pelo cursor", () => {
  it("só aparece com um próximo cursor", () => {
    const { unmount } = render(<NotificationList initial={initial([note("n1")], 1, null)} />);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    unmount();
    render(<NotificationList initial={initial([note("n1")], 1, "n1")} />);
    expect(button("Carregar mais")).toBeTruthy();
  });

  it("pede a próxima página com o cursor e acrescenta os itens, sem repetir os que já tem", async () => {
    const fetchMock = stubFetch(page([note("n2"), note("n3"), note("n1")], 3, "n3"));
    render(<NotificationList initial={initial([note("n1")], 3, "n1")} />);
    fireEvent.click(button("Carregar mais"));
    await waitFor(() => expect(itemOf("n3")).toBeTruthy());
    expect(urlOf(fetchMock)).toBe("/api/notifications?limit=20&cursor=n1");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Título n1", "Título n2", "Título n3"]);
    // O próximo cursor veio na resposta: o botão continua.
    expect(button("Carregar mais")).toBeTruthy();
  });

  it("na última página, o botão some", async () => {
    stubFetch(page([note("n2")], 2, null));
    render(<NotificationList initial={initial([note("n1")], 2, "n1")} />);
    fireEvent.click(button("Carregar mais"));
    await waitFor(() => expect(itemOf("n2")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("com o filtro ligado, o cursor vai junto de unread=1", async () => {
    const fetchMock = stubFetch(page([note("n1")], 1, "n1"), page([note("n2")], 1, null));
    render(<NotificationList initial={initial([note("n0")], 1, null)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar só as não lidas" }));
    await waitFor(() => expect(button("Carregar mais")).toBeTruthy());
    fireEvent.click(button("Carregar mais"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(urlOf(fetchMock, 1)).toBe("/api/notifications?limit=20&unread=1&cursor=n1");
  });

  it("usa o tamanho de página informado", async () => {
    const fetchMock = stubFetch(page([note("n2")], 2));
    render(<NotificationList initial={initial([note("n1")], 2, "n1")} pageSize={5} />);
    fireEvent.click(button("Carregar mais"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urlOf(fetchMock)).toBe("/api/notifications?limit=5&cursor=n1");
  });

  it("422 do cursor (um item dispensado entre as páginas): recomeça pela primeira página e avisa", async () => {
    const fetchMock = stubFetch(error(422, "VALIDATION_ERROR"), page([note("n1"), note("n2")], 2, "n2"));
    render(<NotificationList initial={initial([note("n1"), note("n7")], 2, "n7")} />);
    fireEvent.click(button("Carregar mais"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(urlOf(fetchMock, 0)).toBe("/api/notifications?limit=20&cursor=n7");
    expect(urlOf(fetchMock, 1)).toBe("/api/notifications?limit=20");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("A lista mudou desde a última página. Ela foi recarregada do início."));
    expect(document.querySelector('li[id$="-item-n7"]')).toBeNull();
    expect(itemOf("n2")).toBeTruthy();
  });

  it("outros erros do carregar mais mostram a mensagem e mantêm o que está na tela", async () => {
    stubFetch(error(429, "RATE_LIMITED", { "Retry-After": "12" }));
    render(<NotificationList initial={initial([note("n1")], 1, "n1")} />);
    fireEvent.click(button("Carregar mais"));
    expect(await screen.findByText(/Tente de novo em 12 segundos\./)).toBeTruthy();
    expect(itemOf("n1")).toBeTruthy();
    expect(button("Carregar mais")).toBeTruthy();
  });
});

describe("mensagens de 401, 403 e 429", () => {
  async function failWith(/** @type {Response} */ response) {
    stubFetch(response);
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    fireEvent.click(button("Dispensar: Título n1"));
  }

  it("401: a sessão expirou, com o link do login, e o item continua na tela", async () => {
    await failWith(error(401, "UNAUTHENTICATED"));
    expect(await screen.findByText(/Sua sessão expirou\. Entre de novo para ver as suas notificações\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
    expect(itemOf("n1")).toBeTruthy();
  });

  it("403: sem permissão; com a senha provisória, pede a troca", async () => {
    await failWith(error(403, "FORBIDDEN"));
    expect(await screen.findByText("Você não tem permissão para esta operação.")).toBeTruthy();
    cleanup();
    await failWith(error(403, "PASSWORD_CHANGE_REQUIRED"));
    expect(await screen.findByText("Troque a senha provisória antes de usar as notificações.")).toBeTruthy();
  });

  it("429: pede para aguardar, com os segundos do Retry-After", async () => {
    await failWith(error(429, "RATE_LIMITED", { "Retry-After": "30" }));
    expect(await screen.findByText(/Muitas requisições em pouco tempo\..* Tente de novo em 30 segundos\./)).toBeTruthy();
  });

  it("5xx e sem rede: mensagens de servidor e de conexão; os botões voltam a habilitar", async () => {
    await failWith(error(500));
    expect(await screen.findByText("O servidor não conseguiu atender agora. Tente de novo em instantes.")).toBeTruthy();
    await waitFor(() => expect(/** @type {HTMLButtonElement} */ (button("Dispensar: Título n1")).disabled).toBe(false));
  });

  it("a mensagem de erro é anunciada (role=alert) e a de sucesso, em um status separado", async () => {
    await failWith(error(500));
    await screen.findByRole("alert");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("a lista e o sino conversam por um evento do navegador", () => {
  it("dispensar na lista atualiza o rótulo do sino", async () => {
    stubFetch(json(200, { data: { id: "n1", dismissed: true }, unreadCount: 1 }));
    render(
      <>
        <NotificationBell initialUnreadCount={2} />
        <NotificationList initial={initial([note("n1"), note("n2")], 2)} />
      </>,
    );
    expect(screen.getByRole("link", { name: "Notificações, 2 não lidas" })).toBeTruthy();
    fireEvent.click(button("Dispensar: Título n1"));
    await screen.findByRole("link", { name: "Notificações, 1 não lida" });
  });

  it("o evento tem o nome e o detail combinados com o sino", async () => {
    const received = /** @type {CustomEvent[]} */ ([]);
    const handler = (/** @type {Event} */ event) => received.push(/** @type {CustomEvent} */ (event));
    window.addEventListener(UNREAD_COUNT_EVENT, handler);
    stubFetch(json(200, { data: { count: 1 }, unreadCount: 0 }));
    render(<NotificationList initial={initial([note("n1")], 1)} />);
    await act(async () => {
      fireEvent.click(button("Marcar todas como lidas"));
    });
    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0].detail).toEqual({ unreadCount: 0 });
    window.removeEventListener(UNREAD_COUNT_EVENT, handler);
  });
});
