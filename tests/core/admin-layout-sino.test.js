// Layout do painel ligado ao sino e ao menu (A-014 Parte 3d, item 3; RF33, RN19, RN21; CT50): o contador
// inicial é o de TODAS as não lidas DO USUÁRIO DA SESSÃO (`countUnread`), o papel e a senha provisória
// vêm da sessão, `availablePaths` lista só as páginas que existem, e com a senha provisória o sino não é
// montado (e nem se consulta o contador). Os componentes da UI são os de verdade, renderizados com
// react-dom/server sobre o SQLite temporário; só a sessão e a Server Function de sair são substituídas.
import "./env";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: /** @type {Record<string, unknown> | null} */ (null) }));
vi.mock("@/app/admin/_lib/session", () => ({
  requireSession: vi.fn(async () => {
    if (!session.user) throw new Error("NEXT_REDIRECT");
    return { user: session.user };
  }),
}));
vi.mock("@/app/admin/_lib/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal()), usePathname: () => "/admin" }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, countUnread: vi.fn(actual.countUnread) };
});

import { renderToStaticMarkup } from "react-dom/server";
import AdminLayout from "@/app/admin/layout";
import { availablePathsFor } from "@/app/admin/_lib/menu";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { countUnread, dismiss, markRead, notify } from "@/lib/db";
import { projectRoot } from "../setup/prisma-cli.js";
import { createTestUser, resetDatabase } from "./helpers";

/** @type {{ id: string }} */
let ana;
/** @type {{ id: string }} */
let beto;

beforeEach(async () => {
  await resetDatabase();
  ana = await createTestUser({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createTestUser({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
  vi.mocked(countUnread).mockClear();
  session.user = { id: ana.id, name: "Ana", email: "ana@exemplo.test", role: "user", mustChangePassword: false };
});

const shellOf = async () => (await AdminLayout({ children: "conteúdo" })).props.children;
const note = (userId, extra = {}) => notify({ userId, type: "ACCOUNT", severity: "INFO", data: {}, ...extra });
const html = async () => renderToStaticMarkup(await AdminLayout({ children: "conteúdo" }));

describe("o sino do painel", () => {
  it("o contador inicial é o de TODAS as não lidas do usuário da sessão (não as lidas, resolvidas ou alheias)", async () => {
    await note(ana.id);
    await note(ana.id);
    const read = await note(ana.id);
    await markRead(ana.id, [read.id]);
    const dismissed = await note(ana.id);
    await dismiss(ana.id, dismissed.id);
    for (let i = 0; i < 3; i++) await note(beto.id);

    const { notificationBell } = (await shellOf()).props;

    expect(notificationBell.type).toBe(NotificationBell);
    expect(notificationBell.props.initialUnreadCount).toBe(2);
    expect(countUnread).toHaveBeenCalledWith(ana.id);
  });

  it("o contador mais de 20 (mais que uma página da lista) é o total, não o da página", async () => {
    for (let i = 0; i < 25; i++) await note(ana.id);

    expect((await shellOf()).props.notificationBell.props.initialUnreadCount).toBe(25);
  });

  it("sem notificação, o sino mostra zero", async () => {
    const page = await html();

    expect((await shellOf()).props.notificationBell.props.initialUnreadCount).toBe(0);
    expect(page).toContain("Notificações, nenhuma não lida");
  });

  it("o HTML renderizado traz o sino com o rótulo acessível e o contador", async () => {
    await note(ana.id);
    await note(ana.id);

    const page = await html();

    expect(page).toContain("Notificações, 2 não lidas");
    expect(page).toContain('href="/admin/notificacoes"');
  });

  it("com a senha provisória o sino NÃO é montado, o contador nem é consultado e o menu traz só a troca", async () => {
    session.user = { ...session.user, mustChangePassword: true };
    await note(ana.id);

    const shell = await shellOf();
    const page = await html();

    expect(shell.props.notificationBell).toBeNull();
    expect(shell.props.mustChangePassword).toBe(true);
    expect(countUnread).not.toHaveBeenCalled();
    expect(page).not.toContain("Notificações, ");
    expect(page).toContain("Trocar a senha");
    expect(page).not.toContain("Aparência");
  });
});

describe("o menu por papel e as páginas que existem", () => {
  it("o usuário comum recebe o papel `user` e não vê as Configurações", async () => {
    const shell = await shellOf();
    const page = await html();

    expect(shell.props.role).toBe("user");
    expect(shell.props.availablePaths).toEqual([
      "/admin", "/admin/senha", "/admin/aparencia", "/admin/notificacoes", "/admin/conteudo", "/admin/perfil",
    ]);
    expect(page).not.toContain("Configurações");
  });

  it("o administrador recebe o papel `admin` e a página de Configurações", async () => {
    session.user = { ...session.user, role: "admin" };

    const shell = await shellOf();
    const page = await html();

    expect(shell.props.role).toBe("admin");
    expect(shell.props.availablePaths).toEqual([
      "/admin", "/admin/senha", "/admin/aparencia", "/admin/notificacoes", "/admin/conteudo", "/admin/perfil",
      "/admin/configuracoes", "/admin/usuarios",
    ]);
    expect(page).toContain('href="/admin/configuracoes"');
  });

  it("um papel desconhecido vale como usuário comum (nunca como administrador)", async () => {
    session.user = { ...session.user, role: "ADMIN" };

    const shell = await shellOf();

    expect(shell.props.role).toBe("user");
    expect(shell.props.availablePaths).not.toContain("/admin/configuracoes");
  });

  it("nada fica \"em breve\": o usuário comum tem Conteúdo e Perfil, e o administrador também os Usuários", async () => {
    const user = await html();
    for (const label of ["Conteúdo", "Perfil"]) expect(user).toContain(`href="/admin/${label === "Conteúdo" ? "conteudo" : "perfil"}"`);
    expect(user).not.toContain("em breve");

    session.user = { ...session.user, role: "admin" };
    const admin = await html();
    expect(admin).not.toContain("em breve");
    expect(admin).toContain("href=\"/admin/usuarios\""); // só o administrador a vê (a Parte 3e-2)
    expect(user).not.toContain("href=\"/admin/usuarios\"");
  });

  it("availablePaths só lista páginas que existem em src/app (não inventa rota)", () => {
    for (const role of /** @type {const} */ (["user", "admin"])) {
      for (const href of availablePathsFor(role)) {
        const file = path.join(projectRoot, "src", "app", ...href.split("/").filter(Boolean), "page.js");
        expect(fs.existsSync(file), `${href} → ${file}`).toBe(true);
      }
    }
  });

  it("só o administrador tem a página de Configurações; a lista de um papel não altera a do outro", () => {
    const user = availablePathsFor("user");
    user.push("/admin/x");

    expect(availablePathsFor("user")).not.toContain("/admin/x");
    expect(availablePathsFor("user")).not.toContain("/admin/configuracoes");
    expect(availablePathsFor("admin")).toContain("/admin/configuracoes");
  });
});
