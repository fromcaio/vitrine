// @vitest-environment jsdom
// Sino de notificações (RF33, RNF05; CT50, parte da UI): rótulo acessível com o contador, anúncio do
// aumento em aria-live, e a atualização leve (evento da lista, volta do foco, consulta periódica que
// para com a aba oculta). O relógio é simulado; a API é um fetch simulado.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell, POLL_INTERVAL_MS, bellAnnouncement, bellLabel } from "@/components/admin/NotificationBell";
import { announceUnreadCount } from "@/components/admin/notification-events";

const json = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const count = (/** @type {number} */ n) => json(200, { data: [], unreadCount: n, nextCursor: null });

let visibility = "visible";
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error volta ao getter do jsdom
  delete document.visibilityState;
});

/** @param {...(Response | (() => Promise<Response>))} responses */
function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (typeof response === "function") fetchMock.mockImplementationOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockImplementation(async () => count(0));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const advance = (/** @type {number} */ ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const link = () => screen.getByRole("link");
const live = () => /** @type {HTMLElement} */ (screen.getByRole("status"));

describe("bellLabel e bellAnnouncement", () => {
  it("o rótulo inclui o contador, no singular e no plural", () => {
    expect(bellLabel(0)).toBe("Notificações, nenhuma não lida");
    expect(bellLabel(1)).toBe("Notificações, 1 não lida");
    expect(bellLabel(3)).toBe("Notificações, 3 não lidas");
    expect(bellLabel(120)).toBe("Notificações, 120 não lidas");
  });

  it("o anúncio fala em notificação ou notificações", () => {
    expect(bellAnnouncement(1)).toBe("Você tem 1 notificação não lida.");
    expect(bellAnnouncement(4)).toBe("Você tem 4 notificações não lidas.");
  });
});

describe("o sino", () => {
  it("é um link para a lista, com o rótulo acessível que inclui o contador", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={3} />);
    expect(link().getAttribute("href")).toBe("/admin/notificacoes");
    expect(link().getAttribute("aria-label")).toBe("Notificações, 3 não lidas");
    expect(screen.getByTestId("contador-nao-lidas").textContent).toBe("3");
  });

  it("o endereço da lista é configurável", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={1} href="/outro" />);
    expect(link().getAttribute("href")).toBe("/outro");
  });

  it("sem não lidas, não mostra a bolinha, e o rótulo diz que não há", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={0} />);
    expect(screen.queryByTestId("contador-nao-lidas")).toBeNull();
    expect(link().getAttribute("aria-label")).toBe("Notificações, nenhuma não lida");
  });

  it("a bolinha é decorativa (aria-hidden) e mostra 99+ acima de 99; o rótulo traz o número exato", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={150} />);
    expect(screen.getByTestId("contador-nao-lidas").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("contador-nao-lidas").textContent).toBe("99+");
    expect(link().getAttribute("aria-label")).toBe("Notificações, 150 não lidas");
  });

  it("tem uma região aria-live educada, vazia no início", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={2} />);
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().textContent).toBe("");
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    stubFetch();
    const { container } = render(<NotificationBell initialUnreadCount={2} />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});

describe("atualização pelo evento da lista", () => {
  it("adota o contador anunciado e atualiza o rótulo", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={3} />);
    act(() => announceUnreadCount(1));
    expect(link().getAttribute("aria-label")).toBe("Notificações, 1 não lida");
    act(() => announceUnreadCount(0));
    expect(link().getAttribute("aria-label")).toBe("Notificações, nenhuma não lida");
    expect(screen.queryByTestId("contador-nao-lidas")).toBeNull();
  });

  it("anuncia só o AUMENTO: uma queda ou o mesmo valor não é anunciado", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={3} />);
    act(() => announceUnreadCount(2));
    expect(live().textContent).toBe("");
    act(() => announceUnreadCount(2));
    expect(live().textContent).toBe("");
    act(() => announceUnreadCount(5));
    expect(live().textContent).toBe("Você tem 5 notificações não lidas.");
  });

  it("o mesmo aviso, depois de uma queda, é anunciado de novo (o nó de texto é trocado)", () => {
    stubFetch();
    render(<NotificationBell initialUnreadCount={2} />);
    act(() => announceUnreadCount(3));
    const first = live().firstElementChild;
    act(() => announceUnreadCount(2));
    act(() => announceUnreadCount(3));
    expect(live().textContent).toBe("Você tem 3 notificações não lidas.");
    expect(live().firstElementChild).not.toBe(first);
  });

  it("deixa de ouvir ao desmontar", () => {
    stubFetch();
    const { unmount } = render(<NotificationBell initialUnreadCount={3} />);
    unmount();
    expect(() => act(() => announceUnreadCount(9))).not.toThrow();
  });
});

describe("consulta periódica (GET /api/notifications?limit=1)", () => {
  it("consulta a cada intervalo e adota o contador, anunciando o aumento", async () => {
    const fetchMock = stubFetch(count(5));
    render(<NotificationBell initialUnreadCount={2} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/notifications?limit=1");
    expect(link().getAttribute("aria-label")).toBe("Notificações, 5 não lidas");
    expect(live().textContent).toBe("Você tem 5 notificações não lidas.");
  });

  it("a consulta é leve: uma por minuto, muito abaixo das 60 leituras por minuto da API", async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell initialUnreadCount={0} />);
    await advance(POLL_INTERVAL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("o intervalo é configurável", async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell initialUnreadCount={0} intervalMs={5_000} />);
    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PARA com a aba oculta: nenhuma consulta enquanto ela estiver escondida", async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell initialUnreadCount={0} />);
    visibility = "hidden";
    await advance(POLL_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
    visibility = "visible";
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um contador igual ao que já tem não anuncia nada", async () => {
    stubFetch(count(2));
    render(<NotificationBell initialUnreadCount={2} />);
    await advance(POLL_INTERVAL_MS);
    expect(live().textContent).toBe("");
  });

  it("uma queda do contador (lidas em outra aba) atualiza o rótulo sem anunciar", async () => {
    stubFetch(count(0));
    render(<NotificationBell initialUnreadCount={4} />);
    await advance(POLL_INTERVAL_MS);
    expect(link().getAttribute("aria-label")).toBe("Notificações, nenhuma não lida");
    expect(live().textContent).toBe("");
  });

  it("para de vez com 401 (a sessão acabou) ou 403 (senha provisória)", async () => {
    for (const status of [401, 403]) {
      cleanup();
      const fetchMock = stubFetch(json(status, { error: { code: "X", message: "m", details: [] } }));
      render(<NotificationBell initialUnreadCount={1} />);
      await advance(POLL_INTERVAL_MS * 4);
      expect(fetchMock, `status ${status}`).toHaveBeenCalledTimes(1);
      expect(link().getAttribute("aria-label")).toBe("Notificações, 1 não lida");
    }
  });

  it("depois de um 429, pula uma rodada e volta ao normal", async () => {
    const fetchMock = stubFetch(json(429, { error: { code: "RATE_LIMITED", message: "m", details: [] } }, { "Retry-After": "30" }));
    render(<NotificationBell initialUnreadCount={1} />);
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1); // rodada pulada
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uma falha de rede ou 500 mantém o contador e segue tentando", async () => {
    const fetchMock = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")), json(500, {}), json(502, {}));
    render(<NotificationBell initialUnreadCount={3} />);
    await advance(POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(link().getAttribute("aria-label")).toBe("Notificações, 3 não lidas");
  });

  it("não consulta mais depois de desmontar", async () => {
    const fetchMock = stubFetch();
    const { unmount } = render(<NotificationBell initialUnreadCount={0} />);
    unmount();
    await advance(POLL_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("volta da janela ao primeiro plano", () => {
  it("o foco da janela dispara uma consulta, e a aba visível também", async () => {
    const fetchMock = stubFetch(count(4), count(6));
    render(<NotificationBell initialUnreadCount={2} />);
    await advance(11_000); // passa o intervalo mínimo entre duas consultas
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(link().getAttribute("aria-label")).toBe("Notificações, 4 não lidas");
    await advance(11_000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(link().getAttribute("aria-label")).toBe("Notificações, 6 não lidas");
  });

  it("não repete a consulta que acabou de acontecer (no máximo uma a cada 10 s)", async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell initialUnreadCount={0} />);
    await advance(11_000);
    for (let i = 0; i < 5; i++) {
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
    }
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(11_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("com a aba oculta, o foco não consulta", async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell initialUnreadCount={0} />);
    await advance(11_000);
    visibility = "hidden";
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deixa de ouvir o foco e a visibilidade ao desmontar (solta os ouvintes, e não só ignora o que chega)", async () => {
    const fetchMock = stubFetch();
    const removedFromWindow = vi.spyOn(window, "removeEventListener");
    const removedFromDocument = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<NotificationBell initialUnreadCount={0} />);
    await advance(11_000);
    unmount();
    expect(removedFromWindow.mock.calls.map(([type]) => type)).toContain("focus");
    expect(removedFromDocument.mock.calls.map(([type]) => type)).toContain("visibilitychange");
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
