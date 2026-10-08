// @vitest-environment jsdom
// `prefetch={false}` nos links que levam ao portal `/` a partir de páginas que NÃO o usam (pendência
// da M-038): o portal traz a folha do KaTeX, e pré-carregá-la no painel gera o aviso de console
// "preloaded CSS not used". O `Link` é trocado por um marcador que CAPTURA as props recebidas; a
// mutação que remove o `prefetch={false}` sobreviveu no M-038 porque nenhum teste olhava essa prop.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** @type {Record<string, unknown>[]} */
const received = [];
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (/** @type {Record<string, any>} */ props) => {
      received.push(props);
      const { href, children, prefetch: _prefetch, ...rest } = props;
      return createElement("a", { href, ...rest }, children);
    },
  };
});
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminLink } from "@/components/layout/AdminLink";
import { SESSION_MARKER_COOKIE } from "@/components/layout/session-marker";

afterEach(() => {
  cleanup();
  received.length = 0;
  document.cookie = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0`;
  vi.unstubAllGlobals();
});

describe("prefetch desligado nos links para o portal", () => {
  it("a marca do painel (`/`) recebe prefetch={false}", () => {
    render(<AdminHeader siteName="Vitrine" user={{ name: "Ana", email: "a@x.test" }} signOutAction={async () => {}} />);
    const brand = received.find((props) => props.href === "/");
    expect(brand).toBeDefined();
    expect(brand?.prefetch).toBe(false);
  });

  it("o link \"Administração\" recebe prefetch={false}", async () => {
    document.cookie = `${SESSION_MARKER_COOKIE}=1; Path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ session: { id: "s1" }, user: { id: "u1", name: "Ana", email: "a@x.test" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<AdminLink />);
    await waitFor(() => expect(screen.getByRole("link", { name: /Administração/ })).toBeTruthy());
    const link = received.at(-1);
    expect(link?.href).toMatch(/^\/admin/);
    expect(link?.prefetch).toBe(false);
  });
});
