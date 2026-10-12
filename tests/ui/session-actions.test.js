// @vitest-environment jsdom
// Ações de quem está logado nas páginas públicas (P-027): [Administração] [sino] [modo]. As páginas
// públicas são estáticas, então a decisão é do navegador: sem o cookie-marcador NADA acontece (nem
// requisição, nem o código do sino); com ele, UM só `get-session` confirma a sessão; sem a senha
// provisória, o contador é buscado e o sino aparece com ele; com a senha provisória, só o link.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, prefetch: _prefetch, ...rest }) => createElement("a", { href, ...rest }, children) };
});

// O módulo do sino só pode ser carregado DEPOIS de a sessão ser confirmada (importação sob demanda):
// o contador diz quantas vezes o módulo foi avaliado.
const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/components/layout/SessionBell", async () => {
  loaded.count += 1;
  return await vi.importActual("@/components/layout/SessionBell");
});

import { Navbar } from "@/components/layout/Navbar";
import { SessionActions } from "@/components/layout/SessionActions";
import { SESSION_MARKER_COOKIE, readSessionMarker } from "@/components/layout/session-marker";

const json = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const session = (/** @type {object} */ user = {}) =>
  json(200, { session: { id: "s1" }, user: { id: "u1", name: "Maria", email: "m@x.test", ...user } });
const unread = (/** @type {number} */ n) => json(200, { data: [], unreadCount: n, nextCursor: null });

/**
 * `fetch` simulado por endereço.
 * @param {{ session?: () => Promise<Response> | Response, count?: () => Promise<Response> | Response }} routes
 */
function stubFetch({ session: sessionRoute, count: countRoute }) {
  const fetchMock = vi.fn(async (/** @type {string} */ url) => {
    if (url === "/api/auth/get-session") return sessionRoute ? sessionRoute() : json(200, null);
    if (url.startsWith("/api/notifications")) return countRoute ? countRoute() : unread(0);
    throw new Error(`requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const calls = (/** @type {ReturnType<typeof vi.fn>} */ fetchMock, /** @type {string} */ prefix) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix));

const mark = () => {
  document.cookie = `${SESSION_MARKER_COOKIE}=1; Path=/`;
};
const unmark = () => {
  document.cookie = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0`;
};
const bell = () => screen.queryByRole("button", { name: /^Notificações/ });
const adminLink = () => screen.queryByRole("link", { name: "Administração" });
const follows = (/** @type {Node} */ a, /** @type {Node} */ b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  loaded.count = 0;
  unmark();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  unmark();
});

describe("SessionActions: o visitante anônimo", () => {
  it("sem o marcador, NADA acontece: nenhuma requisição, nenhum item, e o módulo do sino não é carregado", async () => {
    const fetchMock = stubFetch({ session: () => session(), count: () => unread(3) });
    render(<SessionActions />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminLink()).toBeNull();
    expect(bell()).toBeNull();
    expect(loaded.count).toBe(0);
  });

  it("um marcador com outro valor também não pergunta nada", async () => {
    document.cookie = `${SESSION_MARKER_COOKIE}=0; Path=/`;
    const fetchMock = stubFetch({ session: () => session() });
    render(<SessionActions />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loaded.count).toBe(0);
  });
});

describe("SessionActions: o logado", () => {
  it("sessão válida: o link e o sino com o contador certo, nesta ordem, com UM só get-session", async () => {
    mark();
    const fetchMock = stubFetch({ session: () => session(), count: () => unread(3) });
    render(<SessionActions />);
    const button = await screen.findByRole("button", { name: "Notificações, 3 não lidas" });
    const link = /** @type {HTMLElement} */ (adminLink());
    expect(link.getAttribute("href")).toBe("/admin");
    expect(follows(link, button)).toBe(true);
    expect(calls(fetchMock, "/api/auth/get-session")).toHaveLength(1);
    const countCalls = calls(fetchMock, "/api/notifications");
    expect(countCalls).toHaveLength(1);
    expect(countCalls[0][0]).toBe("/api/notifications?limit=1");
    expect(screen.getByTestId("contador-nao-lidas").textContent).toBe("3");
    expect(loaded.count).toBe(1);
  });

  it("o contador só é buscado depois do get-session, e o sino não aparece antes", async () => {
    mark();
    let release = /** @type {(value: Response) => void} */ (() => {});
    const fetchMock = stubFetch({ session: () => new Promise((resolve) => (release = resolve)), count: () => unread(1) });
    render(<SessionActions />);
    await act(async () => {});
    expect(calls(fetchMock, "/api/notifications")).toHaveLength(0);
    expect(bell()).toBeNull();
    expect(loaded.count).toBe(0);
    await act(async () => release(session()));
    await screen.findByRole("button", { name: "Notificações, 1 não lida" });
  });

  it("zero não lidas: o sino aparece, sem a bolinha do contador", async () => {
    mark();
    stubFetch({ session: () => session(), count: () => unread(0) });
    render(<SessionActions />);
    await screen.findByRole("button", { name: "Notificações, nenhuma não lida" });
    expect(screen.queryByTestId("contador-nao-lidas")).toBeNull();
  });

  it("com a senha provisória: só o link (para /admin/senha), sem sino, sem consulta e sem carregar o módulo", async () => {
    mark();
    const fetchMock = stubFetch({ session: () => session({ mustChangePassword: true }), count: () => unread(5) });
    render(<SessionActions />);
    const link = await screen.findByRole("link", { name: "Administração" });
    expect(link.getAttribute("href")).toBe("/admin/senha");
    await act(async () => {});
    expect(bell()).toBeNull();
    expect(calls(fetchMock, "/api/notifications")).toHaveLength(0);
    expect(loaded.count).toBe(0);
  });

  it("get-session nulo: o marcador é apagado e nada aparece nem é consultado", async () => {
    mark();
    const fetchMock = stubFetch({ session: () => json(200, null), count: () => unread(2) });
    render(<SessionActions />);
    await waitFor(() => expect(readSessionMarker()).toBe(false));
    expect(adminLink()).toBeNull();
    expect(bell()).toBeNull();
    expect(calls(fetchMock, "/api/notifications")).toHaveLength(0);
    expect(loaded.count).toBe(0);
  });

  it("401 no get-session: o marcador é apagado e nada aparece", async () => {
    mark();
    stubFetch({ session: () => json(401, { error: { code: "UNAUTHENTICATED", message: "m", details: [] } }) });
    render(<SessionActions />);
    await waitFor(() => expect(readSessionMarker()).toBe(false));
    expect(adminLink()).toBeNull();
    expect(bell()).toBeNull();
    expect(loaded.count).toBe(0);
  });

  it("falha de rede no get-session: nada aparece e o marcador fica", async () => {
    mark();
    stubFetch({ session: () => Promise.reject(new TypeError("Failed to fetch")) });
    render(<SessionActions />);
    await act(async () => {});
    expect(adminLink()).toBeNull();
    expect(bell()).toBeNull();
    expect(readSessionMarker()).toBe(true);
  });
});

describe("SessionActions: o contador falha", () => {
  /** @type {[string, () => Promise<Response> | Response][]} */
  const failures = [
    ["falha de rede", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["429", () => json(429, { error: { code: "RATE_LIMITED", message: "m", details: [] } }, { "Retry-After": "30" })],
    ["500", () => json(500, {})],
    ["401", () => json(401, { error: { code: "UNAUTHENTICATED", message: "m", details: [] } })],
    ["403", () => json(403, { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "m", details: [] } })],
    ["corpo sem contador", () => json(200, { data: [] })],
  ];

  for (const [name, count] of failures) {
    it(`${name}: sem sino, sem erro na tela, o link continua e o marcador NÃO é apagado`, async () => {
      mark();
      const fetchMock = stubFetch({ session: () => session(), count });
      const { container } = render(<SessionActions />);
      await screen.findByRole("link", { name: "Administração" });
      await waitFor(() => expect(calls(fetchMock, "/api/notifications")).toHaveLength(1));
      await act(async () => {});
      expect(bell()).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(container.textContent).toBe("Administração");
      expect(readSessionMarker()).toBe(true);
    });
  }
});

describe("SessionActions: o sino montado é o NotificationBell de sempre", () => {
  it("o clique abre o popout e busca as 8 mais recentes; Esc fecha e devolve o foco ao sino", async () => {
    mark();
    const fetchMock = stubFetch({ session: () => session(), count: () => unread(2) });
    render(<SessionActions />);
    const button = await screen.findByRole("button", { name: "Notificações, 2 não lidas" });
    await act(async () => button.click());
    await waitFor(() => expect(calls(fetchMock, "/api/notifications?limit=8")).toHaveLength(1));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Ver todas" }).getAttribute("href")).toBe("/admin/notificacoes");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
});

describe("Navbar: a ordem [Administração] [sino] [modo]", () => {
  it("o logado vê os três, nesta ordem, depois da marca", async () => {
    mark();
    stubFetch({ session: () => session(), count: () => unread(4) });
    render(<Navbar name="Espaço" homeHref="/maria" />);
    const bellButton = await screen.findByRole("button", { name: "Notificações, 4 não lidas" });
    const link = /** @type {HTMLElement} */ (adminLink());
    const brand = screen.getByRole("link", { name: /Espaço/ });
    const buttons = screen.getAllByRole("button");
    const mode = buttons[buttons.length - 1];
    expect(mode).not.toBe(bellButton);
    expect(follows(brand, link)).toBe(true);
    expect(follows(link, bellButton)).toBe(true);
    expect(follows(bellButton, mode)).toBe(true);
  });

  it("adminLink={false} (a pré-visualização da aparência): nenhuma consulta e nenhum sino, mesmo com o marcador", async () => {
    mark();
    const fetchMock = stubFetch({ session: () => session(), count: () => unread(4) });
    render(<Navbar name="Espaço" homeHref="/maria" adminLink={false} />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bell()).toBeNull();
    expect(adminLink()).toBeNull();
    expect(loaded.count).toBe(0);
  });

  it("o visitante anônimo não faz nenhuma requisição na barra", async () => {
    const fetchMock = stubFetch({});
    render(<Navbar name="Espaço" homeHref="/maria" />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loaded.count).toBe(0);
  });
});

describe("tokens de tema", () => {
  it("o sino e o link só usam tokens", async () => {
    mark();
    stubFetch({ session: () => session(), count: () => unread(1) });
    const { container } = render(<SessionActions />);
    await screen.findByRole("button", { name: /^Notificações/ });
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});
