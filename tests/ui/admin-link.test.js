// @vitest-environment jsdom
// Link "Administração" das páginas públicas e o cookie-marcador de sessão (A-027, item 5 do épico v1;
// ADR-037): as páginas públicas são estáticas, então a decisão de mostrar o link é do navegador.
// Sem o marcador `vitrine-logado=1`, NENHUMA requisição; com ele, `GET /api/auth/get-session`
// confirma (sessão válida mostra o link; `null` ou 401 apaga o marcador; erro de rede não mostra nada).
// O `LoginForm` grava o marcador ao entrar; o `SignOutForm` o apaga ao sair.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: vi.fn() } } }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

import { LoginForm } from "@/components/admin/LoginForm";
import { SignOutForm } from "@/components/admin/SignOutForm";
import { AdminLink, SESSION_URL } from "@/components/layout/AdminLink";
import {
  SESSION_MARKER_COOKIE,
  SESSION_MARKER_MAX_AGE,
  clearedMarkerCookieString,
  hasSessionMarker,
  markerCookieString,
  readSessionMarker,
} from "@/components/layout/session-marker";
import { authClient } from "@/lib/auth-client";

const json = (/** @type {number} */ status, /** @type {unknown} */ body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

const mark = () => {
  document.cookie = `${SESSION_MARKER_COOKIE}=1; Path=/`;
};
const unmark = () => {
  document.cookie = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0`;
};
const session = (/** @type {object} */ user = {}) => json(200, { session: { id: "s1" }, user: { id: "u1", name: "Maria", email: "m@x.test", ...user } });

beforeEach(() => unmark());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  unmark();
});

describe("o cookie-marcador", () => {
  it("o nome e o formato: Path=/, SameSite=Lax, sem HttpOnly, validade da sessão (7 dias); Secure só em HTTPS", () => {
    expect(SESSION_MARKER_COOKIE).toBe("vitrine-logado");
    expect(SESSION_MARKER_MAX_AGE).toBe(7 * 24 * 60 * 60);
    expect(markerCookieString(false)).toBe(`vitrine-logado=1; Path=/; Max-Age=${SESSION_MARKER_MAX_AGE}; SameSite=Lax`);
    expect(markerCookieString(true)).toBe(`vitrine-logado=1; Path=/; Max-Age=${SESSION_MARKER_MAX_AGE}; SameSite=Lax; Secure`);
    expect(markerCookieString(false)).not.toMatch(/HttpOnly/i);
    expect(clearedMarkerCookieString(false)).toMatch(/^vitrine-logado=; Path=\/; Max-Age=0/);
  });

  it("só o valor exato 1 vale, no cookie de nome exato", () => {
    expect(hasSessionMarker("vitrine-logado=1")).toBe(true);
    expect(hasSessionMarker("a=2; vitrine-logado=1; b=3")).toBe(true);
    expect(hasSessionMarker("vitrine-logado=0")).toBe(false);
    expect(hasSessionMarker("vitrine-logado=")).toBe(false);
    expect(hasSessionMarker("x-vitrine-logado=1")).toBe(false);
    expect(hasSessionMarker("")).toBe(false);
  });

  it("cookies bloqueados: readSessionMarker não lança e diz que não há marcador", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      expect(readSessionMarker()).toBe(false);
    } finally {
      delete (/** @type {any} */ (document).cookie);
    }
  });
});

describe("AdminLink", () => {
  it("o visitante anônimo (sem marcador) não faz NENHUMA requisição e não vê o link", async () => {
    const fetchMock = stubFetch(session());
    render(<AdminLink />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  it("um marcador com outro valor também não pergunta nada", async () => {
    document.cookie = "vitrine-logado=0; Path=/";
    const fetchMock = stubFetch(session());
    render(<AdminLink />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com o marcador, pergunta ao get-session (fetch simples, sem cache) e mostra o link para /admin", async () => {
    mark();
    const fetchMock = stubFetch(session());
    render(<AdminLink />);
    const link = await screen.findByRole("link", { name: "Administração" });
    expect(link.getAttribute("href")).toBe("/admin");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/get-session");
    expect(SESSION_URL).toBe("/api/auth/get-session");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    expect(readSessionMarker()).toBe(true);
  });

  it("não mostra o link antes de a resposta chegar (sem 'piscar' para quem perdeu a sessão)", async () => {
    mark();
    let release = /** @type {(value: Response) => void} */ (() => {});
    stubFetch(() => new Promise((resolve) => (release = resolve)));
    render(<AdminLink />);
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
    await act(async () => release(session()));
    expect(screen.getByRole("link", { name: "Administração" })).toBeTruthy();
  });

  it("get-session devolve null: o marcador estava velho, é apagado e nada aparece", async () => {
    mark();
    const fetchMock = stubFetch(json(200, null));
    render(<AdminLink />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(readSessionMarker()).toBe(false));
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  it("401 também apaga o marcador", async () => {
    mark();
    stubFetch(json(401, { error: { code: "UNAUTHENTICATED", message: "m", details: [] } }));
    render(<AdminLink />);
    await waitFor(() => expect(readSessionMarker()).toBe(false));
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  it("erro de rede ou 500: não mostra o link e MANTÉM o marcador", async () => {
    mark();
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const { unmount } = render(<AdminLink />);
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
    expect(readSessionMarker()).toBe(true);
    unmount();
    stubFetch(json(500, {}));
    render(<AdminLink />);
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
    expect(readSessionMarker()).toBe(true);
  });

  it("uma resposta sem usuário (corpo estranho) não mostra o link", async () => {
    mark();
    stubFetch(json(200, { session: {} }));
    render(<AdminLink />);
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  it("com a senha provisória pendente, o link leva a /admin/senha", async () => {
    mark();
    stubFetch(session({ mustChangePassword: true }));
    render(<AdminLink />);
    expect((await screen.findByRole("link", { name: "Administração" })).getAttribute("href")).toBe("/admin/senha");
  });

  it("desmontar antes da resposta não atualiza o estado nem lança", async () => {
    mark();
    let release = /** @type {(value: Response) => void} */ (() => {});
    stubFetch(() => new Promise((resolve) => (release = resolve)));
    const { unmount } = render(<AdminLink />);
    unmount();
    await act(async () => release(session()));
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  it("só usa tokens de tema", async () => {
    mark();
    stubFetch(session());
    const { container } = render(<AdminLink />);
    await screen.findByRole("link", { name: "Administração" });
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});

describe("o LoginForm grava o marcador e o SignOutForm o apaga", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
  });

  it("login bem-sucedido: grava o marcador ANTES de navegar", async () => {
    const assign = vi.fn(() => {
      expect(readSessionMarker()).toBe(true);
    });
    vi.stubGlobal("location", { ...window.location, assign });
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({ error: null });
    render(<LoginForm redirectTo="/admin" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@x.test" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo" } });
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }).closest("form"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin"));
    expect(readSessionMarker()).toBe(true);
  });

  it("login recusado: nenhum marcador", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({ error: { status: 401, message: "x" } });
    render(<LoginForm redirectTo="/admin" />);
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }).closest("form"));
    await screen.findByText("E-mail ou senha inválidos.");
    expect(readSessionMarker()).toBe(false);
  });

  it("sair apaga o marcador (e chama a Server Function)", async () => {
    mark();
    const action = vi.fn(async () => {});
    render(<SignOutForm action={action} />);
    expect(readSessionMarker()).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Sair" }).closest("form"));
    expect(readSessionMarker()).toBe(false);
  });
});
