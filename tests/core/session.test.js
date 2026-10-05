// requireSession (A-014 Parte 3a, item 6; RN19; ADR-029, item 7): sem sessão, redireciona a /login com o
// destino; papel insuficiente, `notFound()`; com a sessão e o papel certos, devolve a sessão. O
// `getSession` do better-auth, os cabeçalhos e a navegação do Next.js são substituídos.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: "sessao=abc" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { requireSession } from "@/app/admin/_lib/session";

const session = (role) => ({ user: { id: "u1", role, name: "Ana" }, session: { id: "s1" } });

beforeEach(() => {
  getSession.mockReset();
});

describe("requireSession: a sessão", () => {
  it("sem sessão, redireciona a /login com o destino padrão /admin", async () => {
    getSession.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?redirectTo=%2Fadmin");
  });

  it("sem sessão, o destino é o caminho informado, codificado, com a consulta", async () => {
    getSession.mockResolvedValue(null);

    await expect(requireSession({ path: "/admin/conteudo/novo?pai=abc" })).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Fadmin%2Fconteudo%2Fnovo%3Fpai%3Dabc",
    );
  });

  it("sem sessão, o papel exigido não muda o resultado: é o login, e não o 404", async () => {
    getSession.mockResolvedValue(null);

    await expect(requireSession({ role: "admin", path: "/admin/usuarios" })).rejects.toThrow(/^REDIRECT:/);
  });

  it("consulta a sessão com os cabeçalhos da requisição (a validação é no banco, em getSession)", async () => {
    getSession.mockResolvedValue(session("user"));

    await requireSession();

    const received = getSession.mock.calls[0][0];
    expect(received.get("cookie")).toBe("sessao=abc");
  });

  it("com sessão e sem papel exigido, devolve a sessão, seja qual for o papel", async () => {
    getSession.mockResolvedValue(session("user"));
    expect((await requireSession()).user.role).toBe("user");

    getSession.mockResolvedValue(session("admin"));
    expect((await requireSession({ path: "/admin" })).user.role).toBe("admin");
  });
});

describe("requireSession: o papel (RN19)", () => {
  it("papel insuficiente responde notFound(), como se a página não existisse", async () => {
    getSession.mockResolvedValue(session("user"));

    await expect(requireSession({ role: "admin", path: "/admin/usuarios" })).rejects.toThrow("NOT_FOUND");
  });

  it("o papel exigido é atendido: devolve a sessão", async () => {
    getSession.mockResolvedValue(session("admin"));

    const result = await requireSession({ role: "admin", path: "/admin/usuarios" });

    expect(result.user).toMatchObject({ id: "u1", role: "admin" });
  });

  it.each([["Admin"], ["admin,user"], [""], [undefined]])("papel desconhecido (%j) não atende a um papel exigido", async (role) => {
    getSession.mockResolvedValue({ user: { id: "u1", role }, session: {} });

    await expect(requireSession({ role: "admin" })).rejects.toThrow("NOT_FOUND");
    await expect(requireSession({ role: "user" })).rejects.toThrow("NOT_FOUND");
  });

  it("o usuário comum com role: user passa; o administrador com role: user não (o papel é exato)", async () => {
    getSession.mockResolvedValue(session("user"));
    await expect(requireSession({ role: "user" })).resolves.toBeTruthy();

    getSession.mockResolvedValue(session("admin"));
    await expect(requireSession({ role: "user" })).rejects.toThrow("NOT_FOUND");
  });
});

describe("requireSession: a senha provisória (RN21, UC14; CT40)", () => {
  const provisional = (role = "user") => ({ user: { id: "u1", role, mustChangePassword: true }, session: {} });

  it("com a senha provisória, redireciona a /admin/senha com a página pedida no destino", async () => {
    getSession.mockResolvedValue(provisional());

    await expect(requireSession({ path: "/admin/conteudo/novo?pai=abc" })).rejects.toThrow(
      "REDIRECT:/admin/senha?redirectTo=%2Fadmin%2Fconteudo%2Fnovo%3Fpai%3Dabc",
    );
    await expect(requireSession()).rejects.toThrow("REDIRECT:/admin/senha?redirectTo=%2Fadmin");
  });

  it("a página da troca e o layout (allowTemporaryPassword) deixam a sessão com senha provisória passar", async () => {
    getSession.mockResolvedValue(provisional());

    const result = await requireSession({ path: "/admin/senha", allowTemporaryPassword: true });

    expect(result.user.mustChangePassword).toBe(true);
  });

  it("a senha provisória vem antes do papel: um papel insuficiente também é levado à troca", async () => {
    getSession.mockResolvedValue(provisional("user"));

    await expect(requireSession({ role: "admin", path: "/admin/usuarios" })).rejects.toThrow("REDIRECT:/admin/senha");
  });

  it.each([[false], [undefined], [null], [0]])("mustChangePassword %j: nada de redirecionar", async (flag) => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "user", mustChangePassword: flag }, session: {} });

    await expect(requireSession({ path: "/admin/conteudo" })).resolves.toBeTruthy();
  });

  it("sem sessão, o login vem antes da troca da senha", async () => {
    getSession.mockResolvedValue(null);

    await expect(requireSession({ path: "/admin/senha" })).rejects.toThrow("REDIRECT:/login");
  });
});
