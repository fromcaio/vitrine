// Página /admin/notificacoes (A-014 Parte 3d, item 4; RF33, RN19, RN26, ADR-026; CT50): usa `requireSession`,
// lê SÓ as notificações do usuário da SESSÃO (nunca um identificador da URL), entrega ao `NotificationList`
// da UI a primeira página na forma pública da API (datas em texto, `unreadCount` de todas as não lidas,
// `nextCursor`), com `noindex` e `<h1>`. A sessão e a lista (da UI) são substituídas; o banco é o SQLite
// temporário.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: /** @type {{ id: string } | null} */ (null) }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async (options) => {
    if (!session.user) throw new Error(`REDIRECT:${options?.path}`);
    return { user: session.user };
  }),
}));
vi.mock("@/components/admin/NotificationList", () => ({ NotificationList: () => null }));

import { requireSession } from "@/app/admin/_lib/session";
import { FIRST_PAGE_SIZE, firstNotificationsPage } from "@/app/admin/_lib/notifications";
import NotificationsPage, { metadata } from "@/app/admin/notificacoes/page";
import { NotificationList } from "@/components/admin/NotificationList";
import { dismiss, markRead, notify } from "@/lib/db";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string }} */
let ana;
/** @type {{ id: string }} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  ana = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createTestUser({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
  session.user = ana;
  vi.mocked(requireSession).mockClear();
});

const note = (userId, data = {}, extra = {}) => notify({ userId, type: "MODERATION", severity: "WARNING", data, ...extra });
/** Props do `NotificationList` na árvore da página. */
const listProps = (element) => [element.props.children].flat().find((child) => child?.type === NotificationList).props;
const render = async () => NotificationsPage();

describe("a página", () => {
  it("exige a sessão, com o caminho da própria página para voltar depois do login", async () => {
    await render();

    expect(requireSession).toHaveBeenCalledWith({ path: "/admin/notificacoes" });
  });

  it("sem sessão, redireciona e nada é lido", async () => {
    session.user = null;

    await expect(render()).rejects.toThrow("REDIRECT:/admin/notificacoes");
  });

  it("tem noindex, o título e um <h1>", async () => {
    const page = await render();
    const heading = [page.props.children].flat().find((child) => child?.type === "h1");

    expect(metadata).toEqual({ title: "Notificações", robots: { index: false, follow: false } });
    expect(heading.props.children).toBe("Notificações");
  });

  it("só as notificações DO USUÁRIO DA SESSÃO: as de outro nunca aparecem, nem o contador delas", async () => {
    const mine = await note(ana.id, { title: "Meu texto" });
    await note(beto.id, { title: "Texto do Beto" });
    await note(beto.id, { title: "Outro do Beto" });

    const initial = listProps(await render()).initial;

    expect(initial.items.map((item) => item.id)).toEqual([mine.id]);
    expect(initial.unreadCount).toBe(1);

    // A sessão do outro usuário vê só as dele.
    session.user = beto;
    const other = listProps(await render()).initial;
    expect(other.items).toHaveLength(2);
    expect(other.items.map((item) => item.id)).not.toContain(mine.id);
    expect(other.unreadCount).toBe(2);
  });

  it("a página não recebe parâmetros: nenhum identificador da URL chega às notificações", async () => {
    await note(beto.id);

    // Mesmo com um `searchParams` ou `params` de outro usuário, a função ignora (assinatura sem argumentos).
    expect(NotificationsPage.length).toBe(0);
    expect(listProps(await NotificationsPage({ params: { userId: beto.id }, searchParams: { userId: beto.id } })).initial.items).toEqual([]);
  });
});

describe("firstNotificationsPage: a forma pública da API", () => {
  it("o item tem o texto em português e não leva o dono nem a chave de deduplicação", async () => {
    await note(ana.id, { title: "Aula 1", reason: "Conteúdo fora do tema" }, { dedupeKey: "chave-interna" });

    const [item] = (await firstNotificationsPage(ana.id)).items;

    expect(Object.keys(item).sort()).toEqual(
      ["createdAt", "data", "id", "readAt", "resolvedAt", "severity", "text", "title", "type", "updatedAt"],
    );
    expect(item).not.toHaveProperty("userId");
    expect(item).not.toHaveProperty("dedupeKey");
    expect(item.type).toBe("MODERATION");
    expect(item.severity).toBe("WARNING");
    expect(item.title).not.toBe("");
    expect(item.text).not.toBe("");
  });

  it("as datas vão como texto ISO (um `Date` não atravessa o componente cliente) e `readAt` aparece quando lida", async () => {
    const read = await note(ana.id);
    await markRead(ana.id, [read.id]);

    const [item] = (await firstNotificationsPage(ana.id)).items;

    expect(typeof item.createdAt).toBe("string");
    expect(typeof item.updatedAt).toBe("string");
    expect(typeof item.readAt).toBe("string");
    expect(new Date(item.readAt).toISOString()).toBe(item.readAt);
    expect(item.resolvedAt).toBeNull();
    expect(JSON.parse(JSON.stringify(item))).toEqual(item);
  });

  it("o contador é o de TODAS as não lidas, e não o da página; lidas e dispensadas não contam", async () => {
    for (let i = 0; i < FIRST_PAGE_SIZE + 5; i++) await note(ana.id);
    const all = (await firstNotificationsPage(ana.id, 100)).items;
    await markRead(ana.id, [all[0].id]);
    await dismiss(ana.id, all[1].id);

    const initial = await firstNotificationsPage(ana.id);

    expect(initial.items).toHaveLength(FIRST_PAGE_SIZE);
    expect(initial.unreadCount).toBe(FIRST_PAGE_SIZE + 5 - 2);
  });

  it("20 itens por página e o nextCursor só quando há mais: é o id do último item da página", async () => {
    for (let i = 0; i < FIRST_PAGE_SIZE; i++) await note(ana.id);

    const exact = await firstNotificationsPage(ana.id);
    expect(exact.items).toHaveLength(FIRST_PAGE_SIZE);
    expect(exact.nextCursor).toBeNull();

    await note(ana.id);
    const more = await firstNotificationsPage(ana.id);
    expect(more.items).toHaveLength(FIRST_PAGE_SIZE);
    expect(more.nextCursor).toBe(more.items[FIRST_PAGE_SIZE - 1].id);
  });

  it("o nextCursor continua a lista na API (o cursor é do próprio usuário)", async () => {
    for (let i = 0; i < FIRST_PAGE_SIZE + 3; i++) await note(ana.id);
    const first = await firstNotificationsPage(ana.id);

    const { listNotifications } = await import("@/lib/db");
    const rest = await listNotifications(ana.id, { take: 10, cursor: first.nextCursor ?? undefined });

    expect(rest).toHaveLength(3);
    expect(first.items.map((item) => item.id)).not.toContain(rest[0].id);
  });

  it("sem notificação: lista vazia, zero não lidas e sem cursor", async () => {
    expect(await firstNotificationsPage(ana.id)).toEqual({ items: [], unreadCount: 0, nextCursor: null });
  });

  it("o texto do motivo é entregue como TEXTO (a UI o escapa); a marcação do autor fica nos dados, sem virar HTML aqui", async () => {
    await note(ana.id, { event: "CONTENT_UNPUBLISHED", contentTitle: "Aula", reason: "<b>negrito</b><script>alert(1)</script>" });

    const [item] = (await firstNotificationsPage(ana.id)).items;

    expect(typeof item.text).toBe("string");
    expect(item.text).toContain("Motivo: <b>negrito</b><script>alert(1)</script>");
  });
});
