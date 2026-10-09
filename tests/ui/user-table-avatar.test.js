// @vitest-environment jsdom
// Moderação do avatar (RF36, RN19, RN26; ADR-034): a ação "Remover avatar" da `UserTable`, só para o avatar
// de OUTRO usuário e só se existe, pelo `ModerationDialog` (motivo obrigatório), contra
// `DELETE /api/users/:id/avatar?reason=`. Também o `removeAvatar` do cliente e o `avatarImageId` do modelo.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UserTable } from "@/components/admin/UserTable";
import { MESSAGES, removeAvatar } from "@/components/admin/user-client";
import { normalizeUser, permissionsFor } from "@/components/admin/user-model";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** @param {Record<string, unknown>} over */
const row = (over) => ({
  name: String(over.id), email: `${over.id}@exemplo.com`, handle: String(over.id), role: "user", suspended: false, banReason: null, banExpires: null,
  avatarImageId: null, mustChangePassword: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: null, ...over,
});
const ROWS = [
  row({ id: "adm", name: "Chefe", role: "admin", avatarImageId: "av-adm" }),
  row({ id: "ana", name: "Ana Souza", avatarImageId: "av-ana" }),
  row({ id: "bia", name: "Bia Lima" }),
];
const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** @param {(url: string, init: RequestInit) => Response | Promise<Response>} [respond] */
function setup(respond) {
  const fetchMock = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => {
    if (respond) {
      const custom = await respond(String(url), init);
      if (custom) return custom;
    }
    if ((init.method ?? "GET") === "GET") return json({ data: ROWS, total: ROWS.length, limit: 50, offset: 0 });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<UserTable initial={{ data: ROWS, total: ROWS.length, limit: 50, offset: 0 }} currentUserId="adm" activeAdminCount={2} />);
  return fetchMock;
}
const card = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[data-user-id="${id}"]`));
const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));
const removeButton = (/** @type {string} */ name) => screen.getByRole("button", { name: `Remover avatar: ${name}` });
const confirm = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Remover avatar" }));
const reasonField = () => /** @type {HTMLTextAreaElement} */ (within(dialog()).getByLabelText("Motivo"));

describe("a ação 'Remover avatar'", () => {
  it("aparece só para quem TEM avatar e não é a própria conta", () => {
    setup();
    expect(within(card("ana")).getByRole("button", { name: "Remover avatar: Ana Souza" })).toBeTruthy();
    expect(within(card("bia")).queryByRole("button", { name: /^Remover avatar/ })).toBeNull(); // sem avatar
    expect(within(card("adm")).queryByRole("button", { name: /^Remover avatar/ })).toBeNull(); // a própria conta (usa /admin/perfil)
  });

  it("cada linha mostra o avatar (decorativo) ou as iniciais", () => {
    setup();
    expect(card("ana").querySelector("img")?.getAttribute("src")).toBe("/media/av-ana");
    expect(card("ana").querySelector("img")?.getAttribute("alt")).toBe("");
    expect(card("bia").querySelector("img")).toBeNull();
    expect(card("bia").textContent).toContain("BL");
  });

  it("abre o diálogo de moderação: título, o que acontece e o aviso de que a pessoa verá o motivo", () => {
    setup();
    fireEvent.click(removeButton("Ana Souza"));
    expect(screen.getByRole("alertdialog", { name: "Remover o avatar de Ana Souza" })).toBeTruthy();
    expect(within(dialog()).getByText(/A imagem é apagada e as iniciais do nome passam a aparecer/)).toBeTruthy();
    expect(within(dialog()).getByText(/será notificada e verá este motivo/)).toBeTruthy();
    expect(reasonField()).toBeTruthy();
  });

  it("o motivo é obrigatório: vazio ou só espaços não envia", async () => {
    const fetchMock = setup();
    fireEvent.click(removeButton("Ana Souza"));
    confirm();
    expect(await within(dialog()).findByText("Informe o motivo.")).toBeTruthy();
    fireEvent.change(reasonField(), { target: { value: "    " } });
    confirm();
    expect(await within(dialog()).findByText("Informe o motivo.")).toBeTruthy();
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "DELETE")).toHaveLength(0);
    expect(dialog()).toBeTruthy();
  });

  it("confirmar: DELETE /api/users/:id/avatar?reason= com o motivo aparado; a linha perde o avatar e a ação; o aviso é dado", async () => {
    const fetchMock = setup();
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "  Imagem imprópria & ofensiva  " } });
    confirm();
    await waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
    expect(call?.[0]).toBe("/api/users/ana/avatar?reason=Imagem+impr%C3%B3pria+%26+ofensiva");
    expect(new URL(String(call?.[0]), "http://x").searchParams.get("reason")).toBe("Imagem imprópria & ofensiva");
    expect(card("ana").querySelector("img")).toBeNull();
    expect(card("ana").textContent).toContain("AS");
    expect(within(card("ana")).queryByRole("button", { name: /^Remover avatar/ })).toBeNull();
    expect(screen.getByText("O avatar de Ana Souza foi removido. A pessoa foi notificada.")).toBeTruthy();
    // não relê a lista (uma ida ao servidor, não duas)
    expect(fetchMock.mock.calls.filter((c) => (c[1]?.method ?? "GET") === "GET")).toHaveLength(0);
  });

  it("depois de remover, o foco vai ao 'Editar' da linha (o botão saiu da tela)", async () => {
    setup();
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "motivo" } });
    confirm();
    await waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(card("ana")).getByRole("button", { name: "Editar: Ana Souza" })));
  });

  it("cancelar não envia nada e o avatar continua", () => {
    const fetchMock = setup();
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(document.querySelector("dialog")).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "DELETE")).toHaveLength(0);
    expect(card("ana").querySelector("img")).toBeTruthy();
  });

  it("403: a mensagem fica DENTRO do diálogo, que continua aberto com o motivo digitado", async () => {
    setup((url, init) => (init.method === "DELETE" ? json({ error: { code: "FORBIDDEN", message: "x", details: [] } }, 403) : /** @type {any} */ (undefined)));
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "motivo" } });
    confirm();
    expect(await within(dialog()).findByText(MESSAGES.forbidden)).toBeTruthy();
    expect(reasonField().value).toBe("motivo");
    expect(card("ana").querySelector("img")).toBeTruthy();
  });

  it("422 do motivo: a mensagem do servidor aparece no diálogo", async () => {
    setup((url, init) =>
      init.method === "DELETE" ? json({ error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "reason", message: "O motivo é longo demais." }] } }, 422) : /** @type {any} */ (undefined),
    );
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "motivo" } });
    confirm();
    expect(await within(dialog()).findByText("O motivo é longo demais.")).toBeTruthy();
  });

  it("404 (o avatar já foi removido em outro lugar): fecha, diz a razão e relê a lista", async () => {
    const fresh = [ROWS[0], { ...ROWS[1], avatarImageId: null }, ROWS[2]];
    const fetchMock = setup((url, init) => {
      if (init.method === "DELETE") return json({ error: { code: "NOT_FOUND", message: "x", details: [] } }, 404);
      if ((init.method ?? "GET") === "GET") return json({ data: fresh, total: 3, limit: 50, offset: 0 });
      return /** @type {any} */ (undefined);
    });
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "motivo" } });
    confirm();
    await waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    expect(await screen.findByText(MESSAGES.noAvatar)).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => (c[1]?.method ?? "GET") === "GET")).toBe(true));
    await waitFor(() => expect(card("ana").querySelector("img")).toBeNull());
  });

  it("falha de rede: mensagem no diálogo", async () => {
    setup((url, init) => {
      if (init.method === "DELETE") throw new TypeError("sem rede");
      return /** @type {any} */ (undefined);
    });
    fireEvent.click(removeButton("Ana Souza"));
    fireEvent.change(reasonField(), { target: { value: "motivo" } });
    confirm();
    expect(await within(dialog()).findByText(MESSAGES.network)).toBeTruthy();
  });

  it("o nome com HTML é texto no título e no aviso", async () => {
    const evil = [row({ id: "x", name: '<img src=x onerror="alert(1)">', avatarImageId: "av-x" })];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    render(<UserTable initial={{ data: evil, total: 1, limit: 50, offset: 0 }} currentUserId="adm" />);
    fireEvent.click(screen.getByRole("button", { name: 'Remover avatar: <img src=x onerror="alert(1)">' }));
    expect(dialog().querySelector("img")).toBeNull();
    expect(dialog().textContent).toContain('<img src=x onerror="alert(1)">');
  });
});

describe("removeAvatar (cliente)", () => {
  it("DELETE com o motivo codificado na query, sem corpo; 204 dá ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await removeAvatar("u 1/2", "a&b=c d", fetchMock)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/u%201%2F2/avatar?reason=a%26b%3Dc+d");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("404 vira 'no-avatar' (a mensagem é a de não ter avatar, e não a do usuário inexistente)", async () => {
    const result = await removeAvatar("u1", "m", vi.fn().mockResolvedValue(json({ error: { code: "NOT_FOUND" } }, 404)));
    expect(result).toEqual({ ok: false, kind: "no-avatar", message: MESSAGES.noAvatar });
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [429, "rate-limited"],
    [500, "server"],
  ])("%i -> %s", async (status, kind) => {
    const result = await removeAvatar("u1", "m", vi.fn().mockResolvedValue(json({ error: { code: "X" } }, status)));
    expect(result).toMatchObject({ ok: false, kind });
  });

  it("422: a mensagem do campo reason", async () => {
    const result = await removeAvatar("u1", "m", vi.fn().mockResolvedValue(json({ error: { code: "VALIDATION_ERROR", details: [{ field: "reason", message: "Informe o motivo." }] } }, 422)));
    expect(result).toMatchObject({ ok: false, kind: "validation", fields: { reason: "Informe o motivo." } });
  });

  it("rede", async () => {
    expect(await removeAvatar("u1", "m", vi.fn().mockRejectedValue(new Error("x")))).toMatchObject({ ok: false, kind: "network" });
  });
});

describe("o modelo", () => {
  it("normalizeUser: avatarImageId só com forma de identificador", () => {
    expect(normalizeUser({ id: "u", avatarImageId: "clx_9-A" })?.avatarImageId).toBe("clx_9-A");
    for (const value of ["", "../x", "a b", "a/b", 5, null, undefined]) expect(normalizeUser({ id: "u", avatarImageId: value })?.avatarImageId).toBeNull();
  });

  it("permissionsFor: canRemoveAvatar só com avatar e em outra conta", () => {
    const user = normalizeUser({ id: "u", avatarImageId: "a1" });
    expect(user && permissionsFor(user, { currentUserId: "outro" }).canRemoveAvatar).toBe(true);
    expect(user && permissionsFor(user, { currentUserId: "u" }).canRemoveAvatar).toBe(false);
    const bare = normalizeUser({ id: "v" });
    expect(bare && permissionsFor(bare, { currentUserId: "outro" }).canRemoveAvatar).toBe(false);
  });

  it("'media' é um nome reservado: não pode ser handle (o Core faz o mesmo no servidor)", async () => {
    const { RESERVED_HANDLES, handleError } = await import("@/components/admin/user-model");
    expect(RESERVED_HANDLES).toContain("media");
    expect(handleError("media")).toBe('O handle "media" é reservado.');
  });
});
