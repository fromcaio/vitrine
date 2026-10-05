// @vitest-environment jsdom
// O evento que liga a lista de notificações ao sino (RF33): um CustomEvent da janela.
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNREAD_COUNT_EVENT, announceUnreadCount, onUnreadCount } from "@/components/admin/notification-events";

afterEach(() => vi.restoreAllMocks());

describe("announceUnreadCount e onUnreadCount", () => {
  it("o nome do evento é fixo", () => {
    expect(UNREAD_COUNT_EVENT).toBe("vitrine:notificacoes-nao-lidas");
  });

  it("quem ouve recebe o contador anunciado", () => {
    const listener = vi.fn();
    const stop = onUnreadCount(listener);
    announceUnreadCount(3);
    announceUnreadCount(0);
    expect(listener.mock.calls).toEqual([[3], [0]]);
    stop();
  });

  it("depois de parar de ouvir, não recebe mais", () => {
    const listener = vi.fn();
    onUnreadCount(listener)();
    announceUnreadCount(5);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([[-1], [1.5], ["3"], [null], [undefined], [Number.NaN]])("ignora o valor %j, que não é um inteiro não negativo", (value) => {
    const listener = vi.fn();
    const stop = onUnreadCount(listener);
    announceUnreadCount(value);
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it("ignora um evento de fora com o detail malformado", () => {
    const listener = vi.fn();
    const stop = onUnreadCount(listener);
    window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT, { detail: { unreadCount: "muitas" } }));
    window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT));
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it("vários ouvintes (dois sinos na página) recebem o mesmo anúncio", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onUnreadCount(a);
    const stopB = onUnreadCount(b);
    announceUnreadCount(2);
    expect(a).toHaveBeenCalledWith(2);
    expect(b).toHaveBeenCalledWith(2);
    stopA();
    stopB();
  });
});
